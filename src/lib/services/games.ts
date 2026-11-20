import crypto from 'node:crypto';
import { db } from '../db';
import { ApiError } from '../errors';
import { LIMITS, PARTY, retentionDays } from '../config';
import { isValidLatLng } from '../geo';
import { isValidMonthYear } from '../date';
import { buildCrops, processImage, type PhotoSuggestion } from '../images';
import { deleteGameMedia, deletePuzzleMedia, readMedia, writeMedia } from '../storage';
import { publish } from '../bus';
import {
  assertOwner,
  clueUrl,
  getGame,
  isDemoGame,
  newId,
  originalUrl,
  participantBySid,
  puzzleCount,
  puzzlesOf,
  thumbUrl,
  type GameRow,
  type Mode,
  type PuzzleRow,
} from './shared';

export function createGame(sid: string, input: { mode: Mode; title?: string; targetCount?: number; style?: 'classic' | 'scratch' }): GameRow {
  const d = db();
  const mine = (d.prepare('SELECT COUNT(*) c FROM games WHERE owner_sid = ?').get(sid) as { c: number }).c;
  if (mine >= 30) throw new ApiError(429, 'too_many_games', 'Too many games on this device; delete some first');
  const now = Date.now();
  const id = newId();
  d.prepare(
    `INSERT INTO games (id, title, mode, status, owner_sid, target_count, play_style, created_at, updated_at, expires_at)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.title || null, input.mode, sid, input.targetCount ?? LIMITS.defaultPhotos, input.mode === 'party' && input.style === 'scratch' ? 'scratch' : 'classic', now, now, now + retentionDays() * 86_400_000);
  return getGame(id);
}

export function updateGameTitle(game: GameRow, sid: string, title: string | null) {
  assertOwner(game, sid);
  if (game.status !== 'draft') throw new ApiError(409, 'game_locked', 'Game can no longer be edited');
  db().prepare('UPDATE games SET title = ?, updated_at = ? WHERE id = ?').run(title || null, Date.now(), game.id);
}

export function assertDraft(game: GameRow) {
  if (game.status !== 'draft') throw new ApiError(409, 'game_locked', 'Game can no longer be edited');
}

/** Safe-for-anyone metadata. Contains no answers. */
export function gameMeta(game: GameRow, sid: string | null) {
  const owner = !!sid && sid === game.owner_sid;
  return {
    id: game.id,
    title: owner ? game.title : null, // a private label: owner only
    mode: game.mode,
    playStyle: game.play_style,
    status: game.status,
    photoCount: puzzleCount(game.id),
    targetCount: game.target_count,
    currentRound: game.current_round,
    isOwner: owner,
    demo: isDemoGame(game.id),
    joinCode: owner ? game.join_code : null,
    expiresAt: game.expires_at,
    retentionDays: retentionDays(),
  };
}

export type AddPhotoInput = {
  buffer: Buffer;
  source: 'upload' | 'google_photos' | 'demo';
  sourceId?: string | null;
  sourceCreateTime?: string | null;
  /** Used by demo seeding only. */
  preset?: { lat: number; lng: number; month: number; year: number; title?: string; story?: string; cropCenterX?: number; cropCenterY?: number };
};

/** ISO-8601 → {year, month} by string parsing (no Date, so no time-zone drift). */
export function suggestionFromIso(iso: string | null | undefined): Pick<PhotoSuggestion, 'year' | 'month'> {
  const m = /^(\d{4})-(\d{2})/.exec(iso ?? '');
  if (!m) return { year: null, month: null };
  const year = Number(m[1]);
  const month = Number(m[2]);
  return year >= LIMITS.minYear && month >= 1 && month <= 12 ? { year, month } : { year: null, month: null };
}

export async function addPhoto(game: GameRow, sid: string, input: AddPhotoInput): Promise<PuzzleRow> {
  assertOwner(game, sid);
  assertDraft(game);
  const d = db();
  if (puzzleCount(game.id) >= LIMITS.maxPhotos) throw new ApiError(409, 'too_many_photos', 'Photo limit reached');
  if (input.sourceId && d.prepare('SELECT 1 FROM puzzles WHERE game_id = ? AND source_id = ?').get(game.id, input.sourceId)) {
    throw new ApiError(409, 'duplicate_photo', 'This photo was already added');
  }

  const img = await processImage(input.buffer);
  if (d.prepare('SELECT 1 FROM puzzles WHERE game_id = ? AND content_hash = ?').get(game.id, img.hash)) {
    throw new ApiError(409, 'duplicate_photo', 'This photo was already added');
  }

  const id = newId();
  const fromIso = suggestionFromIso(input.sourceCreateTime);
  const sug = { ...img.suggestion, year: img.suggestion.year ?? fromIso.year, month: img.suggestion.month ?? fromIso.month };
  const p = input.preset;
  const cx = p?.cropCenterX ?? 0.5;
  const cy = p?.cropCenterY ?? 0.5;
  const crops = await buildCrops(img.original, cx, cy);

  writeMedia(game.id, id, 'original.jpg', img.original);
  writeMedia(game.id, id, 'thumb.jpg', img.thumb);
  crops.forEach((c, i) => writeMedia(game.id, id, `crop-${i + 1}.jpg` as 'crop-1.jpg', c));

  try {
    const ord = puzzleCount(game.id);
    d.prepare(
      `INSERT INTO puzzles (id, game_id, ord, source, source_id, source_create_time, content_hash, width, height, crop_cx, crop_cy, crop_version,
         truth_lat, truth_lng, truth_year, truth_month, answer_confirmed, suggest_lat, suggest_lng, suggest_year, suggest_month, title, story, created_at)
       VALUES (@id, @game_id, @ord, @source, @source_id, @sct, @hash, @w, @h, @cx, @cy, 0, @tlat, @tlng, @tyear, @tmonth, @confirmed, @slat, @slng, @syear, @smonth, @title, @story, @now)`,
    ).run({
      id,
      game_id: game.id,
      ord,
      source: input.source,
      source_id: input.sourceId ?? null,
      sct: input.sourceCreateTime ?? null,
      hash: img.hash,
      w: img.width,
      h: img.height,
      cx,
      cy,
      tlat: p?.lat ?? null,
      tlng: p?.lng ?? null,
      tyear: p?.year ?? null,
      tmonth: p?.month ?? null,
      confirmed: p ? 1 : 0,
      slat: sug.lat,
      slng: sug.lng,
      syear: sug.year,
      smonth: sug.month,
      title: p?.title ?? null,
      story: p?.story ?? null,
      now: Date.now(),
    });
  } catch (e) {
    deletePuzzleMedia(game.id, id);
    if (e instanceof Error && /UNIQUE/.test(e.message)) throw new ApiError(409, 'duplicate_photo', 'This photo was already added');
    throw e;
  }
  return d.prepare('SELECT * FROM puzzles WHERE id = ?').get(id) as PuzzleRow;
}

export function getPuzzleForOwner(puzzleId: string, sid: string): { puzzle: PuzzleRow; game: GameRow } {
  const puzzle = db().prepare('SELECT * FROM puzzles WHERE id = ?').get(puzzleId) as PuzzleRow | undefined;
  if (!puzzle) throw new ApiError(404, 'not_found');
  const game = getGame(puzzle.game_id);
  // Same 404 for "not yours" as for "does not exist".
  if (game.owner_sid !== sid) throw new ApiError(404, 'not_found');
  assertDraft(game);
  return { puzzle, game };
}

/** One photo for the details/crop screens, with its neighbours so the wizard can flow photo → photo → review. */
export function puzzleInfo(puzzleId: string, sid: string) {
  const { puzzle, game } = getPuzzleForOwner(puzzleId, sid);
  const list = puzzlesOf(game.id);
  const index = list.findIndex((p) => p.id === puzzle.id);
  return { gameId: game.id, mode: game.mode, index, total: list.length, nextId: list[index + 1]?.id ?? null, puzzle: toHostPuzzle(puzzle) };
}

export type PuzzlePatch = {
  answer?: { lat: number; lng: number; month: number; year: number };
  title?: string | null;
  story?: string | null;
  cropCenterX?: number;
  cropCenterY?: number;
};

export async function updatePuzzle(puzzleId: string, sid: string, patch: PuzzlePatch): Promise<PuzzleRow> {
  const { puzzle, game } = getPuzzleForOwner(puzzleId, sid);
  const d = db();

  if (patch.answer) {
    const a = patch.answer;
    if (!isValidLatLng(a) || !isValidMonthYear(a)) throw new ApiError(400, 'invalid_input', 'Invalid answer');
    d.prepare('UPDATE puzzles SET truth_lat=?, truth_lng=?, truth_month=?, truth_year=?, answer_confirmed=1 WHERE id=?').run(a.lat, a.lng, a.month, a.year, puzzle.id);
  }
  if (patch.title !== undefined) d.prepare('UPDATE puzzles SET title=? WHERE id=?').run(patch.title || null, puzzle.id);
  if (patch.story !== undefined) d.prepare('UPDATE puzzles SET story=? WHERE id=?').run(patch.story || null, puzzle.id);

  const cx = patch.cropCenterX ?? puzzle.crop_cx;
  const cy = patch.cropCenterY ?? puzzle.crop_cy;
  if (cx !== puzzle.crop_cx || cy !== puzzle.crop_cy) {
    await rebuildCrops(game.id, puzzle.id, cx, cy);
    d.prepare('UPDATE puzzles SET crop_cx=?, crop_cy=?, crop_version=crop_version+1 WHERE id=?').run(cx, cy, puzzle.id);
  }
  d.prepare('UPDATE games SET updated_at=? WHERE id=?').run(Date.now(), game.id);
  return d.prepare('SELECT * FROM puzzles WHERE id = ?').get(puzzle.id) as PuzzleRow;
}

export async function rebuildCrops(gameId: string, puzzleId: string, cx: number, cy: number) {
  const original = readMedia(gameId, puzzleId, 'original.jpg');
  if (!original) throw new ApiError(404, 'not_found');
  const crops = await buildCrops(original, cx, cy);
  crops.forEach((c, i) => writeMedia(gameId, puzzleId, `crop-${i + 1}.jpg` as 'crop-1.jpg', c));
}

export function removePuzzle(puzzleId: string, sid: string) {
  const { puzzle, game } = getPuzzleForOwner(puzzleId, sid);
  const d = db();
  d.transaction(() => {
    d.prepare('DELETE FROM puzzles WHERE id = ?').run(puzzle.id);
    puzzlesOf(game.id).forEach((p, i) => d.prepare('UPDATE puzzles SET ord = ? WHERE id = ?').run(i, p.id));
  })();
  deletePuzzleMedia(game.id, puzzle.id);
}

export function reorderPuzzles(game: GameRow, sid: string, ids: string[]) {
  assertOwner(game, sid);
  assertDraft(game);
  const current = puzzlesOf(game.id).map((p) => p.id);
  if (ids.length !== current.length || new Set(ids).size !== ids.length || !ids.every((i) => current.includes(i))) {
    throw new ApiError(400, 'invalid_input', 'Order must list every photo exactly once');
  }
  const d = db();
  d.transaction(() => ids.forEach((id, i) => d.prepare('UPDATE puzzles SET ord = ? WHERE id = ?').run(i, id)))();
}

export type HostPuzzle = {
  id: string;
  order: number;
  source: PuzzleRow['source'];
  width: number;
  height: number;
  cropCenterX: number;
  cropCenterY: number;
  cropVersion: number;
  answer: { lat: number; lng: number; month: number; year: number } | null;
  confirmed: boolean;
  suggestion: PhotoSuggestion | null;
  sourceCreateTime: string | null;
  title: string | null;
  story: string | null;
  urls: { thumb: string; original: string; clues: string[] };
};

export function toHostPuzzle(p: PuzzleRow): HostPuzzle {
  const hasAnswer = p.truth_lat !== null && p.truth_lng !== null && p.truth_month !== null && p.truth_year !== null;
  const hasSug = p.suggest_lat !== null || p.suggest_year !== null;
  return {
    id: p.id,
    order: p.ord,
    source: p.source,
    width: p.width,
    height: p.height,
    cropCenterX: p.crop_cx,
    cropCenterY: p.crop_cy,
    cropVersion: p.crop_version,
    answer: hasAnswer ? { lat: p.truth_lat!, lng: p.truth_lng!, month: p.truth_month!, year: p.truth_year! } : null,
    confirmed: !!p.answer_confirmed && hasAnswer,
    suggestion: hasSug ? { lat: p.suggest_lat, lng: p.suggest_lng, year: p.suggest_year, month: p.suggest_month } : null,
    sourceCreateTime: p.source_create_time,
    title: p.title,
    story: p.story,
    urls: {
      thumb: thumbUrl(p.id),
      original: originalUrl(p.id),
      clues: [1, 2, 3, 4].map((s) => clueUrl(p.id, s, p.crop_version)),
    },
  };
}

/**
 * The host's setup view — includes the answers, so it is only available while the game is a draft
 * (or finished). Once handed to a player, even the owner's device is refused.
 */
export function hostSetupView(game: GameRow, sid: string) {
  assertOwner(game, sid);
  if (game.status !== 'draft' && game.status !== 'finished') throw new ApiError(403, 'answers_locked', 'Answers are locked while the game is in play');
  const puzzles = puzzlesOf(game.id).map(toHostPuzzle);
  return { game: gameMeta(game, sid), puzzles, problems: startProblems(game, puzzles) };
}

export function startProblems(game: GameRow, puzzles: { confirmed: boolean; id: string }[]): { code: string; puzzleIds?: string[] }[] {
  const out: { code: string; puzzleIds?: string[] }[] = [];
  if (puzzles.length < LIMITS.minPhotos) out.push({ code: 'too_few_photos' });
  const missing = puzzles.filter((p) => !p.confirmed).map((p) => p.id);
  if (missing.length) out.push({ code: 'missing_answer', puzzleIds: missing });
  return out;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateJoinCode(): string {
  const d = db();
  for (let i = 0; i < 20; i++) {
    let code = '';
    for (let j = 0; j < 6; j++) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!d.prepare('SELECT 1 FROM games WHERE join_code = ?').get(code)) return code;
  }
  throw new ApiError(500, 'server_error');
}

export function startGame(game: GameRow, sid: string) {
  assertOwner(game, sid);
  assertDraft(game);
  const puzzles = puzzlesOf(game.id).map(toHostPuzzle);
  const problems = startProblems(game, puzzles);
  if (problems.length) throw new ApiError(409, 'not_ready', problems.map((p) => p.code).join(','));
  const d = db();
  const now = Date.now();
  if (game.mode === 'party') {
    const code = generateJoinCode();
    d.transaction(() => {
      d.prepare("UPDATE games SET status='lobby', join_code=?, join_expires_at=?, host_seen_at=?, updated_at=? WHERE id=?").run(code, now + PARTY.joinWindowMs, now, now, game.id);
      if (!participantBySid(game.id, sid)) {
        d.prepare("INSERT INTO participants (id, game_id, sid, display_name, role, joined_at, last_seen_at) VALUES (?,?,?,?, 'host', ?, ?)").run(newId(), game.id, sid, 'host', now, now);
      }
    })();
  } else {
    d.prepare("UPDATE games SET status='handoff', updated_at=? WHERE id=?").run(now, game.id);
  }
  publish(game.id);
  return getGame(game.id);
}

/** Deletes DB rows (cascade: puzzles, guesses, participants, google sessions) and every media file. */
export function deleteGame(game: GameRow, sid: string) {
  assertOwner(game, sid);
  destroyGame(game.id);
}

export function destroyGame(gameId: string) {
  db().prepare('DELETE FROM games WHERE id = ?').run(gameId);
  deleteGameMedia(gameId);
  publish(gameId);
}
