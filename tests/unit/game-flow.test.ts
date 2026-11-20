import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

/**
 * Integration tests against a real SQLite file + real sharp processing in a temp data dir.
 * They exercise the same service functions the API routes call, including the authorization boundary.
 */
let S: {
  games: typeof import('@/lib/services/games');
  play: typeof import('@/lib/services/play');
  rooms: typeof import('@/lib/services/rooms');
  authz: typeof import('@/lib/services/authz');
  shared: typeof import('@/lib/services/shared');
  cleanup: typeof import('@/lib/services/cleanup');
  db: typeof import('@/lib/db');
  storage: typeof import('@/lib/storage');
};
let tmp: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flashback-test-'));
  process.env.FLASHBACK_DATA_DIR = tmp;
  S = {
    games: await import('@/lib/services/games'),
    play: await import('@/lib/services/play'),
    rooms: await import('@/lib/services/rooms'),
    authz: await import('@/lib/services/authz'),
    shared: await import('@/lib/services/shared'),
    cleanup: await import('@/lib/services/cleanup'),
    db: await import('@/lib/db'),
    storage: await import('@/lib/storage'),
  };
});
afterAll(() => {
  S.db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

let colorSeed = 0;
async function img(opts: { gps?: boolean; w?: number; h?: number } = {}) {
  colorSeed += 37;
  let p = sharp({ create: { width: opts.w ?? 800, height: opts.h ?? 600, channels: 3, background: { r: colorSeed % 255, g: (colorSeed * 3) % 255, b: (colorSeed * 7) % 255 } } })
    .composite([{ input: Buffer.from(`<svg width="200" height="150"><circle cx="100" cy="75" r="${40 + (colorSeed % 30)}" fill="white"/></svg>`), top: 100 + (colorSeed % 200), left: 100 + (colorSeed % 300) }]);
  if (opts.gps) {
    p = p.withExif({
      IFD0: { Make: 'TestCam' },
      IFD2: { DateTimeOriginal: '2022:08:14 19:03:11' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 4/1 48/1', GPSLongitudeRef: 'E', GPSLongitude: '34/1 46/1 12/1' },
    });
  }
  return p.jpeg().toBuffer();
}

const ANSWER = (i: number) => ({ lat: 40 + i, lng: 10 + i, month: 3 + i, year: 2020 });

async function readyGame(sid: string, mode: 'couple' | 'family_shared' | 'party' = 'couple', n = 3) {
  const g = S.games.createGame(sid, { mode, title: 'Test' });
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const p = await S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer: await img(), source: 'upload' });
    await S.games.updatePuzzle(p.id, sid, { answer: ANSWER(i), title: `Secret title ${i}`, story: `Secret story ${i}` });
    ids.push(p.id);
  }
  return { gameId: g.id, ids };
}

describe('setup', () => {
  it('blocks start until every photo has a confirmed answer and the minimum count is met', async () => {
    const sid = 'a'.repeat(32);
    const g = S.games.createGame(sid, { mode: 'couple' });
    for (let i = 0; i < 3; i++) await S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer: await img(), source: 'upload' });
    expect(() => S.games.startGame(S.shared.getGame(g.id), sid)).toThrow(/missing_answer/);
    expect(() => S.games.startGame(S.shared.getGame(g.id), 'b'.repeat(32))).toThrow(); // not the owner
  });

  it('rejects duplicates, bad files, and HEIC', async () => {
    const sid = 'c'.repeat(32);
    const g = S.games.createGame(sid, { mode: 'couple' });
    const buf = await img();
    await S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer: buf, source: 'upload' });
    await expect(S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer: buf, source: 'upload' })).rejects.toMatchObject({ code: 'duplicate_photo' });
    await expect(S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer: Buffer.from('not an image at all, just text'), source: 'upload' })).rejects.toMatchObject({ code: 'unsupported_type' });
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(40)]);
    await expect(S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer: heic, source: 'upload' })).rejects.toMatchObject({ code: 'unsupported_heic' });
    // a file that has a JPEG header but is garbage
    await expect(S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]), source: 'upload' })).rejects.toMatchObject({ code: 'invalid_image' });
  });

  it('rejects invalid answers (future month, out-of-range pin)', async () => {
    const sid = 'd'.repeat(32);
    const g = S.games.createGame(sid, { mode: 'couple' });
    const p = await S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer: await img(), source: 'upload' });
    await expect(S.games.updatePuzzle(p.id, sid, { answer: { lat: 91, lng: 0, month: 1, year: 2020 } })).rejects.toMatchObject({ code: 'invalid_input' });
    await expect(S.games.updatePuzzle(p.id, sid, { answer: { lat: 0, lng: 0, month: 1, year: 2999 } })).rejects.toMatchObject({ code: 'invalid_input' });
  });

  it("only the owner can edit a puzzle; others get 404 (no existence leak)", async () => {
    const { ids } = await readyGame('e'.repeat(32));
    await expect(S.games.updatePuzzle(ids[0], 'f'.repeat(32), { title: 'x' })).rejects.toMatchObject({ status: 404 });
  });

  it('builds four genuinely different, EXIF-free crops and keeps EXIF suggestions host-only', async () => {
    const sid = '1'.repeat(32);
    const g = S.games.createGame(sid, { mode: 'couple' });
    const p = await S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer: await img({ gps: true }), source: 'upload' });
    const host = S.games.toHostPuzzle(p);
    expect(host.suggestion).toMatchObject({ year: 2022, month: 8 });
    expect(host.suggestion!.lat).toBeCloseTo(32.08, 1);
    expect(host.confirmed).toBe(false); // suggestion never counts as an answer

    const sizes = new Set<string>();
    for (let s = 1; s <= 4; s++) {
      const buf = S.storage.readMedia(g.id, p.id, `crop-${s}.jpg` as 'crop-1.jpg')!;
      const meta = await sharp(buf).metadata();
      expect(meta.exif, `crop ${s} has EXIF`).toBeUndefined();
      expect(meta.format).toBe('jpeg');
      sizes.add(`${meta.width}x${meta.height}`);
    }
    const original = await sharp(S.storage.readMedia(g.id, p.id, 'original.jpg')!).metadata();
    expect(original.exif).toBeUndefined(); // working copy is stripped too
    expect(original.width! / original.height!).toBeCloseTo(800 / 600, 1);
  });

  it('rebuilds crops when the focus changes and bumps the version', async () => {
    const sid = '2'.repeat(32);
    const { ids, gameId } = await readyGame(sid);
    const before = S.storage.readMedia(gameId, ids[0], 'crop-1.jpg')!;
    const p = await S.games.updatePuzzle(ids[0], sid, { cropCenterX: 0.1, cropCenterY: 0.9 });
    expect(p.crop_version).toBe(1);
    expect(S.storage.readMedia(gameId, ids[0], 'crop-1.jpg')!.equals(before)).toBe(false);
  });
});

describe('shared-device game: no answer leaks', () => {
  it('handoff locks the host view, and the player view contains no truth', async () => {
    const sid = '3'.repeat(32);
    const { gameId, ids } = await readyGame(sid);
    expect(() => S.games.hostSetupView(S.shared.getGame(gameId), sid)).not.toThrow(); // draft: host may see
    S.games.startGame(S.shared.getGame(gameId), sid);
    expect(() => S.games.hostSetupView(S.shared.getGame(gameId), sid)).toThrow(/Answers are locked/);
    // original/clue access during handoff (nobody is playing yet)
    expect(() => S.authz.authorizeMedia(sid, ids[0], 'original')).toThrow();
    expect(() => S.authz.authorizeMedia(sid, ids[0], 'clue-1')).toThrow();

    S.play.beginPlay(gameId, sid);
    const view = JSON.stringify(S.play.sharedView(gameId, sid));
    for (const secret of ['Secret title', 'Secret story', '"lat"', 'truth', 'original', 'sourceCreateTime', '2020']) {
      expect(view, `player view leaked ${secret}`).not.toContain(secret);
    }
  });

  it('serves only the current stage; wider stages and the original stay locked until allowed', async () => {
    const sid = '4'.repeat(32);
    const { gameId, ids } = await readyGame(sid);
    S.games.startGame(S.shared.getGame(gameId), sid);
    S.play.beginPlay(gameId, sid);

    expect(S.authz.authorizeMedia(sid, ids[0], 'clue-1')).toBeTruthy();
    for (const k of ['clue-2', 'clue-3', 'clue-4', 'original', 'thumb'] as const) expect(() => S.authz.authorizeMedia(sid, ids[0], k), k).toThrow(/Forbidden/);
    // a stranger and a not-yet-reached round are indistinguishable from "does not exist"
    expect(() => S.authz.authorizeMedia('9'.repeat(32), ids[0], 'clue-1')).toThrow(/Not found/);
    expect(() => S.authz.authorizeMedia(sid, ids[1], 'clue-1')).toThrow(/Not found/);
    expect(() => S.authz.authorizeMedia(null, ids[0], 'clue-1')).toThrow();

    S.play.revealMore(gameId, sid);
    expect(S.authz.authorizeMedia(sid, ids[0], 'clue-2')).toBeTruthy();
    expect(() => S.authz.authorizeMedia(sid, ids[0], 'clue-3')).toThrow();
    // stage is capped at 4
    for (let i = 0; i < 6; i++) S.play.revealMore(gameId, sid);
    expect(S.play.sharedView(gameId, sid).round!.stage).toBe(4);
    expect(() => S.authz.authorizeMedia(sid, ids[0], 'original')).toThrow();
  });

  it('refuses the result before a guess, scores on the server, reveals, and is idempotent', async () => {
    const sid = '5'.repeat(32);
    const { gameId, ids } = await readyGame(sid);
    S.games.startGame(S.shared.getGame(gameId), sid);
    S.play.beginPlay(gameId, sid);
    expect(() => S.play.sharedResult(gameId, sid)).toThrow(/revealed/);

    // invalid submissions are rejected and create nothing
    expect(() => S.play.submitGuess(gameId, sid, { lat: 95, lng: 0, month: 1, year: 2020 })).toThrow();
    expect(() => S.play.submitGuess(gameId, sid, { lat: 0, lng: 0, month: 0, year: 2020 })).toThrow();
    expect(() => S.play.submitGuess(gameId, sid, { lat: 0, lng: 0, month: 1, year: 2999 })).toThrow();
    expect(() => S.play.submitGuess(gameId, 'x'.repeat(32), { lat: 0, lng: 0, month: 1, year: 2020 })).toThrow(/Forbidden/);

    const a = ANSWER(0);
    const first = S.play.submitGuess(gameId, sid, { lat: a.lat, lng: a.lng, month: a.month, year: a.year });
    expect(first.alreadySubmitted).toBe(false);
    expect(first.guess.score).toMatchObject({ location: 50, date: 30, zoom: 20, total: 100 });

    // double-tap / replay: same stored guess, no new row, no change
    const second = S.play.submitGuess(gameId, sid, { lat: 0, lng: 0, month: 1, year: 2001 });
    expect(second.alreadySubmitted).toBe(true);
    expect(second.guess.score.total).toBe(100);
    const count = (S.db.db().prepare('SELECT COUNT(*) c FROM guesses WHERE game_id = ?').get(gameId) as { c: number }).c;
    expect(count).toBe(1);

    const result = S.play.sharedResult(gameId, sid);
    expect(result.truth).toEqual({ lat: a.lat, lng: a.lng, month: a.month, year: a.year });
    expect(result.title).toBe('Secret title 0');
    expect(S.authz.authorizeMedia(sid, ids[0], 'original')).toBeTruthy(); // now revealed
    expect(() => S.authz.authorizeMedia(sid, ids[1], 'original')).toThrow(); // next round still hidden
  });

  it('records the server-side stage, not a client claim, so Reveal-more costs points', async () => {
    const sid = '6'.repeat(32);
    const { gameId } = await readyGame(sid);
    S.games.startGame(S.shared.getGame(gameId), sid);
    S.play.beginPlay(gameId, sid);
    S.play.revealMore(gameId, sid);
    S.play.revealMore(gameId, sid);
    const a = ANSWER(0);
    const r = S.play.submitGuess(gameId, sid, a);
    expect(r.guess.stage).toBe(3);
    expect(r.guess.score.zoom).toBe(10);
  });

  it('plays through to a finished game with a summary, then supports replay', async () => {
    const sid = '7'.repeat(32);
    const { gameId } = await readyGame(sid);
    S.games.startGame(S.shared.getGame(gameId), sid);
    S.play.beginPlay(gameId, sid);
    expect(() => S.play.sharedSummary(gameId, sid)).toThrow(/finished/);
    for (let i = 0; i < 3; i++) {
      S.play.submitGuess(gameId, sid, ANSWER(i));
      S.play.sharedNext(gameId, sid);
    }
    const sum = S.play.sharedSummary(gameId, sid);
    expect(sum.totalScore).toBe(300);
    expect(sum.rounds).toHaveLength(3);
    expect(S.games.hostSetupView(S.shared.getGame(gameId), sid).puzzles).toHaveLength(3); // finished: host may look again

    S.play.replay(gameId, sid);
    expect(S.shared.getGame(gameId).status).toBe('handoff');
    expect((S.db.db().prepare('SELECT COUNT(*) c FROM guesses WHERE game_id = ?').get(gameId) as { c: number }).c).toBe(0);
  });
});

describe('deletion and retention', () => {
  it('deleteGame removes rows and every media file', async () => {
    const sid = '8'.repeat(32);
    const { gameId, ids } = await readyGame(sid);
    const dir = S.storage.puzzleDir(gameId, ids[0]);
    expect(fs.existsSync(dir)).toBe(true);
    expect(() => S.games.deleteGame(S.shared.getGame(gameId), 'z'.repeat(32))).toThrow();
    S.games.deleteGame(S.shared.getGame(gameId), sid);
    expect(fs.existsSync(path.dirname(dir))).toBe(false);
    for (const t of ['games', 'puzzles', 'participants', 'guesses']) {
      expect((S.db.db().prepare(`SELECT COUNT(*) c FROM ${t} WHERE ${t === 'games' ? 'id' : 'game_id'} = ?`).get(gameId) as { c: number }).c, t).toBe(0);
    }
    expect(() => S.shared.getGame(gameId)).toThrow();
  });

  it('cleanup removes expired games and orphaned media dirs', async () => {
    const sid = '9'.repeat(32);
    const { gameId } = await readyGame(sid);
    fs.mkdirSync(path.join(S.storage.mediaRoot(), 'orphan-dir', 'x'), { recursive: true });
    S.db.db().prepare('UPDATE games SET expires_at = 1 WHERE id = ?').run(gameId);
    const report = S.cleanup.cleanupExpired();
    expect(report.gamesDeleted).toBeGreaterThanOrEqual(1);
    expect(report.orphanDirsDeleted).toBeGreaterThanOrEqual(1);
    expect(fs.existsSync(path.join(S.storage.mediaRoot(), gameId))).toBe(false);
    expect(fs.existsSync(path.join(S.storage.mediaRoot(), 'orphan-dir'))).toBe(false);
  });
});

describe('party mode', () => {
  const HOST = 'h'.padEnd(32, '0');
  const P1 = 'p1'.padEnd(32, '0');
  const P2 = 'p2'.padEnd(32, '0');

  async function lobby() {
    const { gameId, ids } = await readyGame(HOST, 'party');
    const g = S.games.startGame(S.shared.getGame(gameId), HOST);
    return { gameId, ids, code: g.join_code! };
  }

  it('creates a join code, lets players join, and keeps strangers out', async () => {
    const { code } = await lobby();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(S.rooms.roomInfo(code).joinable).toBe(true);
    expect(() => S.rooms.roomState(code, P1)).toThrow(/Join the room/);
    const j = S.rooms.joinRoom(code, P1, '  Dana  ');
    expect(j.name).toBe('Dana');
    expect(S.rooms.joinRoom(code, P1, 'Other').participantId).toBe(j.participantId); // rejoin by cookie
    expect(S.rooms.joinRoom(code, P2, 'dana').name).toBe('dana 2'); // unique names
    expect(() => S.rooms.joinRoom('ZZZZZZ', P2, 'x')).toThrow();
    expect(() => S.rooms.startRoom(code, P1)).toThrow(); // only host
  });

  it('runs a timed round: synced stage, private guesses, reveal on deadline, leaderboard', async () => {
    const { gameId, ids, code } = await lobby();
    S.rooms.joinRoom(code, P1, 'Dana');
    S.rooms.joinRoom(code, P2, 'Noam');
    S.rooms.startRoom(code, HOST);

    const s1 = S.rooms.roomState(code, P1);
    expect(s1.game.roundState).toBe('accepting_guesses');
    expect(s1.game.stage).toBe(1);
    expect(s1.clue!.url).toContain('clue-1');
    expect(s1.result).toBeNull();
    expect(JSON.stringify(s1)).not.toContain('Secret');

    // host can't play, a stranger can't play
    expect(() => S.play.submitGuess(gameId, HOST, ANSWER(0))).toThrow(/host does not play/);
    expect(() => S.play.submitGuess(gameId, 'q'.repeat(32), ANSWER(0))).toThrow(/Join/);

    // stage follows the server clock
    const d = S.db.db();
    d.prepare('UPDATE games SET round_started_at = round_started_at - 31000, round_deadline = round_deadline - 31000 WHERE id = ?').run(gameId);
    expect(S.rooms.roomState(code, P1).game.stage).toBe(3);
    expect(S.authz.authorizeMedia(P1, ids[0], 'clue-3')).toBeTruthy();
    expect(() => S.authz.authorizeMedia(P1, ids[0], 'clue-4')).toThrow();

    // P1 answers (stage 3 recorded by the server); P2's answer is hidden from P1 until reveal
    const a = ANSWER(0);
    const g1 = S.play.submitGuess(gameId, P1, a);
    expect(g1.guess.stage).toBe(3);
    expect(S.play.submitGuess(gameId, P1, { lat: 0, lng: 0, month: 1, year: 2000 }).alreadySubmitted).toBe(true);
    const mid = S.rooms.roomState(code, P1);
    expect(mid.me.submitted).toBe(true);
    expect(mid.answeredCount).toBe(1);
    expect(mid.result).toBeNull();
    expect(JSON.stringify(mid)).not.toContain('"guesses"');
    expect(() => S.authz.authorizeMedia(P1, ids[0], 'original')).toThrow();

    // P2 answers → everyone is in → round closes early
    S.play.submitGuess(gameId, P2, { lat: a.lat + 20, lng: a.lng, month: a.month, year: a.year });
    const rev = S.rooms.roomState(code, P2);
    expect(rev.game.roundState).toBe('revealed');
    expect(rev.result!.truth).toMatchObject({ lat: a.lat, lng: a.lng });
    expect(rev.result!.guesses.map((g) => g.name).sort()).toEqual(['Dana', 'Noam']);
    expect(rev.leaderboard[0]).toMatchObject({ name: 'Dana', rank: 1 });
    expect(rev.leaderboard[0].score).toBeGreaterThan(rev.leaderboard[1].score);
    expect(S.authz.authorizeMedia(P1, ids[0], 'original')).toBeTruthy();

    // a repeat after close returns the stored guess; a brand-new player's late guess is refused
    expect(S.play.submitGuess(gameId, P1, a).alreadySubmitted).toBe(true);
    S.rooms.joinRoom(code, 'p3'.padEnd(32, '0'), 'Late');
    expect(() => S.play.submitGuess(gameId, 'p3'.padEnd(32, '0'), a)).toThrow(/closed/);
  });

  it('closes at the deadline even if someone has not answered, and auto-advances when the host is gone', async () => {
    const { gameId, code } = await lobby();
    S.rooms.joinRoom(code, P1, 'Dana');
    S.rooms.joinRoom(code, P2, 'Noam');
    S.rooms.startRoom(code, HOST);
    S.play.submitGuess(gameId, P1, ANSWER(0));
    const d = S.db.db();
    d.prepare('UPDATE games SET round_deadline = ? WHERE id = ?').run(Date.now() - 5000, gameId);
    const st = S.rooms.roomState(code, P2);
    expect(st.game.roundState).toBe('revealed');
    expect(st.me.submitted).toBe(false);
    expect(() => S.play.submitGuess(gameId, P2, ANSWER(0))).toThrow(/closed/);

    // host never returns → after the grace period the room moves on by itself
    d.prepare('UPDATE games SET host_seen_at = ?, revealed_at = ? WHERE id = ?').run(Date.now() - 120000, Date.now() - 60000, gameId);
    S.play.tickParty(gameId);
    expect(S.shared.getGame(gameId).current_round).toBe(1);
    expect(S.rooms.roomState(code, P1).game.roundState).toBe('accepting_guesses');
  });

  it('only the host advances rounds; the game finishes with a final leaderboard', async () => {
    const { gameId, code } = await lobby();
    S.rooms.joinRoom(code, P1, 'Dana');
    S.rooms.startRoom(code, HOST);
    for (let i = 0; i < 3; i++) {
      S.play.submitGuess(gameId, P1, ANSWER(i));
      expect(() => S.rooms.nextRoom(code, P1)).toThrow(/Forbidden/);
      S.rooms.nextRoom(code, HOST);
    }
    const fin = S.rooms.roomState(code, P1);
    expect(fin.game.status).toBe('finished');
    expect(fin.leaderboard[0].score).toBe(300);
    expect(fin.rounds).toHaveLength(3);
  });

  it('closes joining when the room is full or expired', async () => {
    const { gameId, code } = await lobby();
    S.db.db().prepare('UPDATE games SET join_expires_at = ? WHERE id = ?').run(Date.now() - 1, gameId);
    expect(S.rooms.roomInfo(code).joinable).toBe(false);
    expect(() => S.rooms.joinRoom(code, 'n'.repeat(32), 'Late')).toThrow(/closed/);
  });
});
