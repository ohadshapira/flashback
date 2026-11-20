import { describe, expect, it } from 'vitest';
import { startFromTimeZone } from '@/lib/mapStart';

describe('startFromTimeZone', () => {
  it('opens on Israel for Asia/Jerusalem at a regional zoom', () => {
    const s = startFromTimeZone('Asia/Jerusalem', -120);
    expect(s.source).toBe('timezone');
    expect(s.lat).toBeGreaterThan(29);
    expect(s.lat).toBeLessThan(34);
    expect(s.lng).toBeGreaterThan(34);
    expect(s.lng).toBeLessThan(36);
    expect(s.zoom).toBeGreaterThan(5);
  });

  it('falls back to the UTC-offset longitude for an unknown zone', () => {
    const s = startFromTimeZone('Mars/Olympus_Mons', -180); // UTC+3 → ~45°E
    expect(s.source).toBe('offset');
    expect(s.lng).toBeCloseTo(45, 5);
    expect(s.zoom).toBeLessThan(4);
  });

  it('copes with a missing time zone and clamps extreme offsets', () => {
    expect(startFromTimeZone(undefined, 0).source).toBe('offset');
    expect(Math.abs(startFromTimeZone(undefined, -900).lng)).toBeLessThanOrEqual(170);
  });

  it('every listed zone is a plausible coordinate', () => {
    for (const tz of ['Europe/London', 'America/New_York', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland', 'America/Sao_Paulo']) {
      const s = startFromTimeZone(tz, 0);
      expect(s.source).toBe('timezone');
      expect(Math.abs(s.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(s.lng)).toBeLessThanOrEqual(180);
    }
  });
});
