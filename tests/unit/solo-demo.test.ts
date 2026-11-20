import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** The solo party demo: you play (and run the room) against three simulated players, and the app explains what they did. */
let S: {
  games: typeof import('@/lib/services/games');
  play: typeof import('@/lib/services/play');
  rooms: typeof import('@/lib/services/rooms');
  shared: typeof import('@/lib/services/shared');
  demo: typeof import('@/lib/services/demo');
  db: typeof import('@/lib/db');
};
let tmp: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flashback-solo-'));
  process.env.FLASHBACK_DATA_DIR = tmp;
  S = {
    games: await import('@/lib/services/games'),
    play: await import('@/lib/services/play'),
    rooms: await import('@/lib/services/rooms'),
    shared: await import('@/lib/services/shared'),
    demo: await import('@/lib/services/demo'),
    db: await import('@/lib/db'),
  };
});
afterAll(() => {
  S.db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const ME = 's'.padEnd(32, '0');
const OTHER = 'o'.padEnd(32, '0');
const answer = { lat: 40, lng: 10, month: 3, year: 2020 };
const ageRound = (gameId: string, ms: number) =>
  S.db.db().prepare('UPDATE games SET round_started_at = round_started_at - ?, round_deadline = round_deadline - ? WHERE id = ?').run(ms, ms, gameId);

describe('demo games', () => {
  it('default to three photos and are flagged as demo', async () => {
    const g = await S.demo.createDemoGame(OTHER, 'couple', 'en');
    expect(S.shared.puzzleCount(g.id)).toBe(3);
    expect(S.games.gameMeta(g, OTHER).demo).toBe(true);
    expect(S.games.createGame(OTHER, { mode: 'couple' }).target_count).toBe(3);
  });
});

describe('solo party demo', () => {
  it('seats the creator as a player with three simulated rivals, and keeps them in control of the room', async () => {
    const g = await S.demo.createDemoGame(ME, 'party', 'en', { solo: true });
    const code = g.join_code!;
    const lobby = S.rooms.roomState(code, ME);
    expect(lobby.me).toMatchObject({ role: 'player', isOwner: true, name: 'You' });
    expect(lobby.demo).toEqual({ enabled: true, solo: true });
    expect(lobby.players).toHaveLength(4);
    expect(lobby.players.filter((p) => p.simulated).map((p) => p.name)).toEqual(['Maya', 'Ben', 'Zoe']);
    S.rooms.startRoom(code, ME); // the owner starts it, even though they are a player
  });

  it('the rivals answer on their own over time, then the human answer closes the round with everything explained', async () => {
    const g = await S.demo.createDemoGame(ME, 'party', 'en', { solo: true });
    const code = g.join_code!;
    S.rooms.startRoom(code, ME);

    expect(S.rooms.roomState(code, ME).answeredCount).toBe(0);
    ageRound(g.id, 9_000); // Maya (7 s) has answered
    expect(S.rooms.roomState(code, ME).answeredCount).toBe(1);
    ageRound(g.id, 20_000); // Ben (13 s) and Zoe (24 s) have too
    const waiting = S.rooms.roomState(code, ME);
    expect(waiting.answeredCount).toBe(3);
    expect(waiting.game.roundState).toBe('accepting_guesses'); // still waiting for the human
    expect(waiting.result).toBeNull(); // nobody's guess is visible before the reveal
    expect(JSON.stringify(waiting)).not.toContain('"guesses"');

    S.play.submitGuess(g.id, ME, answer);
    const r = S.rooms.roomState(code, ME);
    expect(r.game.roundState).toBe('revealed');
    expect(r.result!.guesses).toHaveLength(4);
    expect(r.result!.guesses.filter((x) => x.simulated).map((x) => x.name).sort()).toEqual(['Ben', 'Maya', 'Zoe']);
    for (const x of r.result!.guesses.filter((y) => y.simulated)) {
      expect(x.score.total).toBeGreaterThanOrEqual(0);
      expect(x.stage).toBeGreaterThanOrEqual(1);
    }
    expect(r.leaderboard.filter((e) => e.simulated)).toHaveLength(3);

    // the owner (a player) moves the room on
    S.rooms.nextRoom(code, ME);
    expect(S.rooms.roomState(code, ME).game.currentRound).toBe(1);
  });

  it('when the human is quick, the rivals answer at once so the round does not stall', async () => {
    const g = await S.demo.createDemoGame(ME, 'party', 'en', { solo: true });
    const code = g.join_code!;
    S.rooms.startRoom(code, ME);
    S.play.submitGuess(g.id, ME, answer); // straight away, before any rival's moment
    const r = S.rooms.roomState(code, ME);
    expect(r.game.roundState).toBe('revealed');
    expect(r.result!.guesses).toHaveLength(4);
  });

  it('on timeout the rivals still answer; the human simply has no guess', async () => {
    const g = await S.demo.createDemoGame(ME, 'party', 'en', { solo: true });
    const code = g.join_code!;
    S.rooms.startRoom(code, ME);
    ageRound(g.id, 61_000);
    const r = S.rooms.roomState(code, ME);
    expect(r.game.roundState).toBe('revealed');
    expect(r.result!.guesses.filter((x) => x.simulated)).toHaveLength(3);
    expect(r.result!.guess).toBeNull();
  });

  it('a normal (non-solo) demo party keeps the host out of play and has no rivals', async () => {
    const g = await S.demo.createDemoGame(ME, 'party', 'en');
    const code = g.join_code!;
    const s = S.rooms.roomState(code, ME);
    expect(s.me.role).toBe('host');
    expect(s.demo.solo).toBe(false);
    expect(s.players).toHaveLength(0);
  });
});
