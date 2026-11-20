import { expect, test } from '@playwright/test';
import sharp from 'sharp';
import { createDemo } from './helpers';

/** Permission tests against the running server: a player cannot reach the answer before the reveal. */
test.describe('no answer leaks (API level)', () => {
  test('shared-device game', async ({ playwright, baseURL }) => {
    const owner = await playwright.request.newContext({ baseURL });
    const stranger = await playwright.request.newContext({ baseURL });
    const game = await createDemo(owner, 'couple');

    // handoff: even the owner's device cannot read answers or originals
    expect((await owner.get(`/api/games/${game.id}/setup`)).status()).toBe(403);
    expect((await owner.get(`/api/games/${game.id}/round/current`)).ok()).toBeTruthy();
    expect((await owner.post(`/api/games/${game.id}/play`)).ok()).toBeTruthy();

    const view = await owner.get(`/api/games/${game.id}/round/current`);
    const body = await view.text();
    for (const secret of ['truth', '"lat"', '"lng"', 'original', 'story', 'sourceCreateTime', 'suggest']) expect(body).not.toContain(secret);
    const { round } = JSON.parse(body);
    const puzzleId = /media\/([^/]+)\//.exec(round.clueUrl)![1];

    // stage gating + origin
    expect((await owner.get(`/api/media/${puzzleId}/clue-1`)).status()).toBe(200);
    for (const k of ['clue-2', 'clue-3', 'clue-4', 'original', 'thumb']) expect([403, 404], k).toContain((await owner.get(`/api/media/${puzzleId}/${k}`)).status());
    // a stranger (other cookie) gets nothing at all, even knowing the ids
    for (const k of ['clue-1', 'original']) expect((await stranger.get(`/api/media/${puzzleId}/${k}`)).status(), k).toBe(404);
    expect((await stranger.get(`/api/games/${game.id}/round/current`)).status()).toBe(403);
    expect((await stranger.post(`/api/games/${game.id}/guess`, { data: { lat: 1, lng: 1, month: 1, year: 2020 } })).status()).toBe(403);
    expect((await stranger.get(`/api/games/${game.id}/setup`)).status()).toBe(403);
    expect((await stranger.delete(`/api/games/${game.id}`)).status()).toBe(403);
    expect((await owner.get(`/api/games/${game.id}/round/result`)).status()).toBe(403); // not revealed yet

    // validation
    for (const bad of [{ lat: 91, lng: 0, month: 1, year: 2020 }, { lat: 0, lng: 181, month: 1, year: 2020 }, { lat: 0, lng: 0, month: 13, year: 2020 }, { lat: 0, lng: 0, month: 1, year: 2999 }, { lat: 0, lng: 0, month: 1 }, { month: 1, year: 2020 }]) {
      const r = await owner.post(`/api/games/${game.id}/guess`, { data: bad });
      expect(r.status(), JSON.stringify(bad)).toBe(400);
    }

    // one answer; repeats are idempotent and change nothing
    const first = await owner.post(`/api/games/${game.id}/guess`, { data: { lat: 32.08, lng: 34.77, month: 8, year: 2022 } });
    const a = await first.json();
    expect(first.ok()).toBeTruthy();
    expect(a.alreadySubmitted).toBe(false);
    const again = await (await owner.post(`/api/games/${game.id}/guess`, { data: { lat: 0, lng: 0, month: 1, year: 2001 } })).json();
    expect(again.alreadySubmitted).toBe(true);
    expect(again.guess.score.total).toBe(a.guess.score.total);

    // now revealed: original is reachable for the owner, and carries no EXIF
    expect((await owner.get(`/api/media/${puzzleId}/original`)).status()).toBe(200);
    expect((await stranger.get(`/api/media/${puzzleId}/original`)).status()).toBe(404);
    const clue = await (await owner.get(`/api/media/${puzzleId}/clue-1`)).body();
    expect((await sharp(clue).metadata()).exif).toBeUndefined();

    // cleanup
    expect((await owner.delete(`/api/games/${game.id}`)).ok()).toBeTruthy();
    expect((await owner.get(`/api/media/${puzzleId}/clue-1`)).status()).toBe(404);
    await owner.dispose();
    await stranger.dispose();
  });

  test('upload rejects non-images and over-large files; join codes are not guessable', async ({ playwright, baseURL }) => {
    const owner = await playwright.request.newContext({ baseURL });
    const g = await (await owner.post('/api/games', { data: { mode: 'couple' } })).json();
    const bad = await owner.post(`/api/games/${g.id}/photos/upload`, { multipart: { files: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('<?php echo 1; ?>') } } });
    expect(bad.status()).toBe(422);
    expect(JSON.stringify(await bad.json())).toContain('unsupported_type');
    const html = await owner.post(`/api/games/${g.id}/photos/upload`, { multipart: { files: { name: 'x.png', mimeType: 'image/png', buffer: Buffer.from('<html><script>alert(1)</script></html>') } } });
    expect(html.status()).toBe(422);

    // unknown rooms look identical whether or not they ever existed
    const miss = await owner.get('/api/rooms/ZZZZZZ/info');
    expect(miss.status()).toBe(404);
    // invalid body shapes
    expect((await owner.post('/api/games', { data: { mode: 'hack' } })).status()).toBe(400);
    expect((await owner.post('/api/rooms/ZZZZZZ/join', { data: {} })).status()).toBe(400);
    await owner.delete(`/api/games/${g.id}`);
    await owner.dispose();
  });
});
