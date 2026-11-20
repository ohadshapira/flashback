import { expect, test } from '@playwright/test';
import { clickMap, guessOnce, makeImage, pinCoords, setWheel } from './helpers';

const gameIdOf = (url: string) => new URL(url).searchParams.get('game')!;

test('host creates a game: upload, answers via map + wheels, crop focus, review, start, and the answers reach the reveal', async ({ page }) => {
  await page.goto('/new?mode=couple');
  await page.getByTestId('game-title').fill('Our trips');
  await page.getByTestId('photo-count').selectOption('3');
  await page.getByTestId('create-game').click();
  await page.waitForURL(/\/new\/photos\?game=/);

  // cannot continue without enough photos
  await expect(page.getByTestId('photos-empty')).toBeVisible();
  await expect(page.getByTestId('photos-continue')).toBeDisabled();

  // local upload is always available: 3 good photos (one with EXIF GPS+date), a non-image, and a duplicate
  const a = await makeImage(1, { gps: true });
  await page.getByTestId('file-input').setInputFiles([
    { name: 'a.jpg', mimeType: 'image/jpeg', buffer: a },
    { name: 'b.jpg', mimeType: 'image/jpeg', buffer: await makeImage(2) },
    { name: 'c.jpg', mimeType: 'image/jpeg', buffer: await makeImage(3) },
    { name: 'notes.txt', mimeType: 'image/jpeg', buffer: Buffer.from('this is not a photo') },
    { name: 'a-copy.jpg', mimeType: 'image/jpeg', buffer: a },
  ]);
  await expect(page.getByTestId('photo-item')).toHaveCount(3);
  const failures = page.getByTestId('upload-failures');
  await expect(failures).toContainText('notes.txt'); // unsupported file: clear message, not a silent failure
  await expect(failures).toContainText('a-copy.jpg'); // duplicate: offered as an explicit error
  await expect(page.getByTestId('photos-continue')).toBeEnabled();

  // reorder: move the last photo up, then back (order controls work)
  const earlier = page.getByRole('button', { name: /הזזה למעלה|Move earlier/ });
  await earlier.nth(2).click(); // [a, b, c] → [a, c, b]
  await expect.poll(async () => (await (await page.request.get(`/api/games/${gameIdOf(page.url())}/setup`)).json()).puzzles.length).toBe(3);
  await earlier.nth(2).click(); // [a, c, b] → [a, b, c]

  await page.getByTestId('photos-continue').click();

  // ---- photo 1: details (EXIF suggestions are offered but never applied automatically) ----
  await page.waitForURL(/\/details$/);
  await expect(page.getByTestId('details-heading')).toBeVisible();
  await expect(page.getByTestId('original-photo')).toBeVisible(); // host sees the full original
  // the photo's own date and place are filled in for the host (and stay editable); confirming is still the host's act
  await expect(page.getByTestId('prefilled-note')).toBeVisible();
  await expect(page.getByTestId('month-wheel')).toHaveAttribute('data-value', '8');
  await expect(page.getByTestId('year-wheel')).toHaveAttribute('data-value', '2022');
  await expect.poll(() => pinCoords(page)).not.toBeNull();
  await expect(page.getByTestId('confirm-guess')).toBeEnabled();
  const pin = await pinCoords(page);
  expect(pin!.lat).toBeCloseTo(32.08, 1);
  expect(pin!.lng).toBeCloseTo(34.77, 1);
  await page.getByTestId('memory-title').fill('Tel Aviv sunset');
  await page.getByTestId('memory-story').fill('We almost missed the train that morning.');

  // an unsaved draft survives a reload
  await page.reload();
  await expect(page.getByTestId('memory-title')).toHaveValue('Tel Aviv sunset');
  await expect.poll(() => pinCoords(page)).not.toBeNull();
  await page.getByTestId('confirm-guess').click();

  // ---- crop focus: drag the target, live previews of all four stages, save ----
  await page.waitForURL(/\/crop$/);
  await expect(page.getByTestId('crop-previews').locator('figure')).toHaveCount(4);
  const box = () => page.getByTestId('crop-box').boundingBox().then((b) => b!); // re-measured each time: images loading can shift layout
  let cb = await box();
  const target = page.getByTestId('crop-target');
  await expect(target).toHaveAttribute('data-cx', '0.500');
  cb = await box();
  await page.mouse.move(cb.x + cb.width * 0.5, cb.y + cb.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width * 0.2, cb.y + cb.height * 0.3, { steps: 5 });
  await page.mouse.up();
  await expect(target).toHaveAttribute('data-cx', /0\.2\d\d/);
  await page.getByTestId('crop-reset').click();
  await expect(target).toHaveAttribute('data-cx', '0.500');
  cb = await box();
  await page.mouse.click(cb.x + cb.width * 0.25, cb.y + cb.height * 0.75);
  await expect(target).toHaveAttribute('data-cy', /0\.7\d\d/);
  await page.getByTestId('crop-save').click();

  // ---- photos 2 and 3 ----
  for (const [i, year] of [[2, 2019], [3, 2024]] as const) {
    await page.waitForURL(/\/details$/);
    await expect(page.getByTestId('suggestions')).toHaveCount(0); // no EXIF → nothing suggested, nothing assumed
    await clickMap(page, 0.2 + i * 0.2, 0.4);
    await setWheel(page, 'month-wheel', 2 + i);
    await setWheel(page, 'year-wheel', year);
    await page.getByTestId('confirm-guess').click();
    await page.waitForURL(/\/crop$/);
    await page.getByTestId('crop-save').click();
  }

  // ---- review → start → handoff ----
  await page.waitForURL(/\/new\/review\?game=/);
  await expect(page.getByTestId('review-item')).toHaveCount(3);
  await expect(page.getByText(/7/).first()).toBeVisible(); // retention (days) is displayed
  await page.getByTestId('start-game').click();
  await page.waitForURL(/\/handoff$/);

  // ---- the host's answer for photo 1 reaches the player's reveal ----
  await page.getByTestId('handoff-ready').click();
  await page.getByTestId('i-know-it').click();
  await guessOnce(page);
  await page.waitForURL(/\/reveal$/);
  await expect(page.getByTestId('reveal-title')).toHaveText('Tel Aviv sunset');
  await expect(page.getByTestId('reveal-story')).toContainText('almost missed the train');
  await expect(page.getByTestId('reveal-true-date')).toContainText('אוגוסט 2022');
});

test('answers cannot be edited or read once the game has started', async ({ page }) => {
  const request = page.request; // same cookie jar as the page: we ARE the owner
  await page.goto('/');
  await page.getByTestId('demo-couple').click();
  await page.waitForURL(/\/handoff$/);
  const id = /\/play\/([^/]+)\//.exec(page.url())![1];
  expect((await request.get(`/api/games/${id}/setup`)).status()).toBe(403);
  const photos = await request.post(`/api/games/${id}/photos/upload`, { multipart: { files: { name: 'x.jpg', mimeType: 'image/jpeg', buffer: await makeImage(9) } } });
  expect(photos.status()).toBe(422);
  await page.goto(`/new/photos?game=${id}`);
  await expect(page.getByTestId('error-box')).toBeVisible();
});
