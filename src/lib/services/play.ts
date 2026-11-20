import { db } from '../db';
import { ApiError } from '../errors';
import { PARTY, type Stage } from '../config';
import { isValidLatLng } from '../geo';
import { isValidMonthYear } from '../date';
import { MAX_ROUND_SCORE, scoreGuess, scoreGuessScratch } from '../scoring';
import { publish } from '../bus';
import {
  assertOwner,
  clueUrl,
  effectiveStage,
  getGame,
  newId,
  originalUrl,
  participantBySid,
  puzzleAt,
  puzzleCount,
  puzzlesOf,
  thumbUrl,
  touchGame,
  type GameRow,
  type GuessRow,
  type ParticipantRow,
  type PuzzleRow,
} from './shared';
import { gameMeta } from './games';
import { ensureBotGuesses } from './demo-bots';
import { revealedPct, warmTiles } from './scratch';

/* ------------------------------------------------------------------ types */

export type GuessView = {
  lat: number;
  lng: number;
  month: number;
  year: number;
  stage: number;
  /** Scratch games: share of the photo the player had revealed (0–100). Null in classic games. */
  scratchPct: number | null;
  distanceKm: number;
  monthDiff: number;
  score: { location: number; date: number; zoom: number; total: number };
};

export type RoundResult = {
  puzzleId: string;
  index: number;
  total: number;
  title: string | null;
  story: string | null;
  originalUrl: string;
  truth: { lat: number; lng: number; month: number; year: number };
  guess: GuessView | null;
};

export const guessView = (g: GuessRow): GuessView => ({
  lat: g.guess_lat,
  lng: g.guess_lng,
  month: g.guess_month,
  year: g.guess_year,
  stage: g.reveal_stage,
  scratchPct: g.scratch_pct,
  distanceKm: g.distance_km,
  monthDiff: g.month_diff,
  score: { location: g.score_location, date: g.score_date, zoom: g.score_zoom, total: g.score },
});

/** Only ever called for a puzzle whose round is revealed (or a finished game). */
export function buildResult(puzzle: PuzzleRow, index: number, total: number, guess: GuessRow | undefined): RoundResult {
  return {
    puzzleId: puzzle.id,
    index,
    total,
    title: puzzle.title,
    story: puzzle.story,
    originalUrl: originalUrl(puzzle.id),
    truth: { lat: puzzle.truth_lat!, lng: puzzle.truth_lng!, month: puzzle.truth_month!, year: puzzle.truth_year! },
    guess: guess ? guessView(guess) : null,
  };
}

/* ------------------------------------------------------------- round state */

export function ensureTeam(gameId: string): ParticipantRow {
  const d = db();
  const hit = d.prepare("SELECT * FROM participants WHERE game_id = ? AND sid IS NULL AND role = 'player'").get(gameId) as ParticipantRow | undefined;
  if (hit) return hit;
  const now = Date.now();
  const id = newId();
  d.prepare("INSERT INTO participants (id, game_id, sid, display_name, role, joined_at, last_seen_at) VALUES (?, ?, NULL, 'team', 'player', ?, ?)").run(id, gameId, now, now);
  return d.prepare('SELECT * FROM participants WHERE id = ?').get(id) as ParticipantRow;
}

export function startRound(game: GameRow, index: number, now = Date.now()) {
  const party = game.mode === 'party';
  if (party && game.play_style === 'scratch') warmTiles(game.id, index); // pre-build this photo's tiles so the first scratch is instant
  db()
    .prepare(
      `UPDATE games SET status='playing', current_round=?, round_state=?, round_stage=1, round_started_at=?, round_deadline=?, revealed_at=NULL, updated_at=? WHERE id=?`,
    )
    .run(index, party ? 'accepting_guesses' : 'showing_crop', now, party ? now + PARTY.roundSeconds * 1000 : null, now, game.id);
}

export function revealRound(game: GameRow, now = Date.now()) {
  db().prepare("UPDATE games SET round_state='revealed', revealed_at=?, updated_at=? WHERE id=? AND round_state != 'revealed'").run(now, now, game.id);
}

/** Moves to the next round, or finishes the game. Caller has verified the current round is revealed. */
export function advanceRound(game: GameRow) {
  const total = puzzleCount(game.id);
  if (game.current_round + 1 >= total) {
    db().prepare("UPDATE games SET status='finished', round_state='revealed', updated_at=? WHERE id=?").run(Date.now(), game.id);
  } else {
    startRound(game, game.current_round + 1);
  }
  touchGame(game.id);
}

/**
 * Lazily applies time-driven party transitions (deadline → reveal; absent host → auto-advance).
 * Called on every read/write path and by the SSE loop, so state is correct even if nobody is polling.
 */
export function tickParty(gameId: string, now = Date.now()): boolean {
  const game = getGame(gameId);
  if (game.mode !== 'party' || game.status !== 'playing') return false;
  // Solo party demo: the simulated players answer on their own, a few seconds apart.
  const botsMoved = ensureBotGuesses(game, now, false);
  if (game.round_state === 'accepting_guesses' && game.round_deadline && now >= game.round_deadline) {
    ensureBotGuesses(game, now, true);
    revealRound(game, now);
    publish(game.id);
    return true;
  }
  if (botsMoved) {
    publish(game.id);
    return true;
  }
  if (game.round_state === 'revealed' && game.revealed_at) {
    const seen = game.host_seen_at ?? game.revealed_at;
    if (now - seen > PARTY.hostAbsentMs && now - game.revealed_at > PARTY.revealAutoAdvanceMs) {
      advanceRound(game);
      publish(game.id);
      return true;
    }
  }
  return false;
}

export function playerParticipants(gameId: string): ParticipantRow[] {
  return db().prepare("SELECT * FROM participants WHERE game_id = ? AND role = 'player' ORDER BY joined_at").all(gameId) as ParticipantRow[];
}

/* ------------------------------------------------------------------ guess */

export type GuessInput = { lat: number; lng: number; month: number; year: number };

/**
 * Validates and records one guess, scoring it on the server. Idempotent: a second submission for the
 * same round and participant never creates or changes a row; it returns the stored guess instead.
 */
export function submitGuess(gameId: string, sid: string, input: GuessInput, now = Date.now()) {
  let game = getGame(gameId);
  if (game.mode === 'party') {
    tickParty(game.id, now);
    game = getGame(gameId);
  }
  if (game.status !== 'playing') throw new ApiError(409, 'bad_state', 'Game is not in play');

  let participant: ParticipantRow | undefined;
  if (game.mode === 'party') {
    participant = participantBySid(game.id, sid);
    if (!participant) throw new ApiError(403, 'not_joined', 'Join the room first');
    if (participant.role === 'host') throw new ApiError(403, 'host_cannot_play', 'The host does not play their own game');
  } else {
    assertOwner(game, sid);
    participant = ensureTeam(game.id);
  }

  const puzzle = puzzleAt(game, game.current_round);
  if (!puzzle) throw new ApiError(409, 'bad_state');

  // Idempotent: a repeat submission (double-tap, refresh, reconnect) returns the stored guess, even after the round closed.
  const prior = db().prepare('SELECT * FROM guesses WHERE puzzle_id = ? AND participant_id = ?').get(puzzle.id, participant.id) as GuessRow | undefined;
  if (prior) return { alreadySubmitted: true, guess: guessView(prior) };

  if (game.round_state !== 'showing_crop' && game.round_state !== 'accepting_guesses') throw new ApiError(409, 'round_closed', 'This round is closed');
  if (game.mode === 'party' && game.round_deadline && now > game.round_deadline + 1000) throw new ApiError(409, 'round_closed', 'This round is closed');

  if (!isValidLatLng(input) || !isValidMonthYear(input)) throw new ApiError(400, 'invalid_input', 'A valid pin, month and year are required');

  const stage: Stage = effectiveStage(game, game.round_deadline ? Math.min(now, game.round_deadline) : now);
  const truth = { lat: puzzle.truth_lat!, lng: puzzle.truth_lng!, month: puzzle.truth_month!, year: puzzle.truth_year! };
  // Scratch games: the bonus comes from the tiles the server released to this player, never from a client-side number.
  const scratchPct = game.mode === 'party' && game.play_style === 'scratch' ? revealedPct(puzzle, participant.id) : null;
  const score = scratchPct === null ? scoreGuess(truth, input, stage) : scoreGuessScratch(truth, input, scratchPct);

  const d = db();
  const res = d
    .prepare(
      `INSERT INTO guesses (id, game_id, puzzle_id, participant_id, guess_lat, guess_lng, guess_month, guess_year, reveal_stage, submitted_at,
         distance_km, month_diff, score_location, score_date, score_zoom, score, scratch_pct)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (puzzle_id, participant_id) DO NOTHING`,
    )
    .run(newId(), game.id, puzzle.id, participant.id, input.lat, input.lng, input.month, input.year, stage, now, score.distanceKm, score.monthDiff, score.location, score.date, score.zoom, score.total, scratchPct);

  const stored = d.prepare('SELECT * FROM guesses WHERE puzzle_id = ? AND participant_id = ?').get(puzzle.id, participant.id) as GuessRow;
  const alreadySubmitted = res.changes === 0;

  if (!alreadySubmitted) {
    if (game.mode === 'party') {
      ensureBotGuesses(game, now, true); // solo demo only (no-op otherwise)
      const players = playerParticipants(game.id).length;
      const answered = (d.prepare('SELECT COUNT(*) c FROM guesses WHERE puzzle_id = ?').get(puzzle.id) as { c: number }).c;
      if (players > 0 && answered >= players) revealRound(game, now); // everyone is in: close early
    } else {
      revealRound(game, now); // shared device reveals immediately
    }
    touchGame(game.id);
    publish(game.id);
  }
  return { alreadySubmitted, guess: guessView(stored) };
}

/* ---------------------------------------------------- shared-device flow */

function assertShared(game: GameRow) {
  if (game.mode === 'party') throw new ApiError(400, 'bad_state', 'Use the room endpoints for party games');
}

export function beginPlay(gameId: string, sid: string) {
  const game = getGame(gameId);
  assertOwner(game, sid);
  assertShared(game);
  if (game.status === 'playing' || game.status === 'finished') return getGame(gameId);
  if (game.status !== 'handoff') throw new ApiError(409, 'bad_state', 'Game is not ready to play');
  db().transaction(() => {
    ensureTeam(game.id);
    startRound(game, 0);
  })();
  touchGame(game.id);
  return getGame(gameId);
}

export function sharedView(gameId: string, sid: string) {
  const game = getGame(gameId);
  assertOwner(game, sid);
  assertShared(game);
  const total = puzzleCount(game.id);
  const meta = gameMeta(game, sid);
  if (game.status !== 'playing') return { game: meta, total, round: null, guessed: false };
  const puzzle = puzzleAt(game, game.current_round)!;
  const team = ensureTeam(game.id);
  const guessed = !!db().prepare('SELECT 1 FROM guesses WHERE puzzle_id = ? AND participant_id = ?').get(puzzle.id, team.id);
  const stage = effectiveStage(game);
  return {
    game: meta,
    total,
    guessed,
    round: { index: game.current_round, state: game.round_state, stage, stageCount: 4, clueUrl: clueUrl(puzzle.id, stage, puzzle.crop_version) },
  };
}

export function revealMore(gameId: string, sid: string) {
  const game = getGame(gameId);
  assertOwner(game, sid);
  assertShared(game);
  if (game.status !== 'playing' || (game.round_state !== 'showing_crop' && game.round_state !== 'accepting_guesses')) throw new ApiError(409, 'round_closed');
  if (game.round_stage < 4) db().prepare('UPDATE games SET round_stage = round_stage + 1, updated_at = ? WHERE id = ?').run(Date.now(), game.id);
  return sharedView(gameId, sid);
}

export function sharedResult(gameId: string, sid: string): RoundResult {
  const game = getGame(gameId);
  assertOwner(game, sid);
  assertShared(game);
  if (game.status !== 'playing' || game.round_state !== 'revealed') throw new ApiError(403, 'not_revealed', 'The answer is not revealed yet');
  const puzzle = puzzleAt(game, game.current_round)!;
  const team = ensureTeam(game.id);
  const g = db().prepare('SELECT * FROM guesses WHERE puzzle_id = ? AND participant_id = ?').get(puzzle.id, team.id) as GuessRow | undefined;
  return { ...buildResult(puzzle, game.current_round, puzzleCount(game.id), g) };
}

export function sharedNext(gameId: string, sid: string) {
  const game = getGame(gameId);
  assertOwner(game, sid);
  assertShared(game);
  if (game.status !== 'playing' || game.round_state !== 'revealed') throw new ApiError(409, 'bad_state', 'Round is not finished');
  advanceRound(game);
  return sharedView(gameId, sid);
}

/** Every round with its truth and the given participant's guess — only for a finished game. */
export function roundsSummary(game: GameRow, participantId: string | null) {
  if (game.status !== 'finished') throw new ApiError(403, 'not_revealed', 'The game is not finished');
  const total = puzzleCount(game.id);
  return puzzlesOf(game.id).map((p, i) => {
    const g = participantId
      ? (db().prepare('SELECT * FROM guesses WHERE puzzle_id = ? AND participant_id = ?').get(p.id, participantId) as GuessRow | undefined)
      : undefined;
    return { ...buildResult(p, i, total, g), thumbUrl: thumbUrl(p.id) };
  });
}

export function sharedSummary(gameId: string, sid: string) {
  const game = getGame(gameId);
  assertOwner(game, sid);
  assertShared(game);
  const team = ensureTeam(game.id);
  const rounds = roundsSummary(game, team.id);
  const totalScore = rounds.reduce((s, r) => s + (r.guess?.score.total ?? 0), 0);
  return { game: gameMeta(game, sid), rounds, totalScore, maxScore: rounds.length * MAX_ROUND_SCORE };
}

export function replay(gameId: string, sid: string) {
  const game = getGame(gameId);
  assertOwner(game, sid);
  assertShared(game);
  if (game.status !== 'finished') throw new ApiError(409, 'bad_state');
  const d = db();
  d.transaction(() => {
    d.prepare('DELETE FROM guesses WHERE game_id = ?').run(game.id);
    d.prepare("UPDATE games SET status='handoff', current_round=0, round_state='ready', round_stage=1, round_started_at=NULL, revealed_at=NULL, updated_at=? WHERE id=?").run(Date.now(), game.id);
  })();
  touchGame(game.id);
  return getGame(gameId);
}
