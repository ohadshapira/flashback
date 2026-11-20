import { db } from '../db';
import { PARTY, type Stage } from '../config';
import { clampMonthYear, maxAllowedMonthYear } from '../date';
import { scoreGuess, scoreGuessScratch } from '../scoring';
import { effectiveStage, newId, puzzleAt, type GameRow, type ParticipantRow, type PuzzleRow } from './shared';

/**
 * Simulated players for the solo party demo. They are plain participants with no session (sid IS NULL), so every
 * existing rule (scoring, leaderboard, one guess per round, reveal rules) applies to them unchanged. Their guesses are
 * deterministic per round and clearly labelled as simulated in the UI. Never used outside demo games.
 */
const NAMES = {
  en: { me: 'You', bots: ['Maya', 'Ben', 'Zoe'] },
  he: { me: 'אתם', bots: ['דנה', 'נועם', 'יעל'] },
} as const;

/** Three kinds of guess; each bot rotates through them so the leaderboard moves. */
const PROFILES = [
  { km: 25, months: 1 }, // right place, almost the right month
  { km: 450, months: 5 }, // right region, about half a year off
  { km: 3200, months: 20 }, // far off
] as const;

/** Scratch demo: how much of the photo each kind of player scratched before answering (percent). */
const SCRATCH_PCTS = [12, 38, 66] as const;

/** Seconds into a (60 s) round at which each bot answers on its own, if the human has not finished first. */
const DELAYS = [7, 13, 24] as const;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

/** Turns the host's demo room into a solo one: the creator becomes a player (and keeps control of the room) with three simulated rivals. */
export function seedSoloParty(gameId: string, ownerSid: string, locale: 'he' | 'en') {
  const d = db();
  const now = Date.now();
  const n = NAMES[locale];
  d.transaction(() => {
    d.prepare("UPDATE participants SET role = 'player', display_name = ? WHERE game_id = ? AND sid = ?").run(n.me, gameId, ownerSid);
    n.bots.forEach((name, i) => {
      d.prepare("INSERT INTO participants (id, game_id, sid, display_name, role, joined_at, last_seen_at) VALUES (?, ?, NULL, ?, 'player', ?, ?)").run(newId(), gameId, name, now + i + 1, now);
    });
  })();
}

export function simulatedPlayers(gameId: string): ParticipantRow[] {
  return db().prepare("SELECT * FROM participants WHERE game_id = ? AND sid IS NULL AND role = 'player' ORDER BY joined_at").all(gameId) as ParticipantRow[];
}

export const isSoloDemo = (gameId: string) => simulatedPlayers(gameId).length > 0;

function botGuess(puzzle: PuzzleRow, botIndex: number, round: number) {
  const rnd = mulberry32(hash(`${puzzle.id}:${botIndex}`));
  const profile = PROFILES[(botIndex + round) % PROFILES.length];
  const km = profile.km * (0.6 + rnd() * 0.8);
  const bearing = rnd() * Math.PI * 2;
  const lat0 = puzzle.truth_lat!;
  const lat = Math.max(-80, Math.min(80, lat0 + (km / 111.2) * Math.cos(bearing)));
  let lng = puzzle.truth_lng! + (km / (111.2 * Math.max(0.2, Math.cos((lat0 * Math.PI) / 180)))) * Math.sin(bearing);
  lng = ((((lng + 180) % 360) + 360) % 360) - 180;
  const offset = Math.max(1, Math.round(profile.months * (0.5 + rnd()))) * (rnd() < 0.5 ? -1 : 1);
  const total = puzzle.truth_year! * 12 + (puzzle.truth_month! - 1) + offset;
  const my = clampMonthYear({ year: Math.floor(total / 12), month: (total % 12) + 1 }, maxAllowedMonthYear());
  return { lat, lng, month: my.month, year: my.year };
}

/**
 * Makes the simulated players answer the current round. Without `force` only the bots whose moment has come answer
 * (so the room fills up over a few seconds); with `force` (the human answered, or time is up) all of them answer now.
 * Returns true when something changed.
 */
export function ensureBotGuesses(game: GameRow, now: number, force: boolean): boolean {
  if (game.mode !== 'party' || game.status !== 'playing' || game.round_state !== 'accepting_guesses' || !game.round_started_at) return false;
  const bots = simulatedPlayers(game.id);
  if (!bots.length) return false;
  const puzzle = puzzleAt(game, game.current_round);
  if (!puzzle) return false;
  const d = db();
  const scale = PARTY.roundSeconds / 60; // honours FLASHBACK_TIME_SCALE
  let changed = false;
  bots.forEach((bot, i) => {
    if (d.prepare('SELECT 1 FROM guesses WHERE puzzle_id = ? AND participant_id = ?').get(puzzle.id, bot.id)) return;
    const dueAt = game.round_started_at! + DELAYS[i % DELAYS.length] * 1000 * scale;
    if (!force && now < dueAt) return;
    const at = force ? Math.min(now, game.round_deadline ?? now) : dueAt;
    const stage: Stage = effectiveStage(game, at);
    const g = botGuess(puzzle, i, game.current_round);
    const truth = { lat: puzzle.truth_lat!, lng: puzzle.truth_lng!, month: puzzle.truth_month!, year: puzzle.truth_year! };
    // the careful bot scratches little, the daring one a lot; each rotates through the kinds so the table moves
    const scratchPct = game.play_style === 'scratch' ? SCRATCH_PCTS[(i + game.current_round) % SCRATCH_PCTS.length] : null;
    const s = scratchPct === null ? scoreGuess(truth, g, stage) : scoreGuessScratch(truth, g, scratchPct);
    const res = d
      .prepare(
        `INSERT INTO guesses (id, game_id, puzzle_id, participant_id, guess_lat, guess_lng, guess_month, guess_year, reveal_stage, submitted_at,
           distance_km, month_diff, score_location, score_date, score_zoom, score, scratch_pct)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (puzzle_id, participant_id) DO NOTHING`,
      )
      .run(newId(), game.id, puzzle.id, bot.id, g.lat, g.lng, g.month, g.year, stage, at, s.distanceKm, s.monthDiff, s.location, s.date, s.zoom, s.total, scratchPct);
    if (res.changes) changed = true;
  });
  return changed;
}

