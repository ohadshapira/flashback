import { expect, test } from '@playwright/test';
import { createDemo, guessOnce, newPlayer } from './helpers';

// The server runs with FLASHBACK_TIME_SCALE=2: a "60s" round lasts 30s and the four zoom stages start at 0 / 7.5 / 15 / 22.5s.

test('party mode: three real browser contexts, synced stages, private guesses, leaderboard, reconnect', async ({ browser, page: host, baseURL }) => {
  test.setTimeout(180_000);

  // ---- host opens a room ----
  await host.goto('/');
  const demo = await (await host.request.post('/api/demo', { data: { mode: 'party' } })).json(); // a host-only room (no simulated players)
  await host.goto(`/room/${demo.joinCode}/lobby`);
  await host.waitForURL(/\/room\/[A-Z0-9]{6}\/lobby$/);
  const code = (await host.getByTestId('room-code').textContent())!.trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
  await expect(host.getByTestId('room-qr')).toBeVisible();
  await expect(host.getByTestId('room-link')).toContainText(`/room/${code}`);
  await expect(host.getByTestId('start-room')).toBeDisabled(); // needs a player first

  // ---- two players on separate devices (isolated cookie jars) join with the code ----
  const A = await newPlayer(browser, baseURL!);
  const B = await newPlayer(browser, baseURL!);
  await A.page.goto('/');
  await A.page.getByTestId('join-code-input').fill(code.toLowerCase());
  await A.page.getByTestId('join-submit').click();
  await A.page.waitForURL(`**/room/${code}`);
  await A.page.getByTestId('nickname-input').fill('Dana');
  await A.page.getByTestId('join-room').click();
  await A.page.waitForURL(/\/lobby$/);
  await B.page.goto(`/room/${code}`);
  await B.page.getByTestId('nickname-input').fill('Noam');
  await B.page.getByTestId('join-room').click();
  await B.page.waitForURL(/\/lobby$/);

  for (const p of [host, A.page, B.page]) {
    await expect(p.getByTestId('player-item')).toHaveCount(2); // everyone's lobby updates live
    await expect(p.getByTestId('player-list')).toContainText('Dana');
    await expect(p.getByTestId('player-list')).toContainText('Noam');
  }
  await expect(A.page.getByTestId('wait-host')).toBeVisible();
  await expect(A.page.getByTestId('start-room')).toHaveCount(0); // only the host can start
  expect((await A.page.request.post(`/api/rooms/${code}/start`)).status()).toBe(403);

  // a stranger cannot read room state without joining
  const stranger = await newPlayer(browser, baseURL!);
  expect((await stranger.page.request.get(`/api/rooms/${code}/state`)).status()).toBe(403);
  expect((await stranger.page.request.get(`/api/rooms/${code}/events`)).status()).toBe(403);

  // ---- start: both phones move to the same live round ----
  await host.getByTestId('start-room').click();
  await A.page.waitForURL(/\/play$/);
  await B.page.waitForURL(/\/play$/);
  await expect(host.getByTestId('host-console')).toBeVisible(); // host does not compete
  for (const p of [A.page, B.page, host]) await expect(p.getByTestId('countdown')).toBeVisible();

  // zoom stage advances by server time, identically on every device
  await expect.poll(async () => Number(await A.page.getByTestId('clue-image').getAttribute('data-stage')), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  await expect.poll(async () => Number(await B.page.getByTestId('clue-image').getAttribute('data-stage')), { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  const sa = Number(await A.page.getByTestId('clue-image').getAttribute('data-stage'));
  const sb = Number(await B.page.getByTestId('clue-image').getAttribute('data-stage'));
  expect(Math.abs(sa - sb)).toBeLessThanOrEqual(1);

  // load both maps BEFORE anyone answers, so slow WebGL start-up never races the round timer
  for (const p of [A.page, B.page]) {
    await p.getByTestId('party-to-guess').click();
    await expect(p.getByTestId('world-map')).toHaveAttribute('data-ready', 'true', { timeout: 30_000 });
  }
  const puzzleId = /media\/([^/]+)\//.exec((await B.page.getByTestId('clue-thumb').getAttribute('src'))!)![1];

  // ---- Dana answers privately ----
  await guessOnce(A.page, { fx: 0.5, fy: 0.45 });
  await expect(A.page.getByTestId('submitted-banner')).toBeVisible();
  await expect(host.getByTestId('answered-count')).toContainText('1'); // host sees only a count
  // Noam sees no reveal and no trace of Dana's answer; originals stay locked
  await expect(B.page.getByTestId('party-reveal-heading')).toHaveCount(0);
  expect([403, 404]).toContain((await B.page.request.get(`/api/media/${puzzleId}/original`)).status());
  const bState = JSON.stringify(await (await B.page.request.get(`/api/rooms/${code}/state`)).json());
  expect(bState).not.toContain('"truth"');
  expect(bState).not.toContain('"guesses"');

  // ---- Noam answers → everyone is in → the round closes early for all ----
  await guessOnce(B.page, { fx: 0.3, fy: 0.5 });
  for (const p of [host, A.page, B.page]) await expect(p.getByTestId('party-reveal-heading')).toBeVisible();
  for (const p of [A.page, B.page]) {
    await expect(p.getByTestId('reveal-true-date')).toBeVisible();
    await expect(p.getByTestId('leaderboard-row')).toHaveCount(2);
  }
  expect((await B.page.request.get(`/api/media/${puzzleId}/original`)).status()).toBe(200); // revealed now
  await expect(A.page.getByTestId('wait-host-next')).toBeVisible();
  await expect(host.getByTestId('party-next')).toBeVisible();

  // refreshing cannot lose or duplicate an answer
  await A.page.reload();
  await expect(A.page.getByTestId('party-reveal-heading')).toBeVisible();
  const dup = await (await A.page.request.post(`/api/rooms/${code}/guess`, { data: { lat: 1, lng: 1, month: 1, year: 2000 } })).json();
  expect(dup.alreadySubmitted).toBe(true);

  // ---- round 2: nobody answers → the deadline closes it on every device ----
  await host.getByTestId('party-next').click();
  for (const p of [A.page, B.page]) await expect(p.getByTestId('round-label').or(p.getByText(/2\/3/)).first()).toBeVisible({ timeout: 25_000 });
  for (const p of [host, A.page, B.page]) await expect(p.getByTestId('party-reveal-heading')).toBeVisible({ timeout: 40_000 });
  await expect(A.page.getByTestId('no-guess')).toBeVisible();

  // ---- a late joiner can still enter a running room ----
  const C = await newPlayer(browser, baseURL!);
  await C.page.goto(`/room/${code}`);
  await C.page.getByTestId('nickname-input').fill('Late Lena');
  await C.page.getByTestId('join-room').click();
  await C.page.waitForURL(/\/play$/);

  // ---- finish round 3 (the last) through the same API the UI uses, then check the final screen ----
  await host.getByTestId('party-next').click();
  for (let round = 3; round <= 3; round++) {
    for (const p of [A.page, B.page, C.page]) {
      await expect.poll(async () => (await p.request.get(`/api/rooms/${code}/state`)).ok()).toBe(true);
      const state = await (await p.request.get(`/api/rooms/${code}/state`)).json();
      if (state.game.currentRound === round - 1 && state.game.roundState === 'accepting_guesses') {
        await p.request.post(`/api/rooms/${code}/guess`, { data: { lat: 20 + round, lng: 10, month: 5, year: 2021 } });
        if (round === 3 && p === A.page) {
          // reload mid-round (others still pending): the locked answer is restored from the server
          await A.page.reload();
          await expect(A.page.getByTestId('submitted-banner')).toBeVisible();
        }
      }
    }
    await expect.poll(async () => (await (await host.request.get(`/api/rooms/${code}/state`)).json()).game.roundState, { timeout: 40_000 }).toBe('revealed');
    const r = await host.request.post(`/api/rooms/${code}/next`);
    expect(r.ok()).toBeTruthy();
  }
  for (const p of [host, A.page, B.page, C.page]) {
    await expect(p.getByTestId('party-final')).toBeVisible({ timeout: 15_000 });
    await expect(p.getByTestId('leaderboard-row')).toHaveCount(3);
  }
  const scores = await A.page.getByTestId('leaderboard-score').allTextContents();
  expect(scores.length).toBe(3);

  // a finished room does not accept new players
  const D = await newPlayer(browser, baseURL!);
  await D.page.goto(`/room/${code}`);
  await expect(D.page.getByTestId('error-box')).toBeVisible();

  for (const x of [A, B, C, D, stranger]) await x.ctx.close();
});

test('unknown room codes show a friendly message and join lookups are rate limited per client', async ({ page, request }) => {
  await page.goto('/room/ZZZZZZ');
  await expect(page.getByTestId('error-box')).toBeVisible();
  const game = await createDemo(request, 'party');
  expect(game.joinCode).toMatch(/^[A-Z0-9]{6}$/);
  // A distinct (forwarded) client address, so exhausting its bucket cannot affect the other tests.
  let limited = 0;
  for (let i = 0; i < 75; i++) {
    const r = await request.get(`/api/rooms/ZZZZZ${i % 10}/info`, { headers: { 'x-forwarded-for': '203.0.113.77' } });
    if (r.status() === 429) limited++;
  }
  expect(limited).toBeGreaterThan(0);
});
