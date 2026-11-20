import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scoreGuessScratch, scratchBonus } from '@/lib/scoring';
import { SCRATCH } from '@/lib/config';

let S: {
  play: typeof import('@/lib/services/play');
  rooms: typeof import('@/lib/services/rooms');
  shared: typeof import('@/lib/services/shared');
  demo: typeof import('@/lib/services/demo');
  scratch: typeof import('@/lib/services/scratch');
  games: typeof import('@/lib/services/games');
  db: typeof import('@/lib/db');
};
let tmp: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flashback-scratch-'));
  process.env.FLASHBACK_DATA_DIR = tmp;
  S = {
    play: await import('@/lib/services/play'),
    rooms: await import('@/lib/services/rooms'),
    shared: await import('@/lib/services/shared'),
    demo: await import('@/lib/services/demo'),
    scratch: await import('@/lib/services/scratch'),
    games: await import('@/lib/services/games'),
    db: await import('@/lib/db'),
  };
});
afterAll(() => {
  S.db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ME = 'm'.padEnd(32, '0');
const STRANGER = 'x'.padEnd(32, '0');
const GUESS = { lat: 40, lng: 10, month: 3, year: 2020 };

describe('scratch scoring', () => {
  it('the bonus shrinks as more of the photo is revealed', () => {
    expect([0, 10, 11, 25, 26, 45, 46, 70, 71, 100].map((p) => scratchBonus(p))).toEqual([20, 20, 15, 15, 10, 10, 5, 5, 0, 0]);
  });
  it('keeps location and date points, swapping only the bonus', () => {
    const truth = { lat: 10, lng: 10, month: 5, year: 2020 };
    const perfect = scoreGuessScratch(truth, truth, 0);
    expect(perfect).toMatchObject({ location: 50, date: 30, zoom: 20, total: 100 });
    expect(scoreGuessScratch(truth, truth, 60).total).toBe(85);
    expect(scoreGuessScratch(truth, truth, 100).total).toBe(80);
  });
});

async function room(style: 'scratch' | 'classic' = 'scratch') {
  const g = await S.demo.createDemoGame(ME, 'party', 'en', { solo: true, style });
  const code = g.join_code!;
  S.rooms.startRoom(code, ME);
  const puzzle = S.shared.puzzleAt(S.shared.getGame(g.id), 0)!;
  return { g, code, puzzle };
}

describe('scratch games', () => {
  it('are created as scratch, and the room state offers a scratch card instead of a clue', async () => {
    const { g, code, puzzle } = await room();
    expect(S.games.gameMeta(g, ME).playStyle).toBe('scratch');
    const s = S.rooms.roomState(code, ME);
    expect(s.game.playStyle).toBe('scratch');
    expect(s.clue).toBeNull();
    expect(s.scratch).toMatchObject({ cols: SCRATCH.cols, cells: [], pct: 0, puzzleId: puzzle.id });
    expect(s.scratch!.rows).toBeGreaterThanOrEqual(5);
    // nothing in the state carries pixels or answers
    expect(JSON.stringify(s)).not.toMatch(/truth|originalUrl/);
  });

  it('serves a tile only after the player scratched it', async () => {
    const { puzzle } = await room();
    await expect(S.scratch.loadScratchTile(ME, puzzle.id, 5)).rejects.toThrow(); // not scratched yet
    const r = S.scratch.revealCells(S.shared.getGame(puzzle.game_id).id, ME, [5, 6]);
    expect(r.cells).toEqual([5, 6]);
    const tile = await S.scratch.loadScratchTile(ME, puzzle.id, 5);
    expect(tile.subarray(0, 2).toString('hex')).toBe('ffd8'); // a JPEG
    await expect(S.scratch.loadScratchTile(ME, puzzle.id, 7)).rejects.toThrow(); // a neighbour is still hidden
    await expect(S.scratch.loadScratchTile(STRANGER, puzzle.id, 5)).rejects.toThrow(); // strangers get nothing
  });

  it('answers a scratch with the pixels of exactly the tiles just released (one round trip)', async () => {
    const { g, puzzle } = await room();
    const r = S.scratch.revealCells(g.id, ME, [3, 4, 4]);
    const tiles = await S.scratch.tileDataUrls(r.gameId, r.puzzleId, [3, 4, 4]);
    expect(Object.keys(tiles).sort()).toEqual(['3', '4']);
    for (const url of Object.values(tiles)) expect(url.startsWith('data:image/jpeg;base64,/9j/')).toBe(true); // a JPEG
    expect(S.scratch.gridFor(puzzle).cols).toBe(SCRATCH.cols);
  });

  it('rejects bad tiles, and scratching after answering', async () => {
    const { g, code, puzzle } = await room();
    const total = S.scratch.gridFor(puzzle).total;
    expect(() => S.scratch.revealCells(g.id, ME, [total])).toThrow();
    expect(() => S.scratch.revealCells(g.id, ME, [-1])).toThrow();
    expect(() => S.scratch.revealCells(g.id, STRANGER, [1])).toThrow(/Join/);
    S.scratch.revealCells(g.id, ME, [1]);
    S.play.submitGuess(g.id, ME, GUESS);
    expect(S.rooms.roomState(code, ME).game.roundState).toBe('revealed');
    expect(() => S.scratch.revealCells(g.id, ME, [2])).toThrow();
  });

  it('scores from the tiles the server released: a client cannot lower its own scratch share', async () => {
    const { g, puzzle } = await room();
    const total = S.scratch.gridFor(puzzle).total;
    const many = Array.from({ length: Math.ceil(total * 0.5) }, (_, i) => i); // ~50% → bonus 5
    S.scratch.revealCells(g.id, ME, many);
    const res = S.play.submitGuess(g.id, ME, GUESS); // the request carries no scratch figure at all
    expect(res.guess.scratchPct).toBe(Math.round((many.length / total) * 100));
    expect(res.guess.score.zoom).toBe(5);
  });

  it('the simulated players scratch too, and the reveal shows how much', async () => {
    const { g, code } = await room();
    S.play.submitGuess(g.id, ME, GUESS);
    const r = S.rooms.roomState(code, ME);
    const bots = r.result!.guesses.filter((x) => x.simulated);
    expect(bots).toHaveLength(3);
    for (const b of bots) expect(b.scratchPct).not.toBeNull();
    expect(new Set(bots.map((b) => b.scratchPct)).size).toBeGreaterThan(1); // different appetites
    expect(r.result!.guesses.find((x) => !x.simulated)!.scratchPct).toBe(0); // you did not scratch
  });

  it('the finished room has a scoreboard with every round and scratch share', async () => {
    const { g, code } = await room();
    for (let round = 0; round < 3; round++) {
      S.scratch.revealCells(g.id, ME, [0, 1, 2, 3]);
      S.play.submitGuess(g.id, ME, GUESS);
      S.rooms.nextRoom(code, ME);
    }
    const s = S.rooms.roomState(code, ME);
    expect(s.game.status).toBe('finished');
    expect(s.scoreboard).toHaveLength(4);
    for (const row of s.scoreboard!) {
      expect(row.rounds).toHaveLength(3);
      expect(row.total).toBe(row.rounds.reduce((a, r) => a + (r?.score ?? 0), 0));
      for (const r of row.rounds) expect(r!.scratchPct).not.toBeNull();
    }
  });

  it('classic games have no scratch tiles', async () => {
    const { puzzle } = await room('classic');
    await expect(S.scratch.loadScratchTile(ME, puzzle.id, 0)).rejects.toThrow();
  });
});

describe('creating a game with a play style', () => {
  it('only party games can be scratch games', () => {
    expect(S.games.createGame(ME, { mode: 'party', style: 'scratch' }).play_style).toBe('scratch');
    expect(S.games.createGame(ME, { mode: 'party' }).play_style).toBe('classic');
    expect(S.games.createGame(ME, { mode: 'couple', style: 'scratch' }).play_style).toBe('classic');
  });
});
