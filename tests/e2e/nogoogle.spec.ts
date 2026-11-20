import { expect, test } from '@playwright/test';
import { makeImage } from './helpers';

// This project runs against a server with NO Google credentials.
test('without Google credentials: says so honestly, never fakes a sign-in, and local upload still works', async ({ page, request }) => {
  const cfg = await (await request.get('/api/google-photos/config')).json();
  expect(cfg).toMatchObject({ configured: false, mock: false, connected: false });

  await page.goto('/new?mode=couple');
  await page.getByTestId('create-game').click();
  await page.waitForURL(/\/new\/photos\?game=/);
  const gameId = new URL(page.url()).searchParams.get('game')!;

  await expect(page.getByTestId('google-not-configured')).toContainText('Google Photos is not configured in this development environment.');
  await expect(page.getByTestId('google-connect-disabled')).toBeDisabled();
  await expect(page.getByTestId('google-connect')).toHaveCount(0);
  await expect(page.getByTestId('google-mock-banner')).toHaveCount(0);

  // the OAuth entry point does not pretend: it bounces back with a clear flag and no redirect to any Google host
  const start = await page.request.get(`/api/auth/google/start?gameId=${gameId}&consent=1`, { maxRedirects: 0 });
  expect(start.status()).toBe(302);
  expect(start.headers().location).toContain('google=not_configured');
  expect(start.headers().location).not.toMatch(/google\.com|accounts/);
  expect((await page.request.post('/api/google-photos/sessions', { data: { gameId } })).status()).toBe(401);

  // local upload remains fully usable
  await page.getByTestId('file-input').setInputFiles({ name: 'mine.jpg', mimeType: 'image/jpeg', buffer: await makeImage(5) });
  await expect(page.getByTestId('photo-item')).toHaveCount(1);
});
