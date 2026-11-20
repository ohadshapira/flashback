import { expect, test, type Page } from '@playwright/test';
import { guessOnce } from './helpers';

/** Drag the mouse across the scratch foil along a horizontal line at the given fraction of its height. */
async function scratchLine(page: Page, fy: number, from = 0.1, to = 0.9) {
  const box = (await page.getByTestId('scratch-canvas').boundingBox())!;
  await page.mouse.move(box.x + box.width * from, box.y + box.height * fy);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to, box.y + box.height * fy, { steps: 14 });
  await page.mouse.up();
}

test('scratch party: scratch to reveal, the server only serves scratched tiles, the score follows how much you scratched', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByTestId('demo-party').click();
  await expect(page.getByTestId('demo-party-pick')).toBeVisible();
  await page.getByTestId('demo-party-scratch').click(); // the hard style is a choice inside Party
  await page.waitForURL(/\/room\/([A-Z0-9]{6})\/lobby$/);
  const code = /\/room\/([A-Z0-9]{6})\//.exec(page.url())![1];
  await expect(page.getByTestId('style-chip')).toBeVisible();
  await page.getByTestId('start-room').click();
  await page.waitForURL(/\/play$/);

  // ---- round 1: a little scratching ----
  await expect(page.getByTestId('scratch-card')).toBeVisible();
  await expect(page.getByTestId('scratch-tile')).toHaveCount(0); // nothing is under the foil in the browser yet
  const state0 = await (await page.request.get(`/api/rooms/${code}/state`)).json();
  expect(state0.clue).toBeNull(); // no clue image at all in scratch mode
  const { puzzleId, cols, rows } = state0.scratch;
  const total = cols * rows;

  // a hidden tile is refused by the server
  const hidden = await page.request.get(`/api/media/${puzzleId}/scratch-${total - 1}`);
  expect([403, 404]).toContain(hidden.status());

  await scratchLine(page, 0.5, 0.35, 0.6);
  await expect.poll(async () => Number(await page.getByTestId('scratch-card').getAttribute('data-pct'))).toBeGreaterThan(0);
  const pctSmall = Number(await page.getByTestId('scratch-card').getAttribute('data-pct'));
  expect(pctSmall).toBeLessThanOrEqual(30);
  await expect(page.getByTestId('scratch-tile').first()).toBeVisible();
  // tiles arrive with the scratch answer itself (data URLs); the same tile can also be fetched by URL…
  expect(((await page.getByTestId('scratch-tile').first().getAttribute('src')) ?? '').startsWith('data:image/jpeg')).toBeTruthy();
  const released = (await (await page.request.get(`/api/rooms/${code}/state`)).json()).scratch.cells[0];
  expect((await page.request.get(`/api/media/${puzzleId}/scratch-${released}`)).status()).toBe(200); // the scratched tile is served…
  expect([403, 404]).toContain((await page.request.get(`/api/media/${puzzleId}/scratch-${total - 1}`)).status()); // …the rest is not

  // the server counts what was released (not a number from the browser)
  const mid = await (await page.request.get(`/api/rooms/${code}/state`)).json();
  expect(mid.scratch.cells.length).toBeGreaterThan(0);
  // the meter moves at once on the device; once the server has answered everything it agrees exactly
  await expect.poll(async () => (await (await page.request.get(`/api/rooms/${code}/state`)).json()).scratch.pct).toBe(pctSmall);

  await page.getByTestId('party-to-guess').click();
  await guessOnce(page, { fx: 0.5, fy: 0.4 });
  await expect(page.getByTestId('party-reveal-heading')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('reveal-scratch-pct')).toContainText(String(pctSmall));
  await expect(page.getByTestId('demo-other-row')).toHaveCount(3);
  await expect(page.getByTestId('demo-other-row').first()).toContainText('%'); // what the others scratched
  const small = Number((await page.getByTestId('score-zoom').textContent())!.split('/')[0]);
  await page.getByTestId('party-next').click();

  // ---- round 2: scratch a lot, so the bonus is lower ----
  await expect(page.getByTestId('scratch-card')).toBeVisible({ timeout: 20_000 });
  for (const fy of [0.08, 0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92]) await scratchLine(page, fy, 0.03, 0.97);
  await expect.poll(async () => Number(await page.getByTestId('scratch-card').getAttribute('data-pct')), { timeout: 20_000 }).toBeGreaterThan(70);
  await page.getByTestId('party-to-guess').click();
  await guessOnce(page, { fx: 0.5, fy: 0.4 });
  await expect(page.getByTestId('party-reveal-heading')).toBeVisible({ timeout: 40_000 });
  const lots = Number((await page.getByTestId('score-zoom').textContent())!.split('/')[0]);
  expect(lots).toBeLessThan(small); // scratching more cost points
  await page.getByTestId('party-next').click();

  // ---- round 3: answer without scratching at all (full bonus) ----
  await expect(page.getByTestId('scratch-card')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('party-to-guess').click();
  await guessOnce(page, { fx: 0.5, fy: 0.4 });
  await expect(page.getByTestId('party-reveal-heading')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByTestId('score-zoom')).toContainText('20/20');
  await page.getByTestId('party-next').click();

  // ---- summary: everybody's scores by round, with how much each scratched ----
  await expect(page.getByTestId('party-final')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('score-table')).toBeVisible();
  await expect(page.getByTestId('score-row')).toHaveCount(4);
  await expect(page.getByTestId('score-table')).toContainText('%');
});

test('the play-style choice is offered for party games only, and is saved with the game', async ({ page }) => {
  await page.goto('/new?mode=couple');
  await expect(page.getByTestId('style-picker')).toHaveCount(0);
  await page.goto('/new?mode=party');
  await expect(page.getByTestId('style-picker')).toBeVisible();
  await expect(page.getByTestId('style-radio-classic')).toBeChecked(); // classic stays the default
  await page.getByText(/גירוד|Scratch/).first().click();
  await expect(page.getByTestId('style-radio-scratch')).toBeChecked();
  await page.getByTestId('create-game').click();
  await page.waitForURL(/\/new\/photos\?game=/);
  const id = new URL(page.url()).searchParams.get('game')!;
  const meta = await (await page.request.get(`/api/games/${id}`)).json();
  expect(meta.playStyle).toBe('scratch');
});
