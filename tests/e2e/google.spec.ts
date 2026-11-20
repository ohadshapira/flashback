import { expect, test } from '@playwright/test';
import { makeImage, MOCK } from './helpers';

/**
 * Exercises the REAL integration code (OAuth Authorization Code + PKCE, Picker session lifecycle, pagination,
 * authorized server-side downloads, cleanup) against a local test double that enforces Google's contract.
 * This is NOT a live Google test: see docs/INSTALL.md for what still needs real credentials.
 */
test('Google Photos Picker flow against the local mock', async ({ page, request, context }) => {
  test.setTimeout(120_000);
  await request.get(`${MOCK}/__reset`);

  await page.goto('/new?mode=couple');
  await page.getByTestId('create-game').click();
  await page.waitForURL(/\/new\/photos\?game=/);
  const gameId = new URL(page.url()).searchParams.get('game')!;

  // configured (against the mock), and the test double is labelled — never presented as real Google
  await expect(page.getByTestId('google-not-configured')).toHaveCount(0);
  await expect(page.getByTestId('google-mock-banner')).toBeVisible();

  // consent first: nothing is sent to Google until the explicit agreement
  await page.getByTestId('google-connect').click();
  const disclosure = page.getByTestId('google-disclosure');
  await expect(disclosure).toBeVisible();
  await expect(disclosure).toContainText('7'); // retention days are stated
  await expect(disclosure.getByRole('link')).toHaveAttribute('href', '/privacy');
  expect(((await (await request.get(`${MOCK}/__state`)).json()) as { log: string[] }).log.some((l) => l.includes('/auth'))).toBe(false);

  // OAuth consent bypass attempt: the start route refuses without consent=1
  const noConsent = await page.request.get(`/api/auth/google/start?gameId=${gameId}`, { maxRedirects: 0 });
  expect(noConsent.status()).toBe(400);

  // agree → app → (mock) Google → callback (state + PKCE verified server-side) → back to the app
  await page.getByTestId('google-agree').click();
  await page.waitForURL(/google=connected/);
  const st1 = (await (await request.get(`${MOCK}/__state`)).json()) as { pkceVerified: number };
  expect(st1.pkceVerified).toBe(1);
  expect((await (await page.request.get('/api/google-photos/config')).json()).connected).toBe(true);
  // the browser never sees a token, secret or verifier
  const html = await page.content();
  for (const secret of ['mock-access-token', 'mock-client-secret', 'code_verifier']) expect(html).not.toContain(secret);
  const cookies = JSON.stringify(await context.cookies());
  expect(cookies).not.toContain('mock-access-token');

  // a forged callback (wrong state) is rejected
  const forged = await page.request.get('/api/auth/google/callback?code=abc&state=forged', { maxRedirects: 0 });
  expect(forged.status()).toBe(302);
  expect(forged.headers().location).toContain('google=error');

  // open the Picker in its own tab (never an iframe)
  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('google-pick').click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/localhost:4010\/picker\/sess-/);
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByTestId('google-session')).toHaveAttribute('data-state', 'waiting');
  await expect(page.getByTestId('google-open-again')).toHaveAttribute('target', '_blank');

  // a reload resumes the same session instead of starting over
  await page.reload();
  await expect(page.getByTestId('google-session')).toHaveAttribute('data-state', 'waiting');

  // the user taps Done in the Picker tab → server polling notices → import runs (2 pages of results, 1 video skipped)
  await popup.close();
  await request.get(`${MOCK}/__select`);
  await expect(page.getByTestId('photo-item')).toHaveCount(3, { timeout: 40_000 });
  await expect(page.getByTestId('google-done')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('google-issues')).toContainText('clip.mp4');

  // lifecycle cleanup: session deleted at Google, token discarded, authorized downloads only
  const st2 = (await (await request.get(`${MOCK}/__state`)).json()) as { deleted: string[]; mediaDownloads: number; badAuth: number };
  expect(st2.deleted).toHaveLength(1);
  expect(st2.mediaDownloads).toBe(3);
  expect(st2.badAuth).toBe(0);
  expect((await (await page.request.get('/api/google-photos/config')).json()).connected).toBe(false);

  // The host's screen starts from the photo's own createTime (still editable); Google shares no location, so none is invented
  await page.getByTestId('edit-photo').first().click();
  await page.waitForURL(/\/details$/);
  await expect(page.getByTestId('prefilled-note')).toBeVisible();
  await expect(page.getByTestId('use-suggested-place')).toHaveCount(0);
  await expect(page.getByTestId('year-wheel')).toHaveAttribute('data-value', '2021');
  await expect(page.getByTestId('month-wheel')).toHaveAttribute('data-value', '7');
  await expect(page.getByTestId('confirm-guess')).toBeDisabled(); // location must be placed explicitly

  // local upload stays available alongside
  await page.goto(`/new/photos?game=${gameId}`);
  await page.getByTestId('file-input').setInputFiles({ name: 'mine.jpg', mimeType: 'image/jpeg', buffer: await makeImage(11) });
  await expect(page.getByTestId('photo-item')).toHaveCount(4);

  // deleting the game removes the imported copies
  const del = await page.request.delete(`/api/games/${gameId}`);
  expect(del.ok()).toBeTruthy();
});

test('a cancelled selection deletes the Google session and imports nothing', async ({ page, request }) => {
  await request.get(`${MOCK}/__reset`);
  await page.goto('/new?mode=couple');
  await page.getByTestId('create-game').click();
  await page.waitForURL(/\/new\/photos\?game=/);
  await page.getByTestId('google-connect').click();
  await page.getByTestId('google-agree').click();
  await page.waitForURL(/google=connected/);
  const popupPromise = page.waitForEvent('popup');
  await page.getByTestId('google-pick').click();
  (await popupPromise).close();
  await expect(page.getByTestId('google-session')).toHaveAttribute('data-state', 'waiting');
  await page.getByRole('button', { name: /ביטול הבחירה|Cancel selection/ }).click();
  await expect(page.getByTestId('google-session')).toHaveCount(0);
  const st = (await (await request.get(`${MOCK}/__state`)).json()) as { deleted: string[] };
  expect(st.deleted).toHaveLength(1);
  await expect(page.getByTestId('photo-item')).toHaveCount(0);
});
