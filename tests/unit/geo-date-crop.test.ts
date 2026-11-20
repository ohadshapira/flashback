import { describe, expect, it } from 'vitest';
import { haversineKm, isValidLatLng, normalizeLng, unwrapLng } from '@/lib/geo';
import { clampMonthYear, isValidMonthYear, maxAllowedMonthYear, monthDiff, monthIndex, monthNames } from '@/lib/date';
import { cropWindow, stageWindow, windowToCss } from '@/lib/crop';

describe('geo', () => {
  it('computes known distances', () => {
    expect(haversineKm({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 })).toBeCloseTo(343.5, 0); // Paris–London
    expect(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 90 })).toBeCloseTo(10007.5, 0);
  });
  it('handles the International Date Line (179°E ↔ 179°W is ~222 km, not ~40,000)', () => {
    const d = haversineKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 });
    expect(d).toBeCloseTo(222.4, 0);
    expect(haversineKm({ lat: 0, lng: 180 }, { lat: 0, lng: -180 })).toBeCloseTo(0, 5);
  });
  it('is symmetric and zero for identical points', () => {
    const a = { lat: 10, lng: 20 };
    const b = { lat: -33, lng: 151 };
    expect(haversineKm(a, b)).toBeCloseTo(haversineKm(b, a), 8);
    expect(haversineKm(a, a)).toBe(0);
  });
  it('normalizes longitude', () => {
    expect(normalizeLng(190)).toBe(-170);
    expect(normalizeLng(-190)).toBe(170);
    expect(normalizeLng(540)).toBe(-180);
    expect(normalizeLng(35)).toBe(35);
  });
  it('unwraps longitude for drawing across the date line', () => {
    expect(unwrapLng(179, -179)).toBe(181);
    expect(unwrapLng(-179, 179)).toBe(-181);
    expect(unwrapLng(10, 20)).toBe(20);
  });
  it('validates coordinate bounds', () => {
    expect(isValidLatLng({ lat: 90, lng: 180 })).toBe(true);
    expect(isValidLatLng({ lat: 90.1, lng: 0 })).toBe(false);
    expect(isValidLatLng({ lat: 0, lng: -181 })).toBe(false);
    expect(isValidLatLng({ lat: NaN, lng: 0 })).toBe(false);
  });
});

describe('month/year logic (no Date drift)', () => {
  it('diffs months across years', () => {
    expect(monthDiff({ month: 12, year: 2021 }, { month: 1, year: 2022 })).toBe(1);
    expect(monthDiff({ month: 1, year: 2020 }, { month: 1, year: 2022 })).toBe(24);
    expect(monthIndex({ month: 1, year: 0 })).toBe(0);
  });
  it('rejects future months but not historic ones', () => {
    const max = { month: 6, year: 2026 };
    expect(isValidMonthYear({ month: 6, year: 2026 }, max)).toBe(true);
    expect(isValidMonthYear({ month: 7, year: 2026 }, max)).toBe(false);
    expect(isValidMonthYear({ month: 12, year: 2025 }, max)).toBe(true); // later month, earlier year is fine
    expect(isValidMonthYear({ month: 1, year: 1899 }, max)).toBe(false);
    expect(isValidMonthYear({ month: 13, year: 2020 }, max)).toBe(false);
    expect(isValidMonthYear({ month: 2.5, year: 2020 }, max)).toBe(false);
  });
  it('clamps only inside the current year', () => {
    const max = { month: 6, year: 2026 };
    expect(clampMonthYear({ month: 11, year: 2026 }, max)).toEqual({ month: 6, year: 2026 });
    expect(clampMonthYear({ month: 11, year: 2025 }, max)).toEqual({ month: 11, year: 2025 });
    expect(clampMonthYear({ month: 3, year: 2040 }, max)).toEqual({ month: 6, year: 2026 });
  });
  it('allows a client already in the next UTC month (UTC+14 tolerance)', () => {
    // 2026-06-30T23:00Z is already 2026-07-01 in UTC+14
    expect(maxAllowedMonthYear(Date.UTC(2026, 5, 30, 23))).toEqual({ month: 7, year: 2026 });
    expect(maxAllowedMonthYear(Date.UTC(2026, 5, 15, 12))).toEqual({ month: 6, year: 2026 });
  });
  it('localizes month names', () => {
    expect(monthNames('en')[0]).toBe('January');
    expect(monthNames('he')).toHaveLength(12);
    expect(monthNames('he')[0]).toBe('ינואר');
  });
});

describe('crop geometry', () => {
  it('centres the window and preserves aspect ratio', () => {
    const w = cropWindow(2000, 1000, 0.5, 0.5, 4);
    expect(w).toEqual({ left: 750, top: 375, width: 500, height: 250 });
  });
  it('clamps at the edges instead of leaving empty space', () => {
    expect(cropWindow(2000, 1000, 0, 0, 4)).toMatchObject({ left: 0, top: 0 });
    const br = cropWindow(2000, 1000, 1, 1, 4);
    expect(br.left + br.width).toBe(2000);
    expect(br.top + br.height).toBe(1000);
  });
  it('widens monotonically with stage and always stays inside the image', () => {
    const widths = [1, 2, 3, 4].map((s) => stageWindow(1600, 1067, 0.3, 0.7, s as 1 | 2 | 3 | 4).width);
    expect(widths).toEqual([...widths].sort((a, b) => a - b));
    for (const s of [1, 2, 3, 4] as const) {
      const w = stageWindow(1600, 1067, 0.99, 0.01, s);
      expect(w.left).toBeGreaterThanOrEqual(0);
      expect(w.left + w.width).toBeLessThanOrEqual(1600);
      expect(w.top + w.height).toBeLessThanOrEqual(1067);
    }
  });
  it('produces CSS percentages for the live preview', () => {
    const css = windowToCss(cropWindow(1000, 500, 0.5, 0.5, 2), 1000, 500);
    expect(css.width).toBe('200%');
    expect(css.left).toBe('-50%');
  });
});
