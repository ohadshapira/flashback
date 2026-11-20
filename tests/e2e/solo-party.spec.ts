import { expect, test } from '@playwright/test';
import { guessOnce } from './helpers';

/** The party demo you can play on your own: simulated players, and the screens say what they did. */
test('solo party demo: play alone against simulated players, with explanations', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/');
  await page.getByTestId('demo-party').click(); // the demo's Party button asks how to play…
  await expect(page.getByTestId('demo-party-pick')).toBeVisible();
  await page.getByTestId('demo-party-classic').click(); // …and this is the classic style
  await page.waitForURL(/\/room\/[A-Z0-9]{6}\/lobby$/);

  // lobby: explains the demo, lists you plus three players marked as simulated, and lets you start
  await expect(page.getByTestId('demo-lobby-note')).toBeVisible();
  await expect(page.getByTestId('player-item')).toHaveCount(4);
  await expect(page.getByTestId('sim-chip')).toHaveCount(3);
  await page.getByTestId('start-room').click();
  await page.waitForURL(/\/play$/);

  for (let round = 1; round <= 3; round++) {
    // clue tab: the demo note and the "answered" counter are shown
    await expect(page.getByTestId('demo-live-note')).toBeVisible();
    await page.getByTestId('party-to-guess').click();
    await guessOnce(page, { fx: 0.3 + round * 0.1, fy: 0.4 });

    // everybody answered (the rivals answer straight away once you do): the reveal explains what each of them did
    await expect(page.getByTestId('party-reveal-heading')).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId('demo-others')).toBeVisible();
    await expect(page.getByTestId('demo-other-row')).toHaveCount(3);
    await expect(page.getByTestId('leaderboard-row')).toHaveCount(4);

    if (round < 3) {
      await page.getByTestId('party-next').click(); // you run the room, so you start the next round
      await expect(page.getByTestId('party-to-guess')).toBeVisible({ timeout: 20_000 });
    } else {
      await page.getByTestId('party-next').click();
    }
  }

  await expect(page.getByTestId('party-final')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('demo-final-note')).toBeVisible();
  await expect(page.getByTestId('leaderboard-row')).toHaveCount(4);
});
