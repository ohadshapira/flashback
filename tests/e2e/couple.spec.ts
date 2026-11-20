import { expect, test } from '@playwright/test';
import { clickMap, guessOnce, mapCenter, pinCoords, setWheel } from './helpers';

test.describe('couple game on one shared phone (demo content)', () => {
  test('home → handoff → clue → map+wheels guess → reveal → all rounds → summary', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));

    // ---- home: brand, tagline, RTL Hebrew ----
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.getByTestId('brand-name')).toHaveText('flashback');
    await expect(page.getByTestId('home-tagline')).toHaveText('נחשו את הרגע. חיו את הזיכרון מחדש.'); // the Hebrew UI shows the Hebrew tagline
    await expect(page).toHaveTitle(/flashback — נחשו את הרגע\. חיו את הזיכרון מחדש\./); // Hebrew UI
    await expect(page.getByTestId('demo-card')).toContainText('תוכן הדגמה'); // demo is clearly labelled

    await page.getByTestId('demo-couple').click();
    await page.waitForURL(/\/play\/[^/]+\/handoff$/);

    // ---- handoff: no answers, no editing controls ----
    await expect(page.getByTestId('handoff-title')).toBeVisible();
    await expect(page.getByTestId('world-map')).toHaveCount(0);
    await expect(page.locator('input, textarea')).toHaveCount(0);
    await page.getByTestId('handoff-ready').click();
    await page.waitForURL(/\/play\/[^/]+$/);

    // ---- clue: only the current crop; "Reveal more" widens it ----
    const clue = page.getByTestId('clue-image');
    await expect(clue).toHaveAttribute('data-stage', '1');
    await expect(clue).toHaveAttribute('src', /clue-1/);
    await expect.poll(() => clue.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(100);
    await page.getByTestId('reveal-more').click();
    await expect(clue).toHaveAttribute('data-stage', '2');
    await expect(clue).toHaveAttribute('src', /clue-2/);

    // ---- THE guess screen: one map, one pin, two wheels anchored at the bottom of the map ----
    await page.getByTestId('i-know-it').click();
    await page.waitForURL(/\/guess$/);
    const stage = page.getByTestId('map-wheel-stage');
    const panel = page.getByTestId('wheel-panel');
    await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');
    const sb = (await stage.boundingBox())!;
    const pb = (await panel.boundingBox())!;
    expect(Math.abs(pb.y + pb.height - (sb.y + sb.height))).toBeLessThanOrEqual(1); // panel sits on the bottom edge of the map stage
    await expect(panel.getByTestId('month-wheel')).toBeVisible();
    await expect(panel.getByTestId('year-wheel')).toBeVisible();
    await expect(panel.getByTestId('confirm-guess')).toBeVisible();
    expect(page.url()).toMatch(/\/guess$/); // no separate date screen
    // at least about half the viewport shows map
    const vh = page.viewportSize()!.height;
    expect(pb.y - sb.y).toBeGreaterThanOrEqual(vh * 0.45);

    // neutral initial wheel values = current month/year (never inferred from the answer)
    const now = new Date();
    await expect(page.getByTestId('month-wheel')).toHaveAttribute('data-value', String(now.getMonth() + 1));
    await expect(page.getByTestId('year-wheel')).toHaveAttribute('data-value', String(now.getFullYear()));

    // the world map must NOT open near the answer: neutral, world-scale
    const c0 = await mapCenter(page);
    expect(c0.zoom).toBeLessThan(2);

    // confirm is impossible without a pin
    const confirm = page.getByTestId('confirm-guess');
    await expect(confirm).toBeDisabled();

    // tap = one pin; a second tap relocates it (still exactly one pin)
    await clickMap(page, 0.3, 0.3);
    const p1 = await pinCoords(page);
    expect(p1).not.toBeNull();
    await expect(page.getByTestId('pin-marker')).toHaveCount(1);
    await clickMap(page, 0.7, 0.55);
    const p2 = await pinCoords(page);
    expect(p2).not.toEqual(p1);
    await expect(page.getByTestId('pin-marker')).toHaveCount(1);
    await expect(confirm).toBeEnabled();

    // drag the pin
    const pin = (await page.getByTestId('pin-marker').boundingBox())!;
    await page.mouse.move(pin.x + pin.width / 2, pin.y + pin.height * 0.45);
    await page.mouse.down();
    await page.mouse.move(pin.x + pin.width / 2 - 70, pin.y + pin.height * 0.45 + 40, { steps: 8 });
    await page.mouse.up();
    await expect.poll(async () => (await pinCoords(page))?.lng).not.toBe(p2!.lng);
    await expect(page.getByTestId('pin-marker')).toHaveCount(1);

    // scrolling the wheel moves only the wheel, never the map
    const before = await mapCenter(page);
    const monthBefore = await page.getByTestId('month-wheel').getAttribute('data-value');
    const wb = (await page.getByTestId('month-wheel').boundingBox())!;
    await page.mouse.move(wb.x + wb.width / 2, wb.y + wb.height / 2);
    await page.mouse.wheel(0, -120); // up: the later months of the current year are (correctly) disabled
    await expect.poll(() => page.getByTestId('month-wheel').getAttribute('data-value')).not.toBe(monthBefore);
    const after = await mapCenter(page);
    expect(after.lat).toBeCloseTo(before.lat, 6);
    expect(after.lng).toBeCloseTo(before.lng, 6);
    expect(after.zoom).toBeCloseTo(before.zoom, 6);

    // …and panning the map never turns the wheels
    const monthNow = await page.getByTestId('month-wheel').getAttribute('data-value');
    const yearNow = await page.getByTestId('year-wheel').getAttribute('data-value');
    const mb = (await page.getByTestId('world-map').boundingBox())!;
    await page.mouse.move(mb.x + mb.width * 0.5, mb.y + 160);
    await page.mouse.down();
    await page.mouse.move(mb.x + mb.width * 0.5 - 90, mb.y + 200, { steps: 6 });
    await page.mouse.up();
    expect((await mapCenter(page)).lng).not.toBeCloseTo(before.lng, 1);
    await expect(page.getByTestId('month-wheel')).toHaveAttribute('data-value', monthNow!);
    await expect(page.getByTestId('year-wheel')).toHaveAttribute('data-value', yearNow!);

    // choose a date and confirm (double-tap must still create just one answer)
    await setWheel(page, 'month-wheel', 8);
    await setWheel(page, 'year-wheel', 2022);
    const beforeConfirm = requests.length;
    await confirm.dblclick();
    await page.waitForURL(/\/reveal$/);

    // nothing private was requested for round 1 before the reveal
    const early = requests.slice(0, beforeConfirm).filter((u) => /\/original|\/thumb|clue-[34]/.test(u));
    expect(early).toEqual([]);

    // ---- reveal ----
    await expect(page.getByTestId('reveal-photo')).toBeVisible();
    await expect.poll(() => page.getByTestId('reveal-photo').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(300);
    await expect(page.getByTestId('reveal-title')).toBeVisible();
    await expect(page.getByTestId('reveal-story')).toBeVisible();
    await expect(page.getByTestId('reveal-true-date')).toContainText('2022');
    await expect(page.getByTestId('reveal-guess-date')).toContainText('2022');
    await expect(page.getByTestId('reveal-distance')).toContainText(/km|ק״מ/); // locale unit name
    await expect(page.getByTestId('reveal-month-diff')).toBeVisible();
    await expect(page.getByTestId('score-breakdown')).toBeVisible();
    await expect(page.getByTestId('score-location')).toBeVisible();
    await expect(page.getByTestId('score-date')).toBeVisible();
    await expect(page.getByTestId('score-zoom')).toBeVisible();
    await expect(page.getByTestId('score-total')).toBeVisible();
    await expect(page.getByTestId('truth-marker')).toHaveCount(1);
    await expect(page.getByTestId('pin-marker')).toHaveCount(1); // both pins drawn

    // exactly one guess was stored despite the double-tap (round result is stable)
    const res = await page.request.get(page.url().replace('/reveal', '').replace(/^(https?:\/\/[^/]+)\/play\/([^/]+)/, '$1/api/games/$2/round/result'));
    expect(res.ok()).toBeTruthy();

    // ---- while the next round is live, its original must be unreachable ----
    await page.getByTestId('next-memory').click();
    await page.waitForURL(/\/play\/[^/]+$/);
    const liveSrc = await page.getByTestId('clue-image').getAttribute('src');
    const puzzleId = /media\/([^/]+)\//.exec(liveSrc!)![1];
    for (const kind of ['original', 'thumb', 'clue-4']) {
      const r = await page.request.get(`/api/media/${puzzleId}/${kind}`);
      expect([403, 404], `${kind} leaked`).toContain(r.status());
    }
    const setup = await page.request.get(page.url().replace(/^(https?:\/\/[^/]+)\/play\/([^/]+).*/, '$1/api/games/$2/setup'));
    expect(setup.status()).toBe(403); // even the owner's device cannot read answers during play

    // ---- play the remaining 2 rounds quickly (the sample game has 3) ----
    for (let round = 2; round <= 3; round++) {
      await page.getByTestId('i-know-it').click();
      await guessOnce(page, { fx: 0.4 + round * 0.05, fy: 0.4 });
      await page.waitForURL(/\/reveal$/);
      await expect(page.getByTestId('score-total')).toBeVisible();
      await page.getByTestId('next-memory').click();
      if (round < 3) await page.waitForURL(/\/play\/[^/]+$/);
    }

    // ---- summary: celebration, replay, switch roles ----
    await page.waitForURL(/\/summary$/);
    await expect(page.getByTestId('summary-heading')).toBeVisible();
    await expect(page.getByTestId('summary-round')).toHaveCount(3);
    await expect(page.getByTestId('delete-game')).toHaveCount(0); // nothing of the user's to delete in a sample game
    await expect(page.getByTestId('replay')).toBeVisible();
    await expect(page.getByTestId('challenge-me')).toBeVisible();

    // the host can look at the answers again only now that the game is finished
    const setupAfter = await page.request.get(page.url().replace(/^(https?:\/\/[^/]+)\/play\/([^/]+).*/, '$1/api/games/$2/setup'));
    expect(setupAfter.status()).toBe(200);

    await page.getByTestId('challenge-me').click();
    await page.waitForURL(/\/new\?mode=couple&swap=1/);
    await expect(page.getByTestId('swap-banner')).toBeVisible();

    await page.goBack();
    await page.getByTestId('replay').click();
    await page.waitForURL(/\/handoff$/);
  });

  test('back to the clue keeps the pin and date in untimed play', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('demo-couple').click();
    await page.getByTestId('handoff-ready').click();
    await page.getByTestId('i-know-it').click();
    await clickMap(page, 0.45, 0.4);
    const pin = await pinCoords(page);
    await setWheel(page, 'month-wheel', 3);
    await page.getByTestId('game-back').click();
    await page.waitForURL(/\/play\/[^/]+$/);
    await page.getByTestId('i-know-it').click();
    await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');
    await expect.poll(() => pinCoords(page)).toEqual(pin);
    await expect(page.getByTestId('month-wheel')).toHaveAttribute('data-value', '3');
  });
});
