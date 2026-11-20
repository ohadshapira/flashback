import { expect, type APIRequestContext, type Browser, type BrowserContext, type Page } from '@playwright/test';
import sharp from 'sharp';

export const MOCK = 'http://localhost:4010';

type FbWindow = { __fbMap?: { getCenter(): { lat: number; lng: number }; getZoom(): number; project(l: [number, number]): { x: number; y: number }; unproject(p: [number, number]): { lat: number; lng: number } } };

/** Click the visible part of the world map (above the bottom wheel panel) at fractional coordinates. */
export async function clickMap(page: Page, fx = 0.5, fy = 0.4) {
  const map = page.getByTestId('world-map').first();
  await expect(map).toHaveAttribute('data-ready', 'true');
  await map.scrollIntoViewIfNeeded(); // on setup pages the map can start below the fold, like for a real user
  const box = (await map.boundingBox())!;
  const panel = await page.getByTestId('wheel-panel').boundingBox();
  const visibleH = (panel ? panel.y : box.y + box.height) - box.y;
  await page.mouse.click(box.x + box.width * fx, box.y + visibleH * fy);
}

export const mapCenter = (page: Page) => page.evaluate(() => {
  const m = (window as unknown as FbWindow).__fbMap!;
  const c = m.getCenter();
  return { lat: c.lat, lng: c.lng, zoom: m.getZoom() };
});

export async function pinCoords(page: Page) {
  const map = page.getByTestId('world-map').first();
  const lat = await map.getAttribute('data-pin-lat');
  const lng = await map.getAttribute('data-pin-lng');
  return lat && lng ? { lat: Number(lat), lng: Number(lng) } : null;
}

/** Move a wheel to a value with the keyboard (the accessible path), then wait for it to settle. */
export async function setWheel(page: Page, testId: 'month-wheel' | 'year-wheel', value: number) {
  const wheel = page.getByTestId(testId);
  const values: number[] = await wheel.evaluate((el) => [...el.querySelectorAll('[role=option]')].map((o) => Number((o as HTMLElement).dataset.value)));
  const current = Number(await wheel.getAttribute('data-value'));
  const delta = values.indexOf(value) - values.indexOf(current);
  await wheel.focus();
  const key = delta > 0 ? 'ArrowDown' : 'ArrowUp';
  const big = delta > 0 ? 'PageDown' : 'PageUp';
  let left = Math.abs(delta);
  while (left >= 3) {
    await wheel.press(big);
    left -= 3;
  }
  while (left-- > 0) await wheel.press(key);
  await expect(wheel).toHaveAttribute('data-value', String(value));
}

/** A real, distinct JPEG. Optional EXIF GPS + date to test host-only suggestions. */
export async function makeImage(seed: number, opts: { gps?: boolean } = {}): Promise<Buffer> {
  let p = sharp({ create: { width: 900, height: 600, channels: 3, background: { r: (seed * 53) % 255, g: (seed * 97) % 255, b: (seed * 29) % 255 } } }).composite([
    { input: Buffer.from(`<svg width="300" height="200"><circle cx="150" cy="100" r="${50 + seed * 7}" fill="white"/></svg>`), top: 100 + seed * 20, left: 80 + seed * 40 },
  ]);
  if (opts.gps) {
    p = p.withExif({
      IFD0: { Make: 'TestCam' },
      IFD2: { DateTimeOriginal: '2022:08:14 19:03:11' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '32/1 4/1 48/1', GPSLongitudeRef: 'E', GPSLongitude: '34/1 46/1 12/1' },
    });
  }
  return p.jpeg().toBuffer();
}

/** Creates a ready-to-play demo game for this browser context and returns its ids. */
export async function createDemo(request: APIRequestContext, mode: 'couple' | 'family_shared' | 'party') {
  const res = await request.post('/api/demo', { data: { mode } });
  expect(res.ok(), await res.text()).toBeTruthy();
  return (await res.json()) as { id: string; joinCode: string | null; status: string };
}

export async function newPlayer(browser: Browser, baseURL: string): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  return { ctx, page };
}

export async function guessOnce(page: Page, opts: { fx?: number; fy?: number } = {}) {
  await clickMap(page, opts.fx ?? 0.5, opts.fy ?? 0.4);
  await expect(page.getByTestId('confirm-guess')).toBeEnabled();
  await page.getByTestId('confirm-guess').click();
}
