import { expect, test, type Page } from '@playwright/test';
import { pinCoords, setWheel } from './helpers';

/** Click the middle of the setup page's map. (`clickMap` waits for the guess screen's wheel panel, which does not exist here.) */
async function clickSetupMap(page: Page) {
  const map = page.getByTestId('world-map').first();
  await expect(map).toHaveAttribute('data-ready', 'true');
  await map.scrollIntoViewIfNeeded();
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.45);
}

test.describe('Partners: a parent and a child, one team', () => {
  test('setup: names, one place on the map, the profile is stored and remembered on the device', async ({ page }) => {
    await page.goto('/new?mode=partners');
    await expect(page.getByTestId('partners-setup')).toBeVisible();
    await page.getByTestId('partners-child').fill('נועה');
    await page.getByTestId('partners-parent').fill('אמא');
    await clickSetupMap(page); // marks the active place (🏠) on the map
    await expect(page.getByTestId('place-marker-0')).toBeVisible();
    await expect(page.getByTestId('place-marker-1')).toHaveCount(0); // the other places are not on the map yet

    await page.getByTestId('create-game').click();
    await page.waitForURL(/\/new\/photos\?game=/);
    const id = new URL(page.url()).searchParams.get('game')!;

    const res = await page.request.get(`/api/games/${id}`);
    expect(res.ok()).toBeTruthy();
    const game = await res.json();
    expect(game.mode).toBe('family_shared');
    expect(game.partners).toMatchObject({ childName: 'נועה', parentName: 'אמא' });
    expect(game.partners.places).toHaveLength(1);
    expect(game.partners.places[0].icon).toBe('🏠');

    await page.goto('/new?mode=partners');
    await expect(page.getByTestId('partners-child')).toHaveValue('נועה');
    await expect(page.getByTestId('partners-parent')).toHaveValue('אמא');
  });

  test('setup: both names are required', async ({ page }) => {
    await page.goto('/new?mode=partners');
    await page.getByTestId('partners-child').fill('נועה');
    await page.getByTestId('partners-parent').fill('');
    await page.getByTestId('create-game').click();
    await expect(page.getByText('כתבו את שם הילד ואת השם שלכם במשחק.')).toBeVisible();
    expect(page.url()).toMatch(/\/new\?mode=partners/);
  });

  test('demo: jobs swap every round, family places snap the pin, child-friendly wheels, credited score', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('demo-partners').click();
    await page.waitForURL(/\/play\/[^/]+\/handoff$/);

    // ---- handoff and clue say who does what ----
    await expect(page.getByTestId('handoff-text')).toContainText('נועה על המפה, אמא על הגלגלים');
    await page.getByTestId('handoff-ready').click();
    await page.waitForURL(/\/play\/[^/]+$/);
    await expect(page.getByTestId('clue-jobs')).toContainText('נועה');
    await page.getByTestId('i-know-it').click();
    await page.waitForURL(/\/guess$/);

    // ---- round 1: the child is on the map, the parent on the wheels ----
    await expect(page.getByTestId('world-map')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByTestId('job-map')).toContainText(/המפה: נועה/);
    await expect(page.getByTestId('job-wheels')).toContainText(/הגלגלים: אמא/);
    await expect(page.getByTestId('map-hint')).toContainText('נועה: איפה זה היה?');
    await expect(page.getByTestId('place-marker-0')).toBeVisible();

    // tapping the beach icon puts the pin exactly on the place
    await page.getByTestId('place-marker-2').click();
    await expect.poll(() => pinCoords(page)).toMatchObject({ lat: 32.08, lng: 34.77 });
    await expect(page.getByTestId('map-hint')).toContainText('הים');

    // wheels a child can read: age at the selected month, season icons, 🎂 on the birth month
    await setWheel(page, 'year-wheel', 2022);
    await setWheel(page, 'month-wheel', 8);
    await expect(page.getByTestId('year-wheel').locator('[role=option][data-value="2022"]')).toHaveText('2022 · גיל 4');
    await expect(page.getByTestId('month-wheel').locator('[role=option][data-value="3"]')).toContainText('🎂');
    await expect(page.getByTestId('month-wheel').locator('[role=option][data-value="8"]')).toContainText('☀️');

    await page.getByTestId('confirm-guess').click();
    await page.waitForURL(/\/reveal$/);

    // ---- reveal: the place, the age, and credit for each part of the score ----
    await expect(page.getByTestId('reveal-place')).toContainText('הים');
    await expect(page.getByTestId('reveal-age')).toContainText('גיל 4');
    await expect(page.getByTestId('score-location')).toHaveText('50/50');
    await expect(page.getByTestId('score-breakdown')).toContainText('מקום · נועה');
    await expect(page.getByTestId('score-breakdown')).toContainText('תאריך · אמא');

    // ---- round 2: the jobs swapped, the child's chip is still the warm one ----
    await page.getByTestId('next-memory').click();
    await page.waitForURL(/\/play\/[^/]+$/);
    await page.getByTestId('i-know-it').click();
    await page.waitForURL(/\/guess$/);
    await expect(page.getByTestId('job-map')).toContainText(/המפה: אמא/);
    await expect(page.getByTestId('job-wheels')).toContainText(/הגלגלים: נועה/);
    await expect(page.getByTestId('job-wheels')).toHaveClass(/bg-rose-soft/);
    await expect(page.getByTestId('job-map')).toHaveClass(/bg-blue-soft/);
  });
});
