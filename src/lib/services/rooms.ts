import { db } from '../db';
import { ApiError } from '../errors';
import { LIMITS, PARTY } from '../config';
import { publish } from '../bus';
import {
  assertOwner,
  clueUrl,
  effectiveStage,
  getGame,
  getGameByCode,
  isDemoGame,
  isOwner,
  newId,
  participantBySid,
  puzzleAt,
  puzzleCount,
  puzzlesOf,
  touchGame,
  type GameRow,
  type GuessRow,
  type ParticipantRow,
} from './shared';
import { isSoloDemo, simulatedPlayers } from './demo-bots';
import { scratchView } from './scratch';
import { advanceRound, buildResult, guessView, playerParticipants, roundsSummary, startRound, tickParty, type GuessView } from './play';

export { tickParty };

function cleanName(raw: string): string {
  return raw.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, LIMITS.nameMax);
}

/** Public, minimal info for the join page. Reveals nothing about photos or answers. */
export function roomInfo(code: string) {
  const game = getGameByCode(code);
  const now = Date.now();
  const players = playerParticipants(game.id).length;
  const open = (game.status === 'lobby' || game.status === 'playing') && (game.join_expires_at ?? 0) > now;
  return { code: game.join_code, title: game.title, status: game.status, players, joinable: open && players < LIMITS.maxPartyPlayers };
}

export function joinRoom(code: string, sid: string, rawName: string) {
  const game = getGameByCode(code);
  const existing = participantBySid(game.id, sid);
  if (existing) return { participantId: existing.id, role: existing.role, name: existing.display_name };

  const now = Date.now();
  if ((game.status !== 'lobby' && game.status !== 'playing') || (game.join_expires_at ?? 0) <= now) throw new ApiError(409, 'room_closed', 'This room is closed');
  const players = playerParticipants(game.id);
  if (players.length >= LIMITS.maxPartyPlayers) throw new ApiError(409, 'room_full', 'This room is full');
  const base = cleanName(rawName);
  if (!base) throw new ApiError(400, 'invalid_input', 'Name required');
  const taken = new Set(players.map((p) => p.display_name.toLowerCase()));
  let name = base;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base.slice(0, LIMITS.nameMax - 3)} ${n}`;

  const id = newId();
  db().prepare("INSERT INTO participants (id, game_id, sid, display_name, role, joined_at, last_seen_at) VALUES (?,?,?,?, 'player', ?, ?)").run(id, game.id, sid, name, now, now);
  touchGame(game.id);
  publish(game.id);
  return { participantId: id, role: 'player' as const, name };
}

export function startRoom(code: string, sid: string) {
  const game = getGameByCode(code);
  assertOwner(game, sid);
  if (game.status !== 'lobby') throw new ApiError(409, 'bad_state', 'Room already started');
  if (playerParticipants(game.id).length < 1) throw new ApiError(409, 'no_players', 'Wait for at least one player');
  startRound(game, 0);
  db().prepare('UPDATE games SET host_seen_at = ? WHERE id = ?').run(Date.now(), game.id);
  touchGame(game.id);
  publish(game.id);
}

export function nextRoom(code: string, sid: string) {
  tickParty(getGameByCode(code).id);
  const game = getGameByCode(code);
  assertOwner(game, sid);
  if (game.status !== 'playing' || game.round_state !== 'revealed') throw new ApiError(409, 'bad_state', 'Round is not finished');
  advanceRound(game);
  publish(game.id);
}

export type LeaderboardEntry = { participantId: string; name: string; score: number; rank: number };

function leaderboard(game: GameRow, revealedCount: number): LeaderboardEntry[] {
  const order = new Map(puzzlesOf(game.id).map((p, i) => [p.id, i]));
  const guesses = db().prepare('SELECT * FROM guesses WHERE game_id = ?').all(game.id) as GuessRow[];
  const totals = new Map<string, number>();
  for (const p of playerParticipants(game.id)) totals.set(p.id, 0);
  for (const g of guesses) {
    if ((order.get(g.puzzle_id) ?? 999) < revealedCount && totals.has(g.participant_id)) totals.set(g.participant_id, totals.get(g.participant_id)! + g.score);
  }
  const names = new Map(playerParticipants(game.id).map((p) => [p.id, p.display_name]));
  const rows = [...totals.entries()].map(([participantId, score]) => ({ participantId, name: names.get(participantId)!, score }));
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  let rank = 0;
  let prev = -1;
  return rows.map((r, i) => {
    if (r.score !== prev) rank = i + 1;
    prev = r.score;
    return { ...r, rank };
  });
}

/** Per-player, per-round scores (and, in scratch games, how much each player scratched). Only built for a finished game. */
function scoreboard(game: GameRow) {
  const puzzles = puzzlesOf(game.id);
  const guesses = db().prepare('SELECT * FROM guesses WHERE game_id = ?').all(game.id) as GuessRow[];
  const simulated = new Set(simulatedPlayers(game.id).map((p) => p.id));
  const rows = playerParticipants(game.id).map((p) => {
    const rounds = puzzles.map((pz) => {
      const g = guesses.find((x) => x.puzzle_id === pz.id && x.participant_id === p.id);
      return g ? { score: g.score, scratchPct: g.scratch_pct } : null;
    });
    return { participantId: p.id, name: p.display_name, simulated: simulated.has(p.id), rounds, total: rounds.reduce((s, r) => s + (r?.score ?? 0), 0) };
  });
  return rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

export function markHostSeen(game: GameRow, sid: string | null, now = Date.now()) {
  if (sid && sid === game.owner_sid && now - (game.host_seen_at ?? 0) > 3000) {
    db().prepare('UPDATE games SET host_seen_at = ? WHERE id = ?').run(now, game.id);
  }
}

/**
 * Authoritative room state for one viewer. Truth, original and other players' guesses appear
 * only once the round is revealed. Throws not_joined for strangers.
 */
export function roomState(code: string, sid: string, now = Date.now()) {
  const g0 = getGameByCode(code);
  tickParty(g0.id, now);
  const game = getGame(g0.id);
  const me: ParticipantRow | undefined = participantBySid(game.id, sid);
  if (!me) throw new ApiError(403, 'not_joined', 'Join the room first');
  markHostSeen(game, sid, now);

  const total = puzzleCount(game.id);
  const playing = game.status === 'playing';
  const puzzle = playing ? puzzleAt(game, game.current_round) : undefined;
  const revealed = playing && game.round_state === 'revealed';
  const stage = effectiveStage(game, now);
  const players = playerParticipants(game.id);

  const guessesNow = puzzle ? (db().prepare('SELECT * FROM guesses WHERE puzzle_id = ?').all(puzzle.id) as GuessRow[]) : [];
  const answered = new Set(guessesNow.map((g) => g.participant_id));
  const myGuess = guessesNow.find((g) => g.participant_id === me.id);

  const revealedCount = game.status === 'finished' ? total : playing ? game.current_round + (revealed ? 1 : 0) : 0;
  const simulated = new Set(simulatedPlayers(game.id).map((p) => p.id));
  const board = leaderboard(game, revealedCount).map((e) => ({ ...e, simulated: simulated.has(e.participantId) }));

  let result: (ReturnType<typeof buildResult> & { guesses: (GuessView & { participantId: string; name: string; simulated: boolean })[] }) | null = null;
  if (puzzle && revealed) {
    const names = new Map(players.map((p) => [p.id, p.display_name]));
    result = {
      ...buildResult(puzzle, game.current_round, total, myGuess),
      guesses: guessesNow
        .filter((g) => names.has(g.participant_id))
        .map((g) => ({ ...guessView(g), participantId: g.participant_id, name: names.get(g.participant_id)!, simulated: simulated.has(g.participant_id) })),
    };
  }

  return {
    serverNow: now,
    code: game.join_code,
    game: {
      id: game.id,
      title: game.title,
      status: game.status,
      playStyle: game.play_style,
      total,
      currentRound: game.current_round,
      roundState: game.round_state,
      stage,
      startedAt: game.round_started_at,
      deadline: game.round_deadline,
      roundSeconds: PARTY.roundSeconds,
      stageStartSeconds: PARTY.stageStartSeconds,
      isLast: game.current_round + 1 >= total,
    },
    me: { participantId: me.id, role: me.role, name: me.display_name, submitted: !!myGuess, isOwner: isOwner(game, sid) },
    demo: { enabled: isDemoGame(game.id), solo: isSoloDemo(game.id) },
    players: players.map((p) => ({ id: p.id, name: p.display_name, simulated: simulated.has(p.id), answered: playing && !revealed ? answered.has(p.id) : undefined })),
    answeredCount: answered.size,
    clue: puzzle && playing && game.play_style === 'classic' ? { stage, url: clueUrl(puzzle.id, stage, puzzle.crop_version) } : null,
    scratch: puzzle && playing && !revealed && game.play_style === 'scratch' && me.role === 'player' ? { ...scratchView(puzzle, me.id), puzzleId: puzzle.id } : null,
    result,
    leaderboard: board,
    rounds: game.status === 'finished' ? roundsSummary(game, me.role === 'player' ? me.id : null) : null,
    scoreboard: game.status === 'finished' ? scoreboard(game) : null,
  };
}

/** Used by the SSE route: may the caller listen to this room? */
export function canListen(gameId: string, sid: string): boolean {
  return !!participantBySid(gameId, sid);
}
