import sharp from 'sharp';
import { db } from '../db';
import { ApiError, forbidden, notFound } from '../errors';
import { SCORING, SCRATCH } from '../config';
import { readMedia } from '../storage';
import { getGame, participantBySid, puzzleAt, puzzleIndex, roundPhase, type GameRow, type PuzzleRow } from './shared';
import { tickParty } from './play';

/**
 * Party play style "scratch". The photo is cut into a grid of tiles cut from the widest, metadata-free clue crop.
 * A tile is served to a player only after they scratched it, and the revealed share that decides the score is counted
 * from the tiles the server released, never from a number the client reports. So nothing is merely hidden in the browser.
 */

export function gridFor(puzzle: Pick<PuzzleRow, 'width' | 'height'>) {
  const cols = SCRATCH.cols;
  const rows = Math.min(SCRATCH.maxRows, Math.max(SCRATCH.minRows, Math.round((cols * puzzle.height) / puzzle.width)));
  return { cols, rows, total: cols * rows };
}

export function revealedCells(puzzleId: string, participantId: string): number[] {
  return (db().prepare('SELECT cell FROM scratch_cells WHERE puzzle_id = ? AND participant_id = ? ORDER BY cell').all(puzzleId, participantId) as { cell: number }[]).map((r) => r.cell);
}

/** Share of the photo this player has had revealed so far, as a whole percent (0–100). */
export function revealedPct(puzzle: PuzzleRow, participantId: string): number {
  const { total } = gridFor(puzzle);
  const n = (db().prepare('SELECT COUNT(*) c FROM scratch_cells WHERE puzzle_id = ? AND participant_id = ?').get(puzzle.id, participantId) as { c: number }).c;
  return Math.round((n / total) * 100);
}

/** What the scratch card needs to render. Contains no pixels and no answers. */
export function scratchView(puzzle: PuzzleRow, participantId: string) {
  const g = gridFor(puzzle);
  const cells = revealedCells(puzzle.id, participantId);
  return { cols: g.cols, rows: g.rows, aspect: puzzle.width / puzzle.height, cells, pct: Math.round((cells.length / g.total) * 100), tiers: SCORING.scratch };
}

/** Records tiles the player scratched. Only while their round is live and they have not answered yet. */
export function revealCells(gameId: string, sid: string, cells: number[], now = Date.now()) {
  let game: GameRow = getGame(gameId);
  tickParty(game.id, now);
  game = getGame(gameId);
  if (game.mode !== 'party' || game.play_style !== 'scratch') throw new ApiError(400, 'bad_state', 'This game is not a scratch game');
  const me = participantBySid(game.id, sid);
  if (!me) throw new ApiError(403, 'not_joined', 'Join the room first');
  if (me.role !== 'player') throw new ApiError(403, 'host_cannot_play', 'The host does not play their own game');
  if (game.status !== 'playing' || game.round_state !== 'accepting_guesses') throw new ApiError(409, 'round_closed', 'This round is closed');
  if (game.round_deadline && now > game.round_deadline + 1000) throw new ApiError(409, 'round_closed', 'This round is closed');
  const puzzle = puzzleAt(game, game.current_round);
  if (!puzzle) throw new ApiError(409, 'bad_state');
  if (db().prepare('SELECT 1 FROM guesses WHERE puzzle_id = ? AND participant_id = ?').get(puzzle.id, me.id)) throw new ApiError(409, 'round_closed', 'You already answered this round');

  const { total } = gridFor(puzzle);
  const unique = [...new Set(cells)];
  if (unique.some((c) => !Number.isInteger(c) || c < 0 || c >= total)) throw new ApiError(400, 'invalid_input', 'Unknown tile');
  const ins = db().prepare('INSERT OR IGNORE INTO scratch_cells (puzzle_id, participant_id, cell) VALUES (?, ?, ?)');
  db().transaction(() => unique.forEach((c) => ins.run(puzzle.id, me.id, c)))();
  const all = revealedCells(puzzle.id, me.id);
  return { cells: all, pct: Math.round((all.length / total) * 100), gameId: game.id, puzzleId: puzzle.id };
}

/** Authorization for one tile. Plain 404/403 otherwise, like the rest of the media boundary. */
export function authorizeScratchTile(sid: string | null, puzzleId: string, cell: number): { puzzle: PuzzleRow; game: GameRow } {
  const puzzle = db().prepare('SELECT * FROM puzzles WHERE id = ?').get(puzzleId) as PuzzleRow | undefined;
  if (!puzzle) throw notFound();
  let game = db().prepare("SELECT * FROM games WHERE id = ? AND status != 'deleted'").get(puzzle.game_id) as GameRow | undefined;
  if (!game || game.mode !== 'party' || game.play_style !== 'scratch') throw notFound();
  tickParty(game.id);
  game = getGame(game.id);
  const me = participantBySid(game.id, sid);
  if (!me || me.role !== 'player') throw notFound();
  const { total } = gridFor(puzzle);
  if (!Number.isInteger(cell) || cell < 0 || cell >= total) throw notFound();

  const phase = roundPhase(game, puzzleIndex(game.id, puzzle.id));
  if (phase === 'future') throw notFound();
  if (phase === 'revealed') return { puzzle, game }; // after the reveal the whole photo is shown anyway
  if (!db().prepare('SELECT 1 FROM scratch_cells WHERE puzzle_id = ? AND participant_id = ? AND cell = ?').get(puzzle.id, me.id, cell)) throw forbidden();
  return { puzzle, game };
}

type Raw = { data: Buffer; width: number; height: number; channels: 1 | 2 | 3 | 4 };
// One JPEG decode per photo and one small JPEG per tile, both kept for a while (tiles are ~1 KB each).
const rawCache = new Map<string, Promise<Raw>>();
const tileCache = new Map<string, Promise<Buffer>>();

function remember<T>(cache: Map<string, Promise<T>>, key: string, max: number, make: () => Promise<T>): Promise<T> {
  let p = cache.get(key);
  if (!p) {
    p = make();
    cache.set(key, p);
    if (cache.size > max) cache.delete(cache.keys().next().value!);
    p.catch(() => cache.delete(key));
  }
  return p;
}

function tileFor(game: GameRow, puzzle: PuzzleRow, cell: number): Promise<Buffer> {
  const version = `${puzzle.id}:${puzzle.crop_version}`;
  return remember(tileCache, `${version}:${cell}`, 4000, async () => {
    const raw = await remember(rawCache, version, 6, async () => {
      const src = readMedia(game.id, puzzle.id, 'crop-4.jpg');
      if (!src) throw notFound();
      const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
      return { data, width: info.width, height: info.height, channels: info.channels };
    });
    const { cols, rows } = gridFor(puzzle);
    const col = cell % cols;
    const row = Math.floor(cell / cols);
    const left = Math.floor((col * raw.width) / cols);
    const top = Math.floor((row * raw.height) / rows);
    // 1 px of overlap on the inner edges so no hairline seams show between neighbouring tiles
    const width = Math.min(raw.width - left, Math.floor(((col + 1) * raw.width) / cols) - left + (col < cols - 1 ? 1 : 0));
    const height = Math.min(raw.height - top, Math.floor(((row + 1) * raw.height) / rows) - top + (row < rows - 1 ? 1 : 0));
    // copy the tile's pixel rows straight out of the decoded photo (much cheaper than a pipeline per tile), then encode it
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const px = raw.channels;
    const out = Buffer.allocUnsafe(w * h * px);
    for (let y = 0; y < h; y++) {
      const from = (top + y) * raw.width * px + left * px;
      raw.data.copy(out, y * w * px, from, from + w * px);
    }
    return sharp(out, { raw: { width: w, height: h, channels: px } }).jpeg({ quality: 80 }).toBuffer();
  });
}

/**
 * The tiles a player has just released, as data URLs, so the scratch request answers with the pixels in one round trip
 * (no second request per tile). Only call this for cells that revealCells() has just recorded for that player.
 */
export async function tileDataUrls(gameId: string, puzzleId: string, cells: number[]): Promise<Record<number, string>> {
  const puzzle = db().prepare('SELECT * FROM puzzles WHERE id = ?').get(puzzleId) as PuzzleRow | undefined;
  if (!puzzle) throw notFound();
  const game = getGame(gameId);
  const unique = [...new Set(cells)];
  const bufs = await Promise.all(unique.map((c) => tileFor(game, puzzle, c)));
  return Object.fromEntries(unique.map((c, i) => [c, `data:image/jpeg;base64,${bufs[i].toString('base64')}`]));
}

export async function loadScratchTile(sid: string | null, puzzleId: string, cell: number): Promise<Buffer> {
  const { puzzle, game } = authorizeScratchTile(sid, puzzleId, cell);
  return tileFor(game, puzzle, cell);
}

/**
 * Builds every tile of the current round's photo in the background as soon as a scratch round starts, so the first
 * scratch is answered from memory. Fire and forget: failures are ignored (tiles are then built on demand).
 */
export function warmTiles(gameId: string, roundIndex: number): void {
  void (async () => {
    try {
      const game = getGame(gameId);
      const puzzle = puzzleAt(game, roundIndex);
      if (!puzzle) return;
      const { total } = gridFor(puzzle);
      for (let c = 0; c < total; c += 20) await Promise.all(Array.from({ length: Math.min(20, total - c) }, (_, i) => tileFor(game, puzzle, c + i)));
    } catch {
      /* built on demand instead */
    }
  })();
}
