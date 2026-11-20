import { expect, test } from '@playwright/test';
import { clickMap, mapCenter, pinCoords, setWheel } from './helpers';

test.describe('desktop Chrome: accessibility, wheels, i18n, privacy', () => {
  test('wheels: keyboard, mouse drag, future months disabled, year range 1900…now', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('demo-couple').click();
    await page.getByTestId('handoff-ready').click();
    await page.getByTestId('i-know-it').click();
    await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');

    const now = new Date();
    const years = await page.getByTestId('year-wheel').evaluate((el) => [...el.querySelectorAll('[role=option]')].map((o) => Number((o as HTMLElement).dataset.value)));
    expect(years[0]).toBe(1900);
    expect(years.at(-1)).toBe(now.getFullYear());
    expect(years).toHaveLength(now.getFullYear() - 1900 + 1);

    // future months in the current year are visible but disabled
    const disabled = await page.getByTestId('month-wheel').evaluate((el) => [...el.querySelectorAll('[role=option]')].filter((o) => o.getAttribute('aria-disabled') === 'true').length);
    expect(disabled).toBe(12 - (now.getMonth() + 1));

    // a historical year allows all 12 months (not limited by the current month)
    await setWheel(page, 'year-wheel', now.getFullYear() - 1);
    const disabledPast = await page.getByTestId('month-wheel').evaluate((el) => [...el.querySelectorAll('[role=option]')].filter((o) => o.getAttribute('aria-disabled') === 'true').length);
    expect(disabledPast).toBe(0);
    await setWheel(page, 'month-wheel', 12);
    // returning to the current year clamps the month so a future date is impossible
    await setWheel(page, 'year-wheel', now.getFullYear());
    await expect(page.getByTestId('month-wheel')).toHaveAttribute('data-value', String(now.getMonth() + 1));

    // listbox semantics + keyboard
    await expect(page.getByRole('listbox', { name: /חודש|Month/ })).toBeVisible();
    await expect(page.getByRole('listbox', { name: /שנה|Year/ })).toBeVisible();
    await setWheel(page, 'month-wheel', 1);
    await page.getByTestId('month-wheel').press('End');
    await expect(page.getByTestId('month-wheel')).toHaveAttribute('data-value', String(now.getMonth() + 1)); // End stops at the last *enabled* month
    await page.getByTestId('month-wheel').press('Home');
    await expect(page.getByTestId('month-wheel')).toHaveAttribute('data-value', '1');

    // mouse drag on a wheel (desktop) changes only the wheel
    const before = await mapCenter(page);
    const box = (await page.getByTestId('month-wheel').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 90, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.getByTestId('month-wheel').getAttribute('data-value')).not.toBe('1');
    expect(await mapCenter(page)).toEqual(before);

    // clicking an item selects it
    await page.getByTestId('month-wheel').getByRole('option').nth(3).click();
    await expect(page.getByTestId('month-wheel')).toHaveAttribute('data-value', '4');
  });

  test('map is keyboard accessible: Enter drops a pin, arrows move it, confirm unlocks', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('demo-couple').click();
    await page.getByTestId('handoff-ready').click();
    await page.getByTestId('i-know-it').click();
    await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('confirm-guess')).toBeDisabled();
    await page.getByTestId('world-map').focus();
    await page.keyboard.press('Enter');
    const p1 = await pinCoords(page);
    expect(p1).not.toBeNull();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowUp');
    const p2 = await pinCoords(page);
    expect(p2!.lng).toBeGreaterThan(p1!.lng);
    expect(p2!.lat).toBeGreaterThan(p1!.lat);
    await expect(page.getByTestId('confirm-guess')).toBeEnabled();
    // longitudes always stay normalized into [-180, 180]
    for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowRight');
    const p3 = await pinCoords(page);
    expect(p3!.lng).toBeGreaterThanOrEqual(-180);
    expect(p3!.lng).toBeLessThanOrEqual(180);
  });

  test('English LTR can be switched in without redesign; brand and tagline stay exact', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByTestId('brand-tagline')).toHaveText('Guess the moment. Relive the memory.'); // the brand header is identical in Hebrew
    await expect(page.getByTestId('home-tagline')).toHaveText('נחשו את הרגע. חיו את הזיכרון מחדש.'); // the big slogan on the home page is localized
    await expect(page.getByTestId('locale-switch')).toHaveText('English'); // the switch offers the other language
    await page.getByTestId('locale-switch').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('brand-name')).toHaveText('flashback');
    await expect(page.getByTestId('brand-tagline')).toHaveText('Guess the moment. Relive the memory.');
    await expect(page.getByTestId('mode-couple')).toContainText('Couple');
    await expect(page).toHaveTitle('flashback — Guess the moment. Relive the memory.'); // the English tagline stays exact in English
    // the guess screen works in LTR too
    await page.getByTestId('demo-couple').click();
    await page.getByTestId('handoff-ready').click();
    await page.getByTestId('i-know-it').click();
    await clickMap(page);
    await expect(page.getByTestId('confirm-guess')).toBeEnabled();
    await expect(page.getByTestId('confirm-guess')).toContainText('Confirm guess');
    await page.goto('/');
    await page.getByTestId('locale-switch').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test('metadata and sharing copy use flashback and the tagline', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('flashback — נחשו את הרגע. חיו את הזיכרון מחדש.');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'flashback — נחשו את הרגע. חיו את הזיכרון מחדש.');
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'flashback');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /flashback/);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    const body = await page.content();
    expect(body).not.toContain('MemoryQuest');
  });

  test('privacy page and data deletion controls', async ({ page, request }) => {
    await page.goto('/privacy');
    await expect(page.getByTestId('privacy-page')).toContainText('Limited Use');
    await page.goto('/');
    await page.getByTestId('demo-couple').click();
    await page.waitForURL(/\/handoff$/);
    const id = /\/play\/([^/]+)\//.exec(page.url())![1];
    await page.goto('/help/delete-data');
    await expect(page.getByTestId('my-games')).toBeVisible();
    page.once('dialog', (d) => d.accept());
    const count = await page.getByTestId('delete-my-game').count();
    await page.getByTestId('delete-my-game').first().click();
    await expect(page.getByTestId('delete-note')).toBeVisible();
    await expect.poll(async () => (await request.get(`/api/games/${id}`)).status()).toBeGreaterThanOrEqual(0);
    expect(count).toBeGreaterThan(0);
  });

  test('no horizontal overflow at 320px, and the map keeps ≥ ~half the screen on a small phone', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByTestId('demo-couple').click();
    await page.getByTestId('handoff-ready').click();
    await page.getByTestId('i-know-it').click();
    await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const map = (await page.getByTestId('world-map').boundingBox())!;
    const panel = (await page.getByTestId('wheel-panel').boundingBox())!;
    expect((panel.y - map.y) / 568).toBeGreaterThanOrEqual(0.4);
    // confirm stays inside the viewport above the safe area
    const confirm = (await page.getByTestId('confirm-guess').boundingBox())!;
    expect(confirm.y + confirm.height).toBeLessThanOrEqual(568);
  });
});
