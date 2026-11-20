import crypto from 'node:crypto';
import { db } from '../db';
import { notFound, forbidden } from '../errors';
import { PARTY, retentionDays, type Stage } from '../config';

export type Mode = 'couple' | 'family_shared' | 'party';
export type GameStatus = 'draft' | 'handoff' | 'lobby' | 'playing' | 'finished' | 'deleted';
export type RoundState = 'ready' | 'showing_crop' | 'accepting_guesses' | 'locked' | 'revealed';

export type GameRow = {
  id: string;
  title: string | null;
  mode: Mode;
  status: GameStatus;
  owner_sid: string;
  join_code: string | null;
  join_expires_at: number | null;
  target_count: number;
  current_round: number;
  round_state: RoundState;
  round_stage: Stage;
  round_started_at: number | null;
  round_deadline: number | null;
  revealed_at: number | null;
  host_seen_at: number | null;
  play_style: 'classic' | 'scratch';
  /** JSON of a PartnersProfile; null for every game that is not a Partners game. */
  partners: string | null;
  created_at: number;
  updated_at: number;
  expires_at: number;
};

export type PuzzleRow = {
  id: string;
  game_id: string;
  ord: number;
  source: 'upload' | 'google_photos' | 'demo';
  source_id: string | null;
  source_create_time: string | null;
  content_hash: string;
  width: number;
  height: number;
  crop_cx: number;
  crop_cy: number;
  crop_version: number;
  truth_lat: number | null;
  truth_lng: number | null;
  truth_year: number | null;
  truth_month: number | null;
  answer_confirmed: 0 | 1;
  suggest_lat: number | null;
  suggest_lng: number | null;
  suggest_year: number | null;
  suggest_month: number | null;
  title: string | null;
  story: string | null;
  created_at: number;
};

export type ParticipantRow = {
  id: string;
  game_id: string;
  sid: string | null;
  display_name: string;
  role: 'host' | 'player';
  joined_at: number;
  last_seen_at: number;
};

export type GuessRow = {
  id: string;
  game_id: string;
  puzzle_id: string;
  participant_id: string;
  guess_lat: number;
  guess_lng: number;
  guess_month: number;
  guess_year: number;
  reveal_stage: Stage;
  submitted_at: number;
  distance_km: number;
  month_diff: number;
  score_location: number;
  score_date: number;
  score_zoom: number;
  score: number;
  scratch_pct: number | null;
};

export const newId = () => crypto.randomBytes(12).toString('base64url');

export function getGame(id: string): GameRow {
  const g = db().prepare("SELECT * FROM games WHERE id = ? AND status != 'deleted'").get(id) as GameRow | undefined;
  if (!g) throw notFound();
  return g;
}

export function getGameByCode(code: string): GameRow {
  const g = db()
    .prepare("SELECT * FROM games WHERE join_code = ? AND status != 'deleted'")
    .get(code.toUpperCase().replace(/[^A-Z0-9]/g, '')) as GameRow | undefined;
  if (!g) throw notFound();
  return g;
}

export const isOwner = (game: GameRow, sid: string | null) => !!sid && sid === game.owner_sid;

/** A built-in sample game (illustrations, not anyone's photos). */
export function isDemoGame(gameId: string): boolean {
  return !!db().prepare("SELECT 1 FROM puzzles WHERE game_id = ? AND source = 'demo' LIMIT 1").get(gameId);
}

export function assertOwner(game: GameRow, sid: string) {
  if (!isOwner(game, sid)) throw forbidden();
}

export function puzzlesOf(gameId: string): PuzzleRow[] {
  return db().prepare('SELECT * FROM puzzles WHERE game_id = ? ORDER BY ord').all(gameId) as PuzzleRow[];
}

export function puzzleAt(game: GameRow, index: number): PuzzleRow | undefined {
  return db().prepare('SELECT * FROM puzzles WHERE game_id = ? ORDER BY ord LIMIT 1 OFFSET ?').get(game.id, index) as PuzzleRow | undefined;
}

export function puzzleCount(gameId: string): number {
  return (db().prepare('SELECT COUNT(*) c FROM puzzles WHERE game_id = ?').get(gameId) as { c: number }).c;
}

export function participantBySid(gameId: string, sid: string | null): ParticipantRow | undefined {
  if (!sid) return undefined;
  return db().prepare('SELECT * FROM participants WHERE game_id = ? AND sid = ?').get(gameId, sid) as ParticipantRow | undefined;
}

export function touchGame(id: string) {
  const now = Date.now();
  db().prepare('UPDATE games SET updated_at = ?, expires_at = ? WHERE id = ?').run(now, now + retentionDays() * 86_400_000, id);
}

export const clueUrl = (puzzleId: string, stage: number, version = 0) => `/api/media/${puzzleId}/clue-${stage}?v=${version}`;
export const originalUrl = (puzzleId: string) => `/api/media/${puzzleId}/original`;
export const thumbUrl = (puzzleId: string) => `/api/media/${puzzleId}/thumb`;

/** The reveal stage currently in force. Party stages are driven purely by server time. */
export function effectiveStage(game: GameRow, now = Date.now()): Stage {
  if (game.mode !== 'party') return game.round_stage;
  if (!game.round_started_at) return 1;
  const elapsed = Math.max(0, now - game.round_started_at);
  let stage: Stage = 1;
  PARTY.stageStartSeconds.forEach((s, i) => {
    if (elapsed >= s * 1000) stage = (i + 1) as Stage;
  });
  return stage;
}

/** Visibility of a puzzle's truth to *players*, by position in the game. */
export function roundPhase(game: GameRow, index: number): 'future' | 'live' | 'revealed' {
  if (game.status === 'finished') return 'revealed';
  if (game.status !== 'playing') return 'future';
  if (index < game.current_round) return 'revealed';
  if (index > game.current_round) return 'future';
  return game.round_state === 'revealed' ? 'revealed' : 'live';
}

export function puzzleIndex(gameId: string, puzzleId: string): number {
  return puzzlesOf(gameId).findIndex((p) => p.id === puzzleId);
}
