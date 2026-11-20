import { describe, expect, it } from 'vitest';
import { datePoints, locationPoints, scoreGuess } from '@/lib/scoring';
import { SCORING } from '@/lib/config';

describe('locationPoints', () => {
  it.each([
    [0, 50],
    [10, 50],
    [10.01, 40],
    [50, 40],
    [50.01, 25],
    [200, 25],
    [200.01, 10],
    [1000, 10],
    [1000.01, 0],
    [15000, 0],
  ])('%f km → %i', (km, pts) => expect(locationPoints(km)).toBe(pts));
});

describe('datePoints', () => {
  it.each([
    [0, 30],
    [1, 24],
    [2, 15],
    [3, 15],
    [4, 8],
    [6, 8],
    [7, 4],
    [12, 4],
    [13, 0],
    [120, 0],
  ])('%i months → %i', (m, pts) => expect(datePoints(m)).toBe(pts));
});

describe('scoreGuess', () => {
  const truth = { lat: 48.86, lng: 2.35, month: 5, year: 2019 };
  it('awards the maximum of 100 for a perfect guess at stage 1', () => {
    const s = scoreGuess(truth, truth, 1);
    expect(s).toMatchObject({ location: 50, date: 30, zoom: 20, total: 100, monthDiff: 0 });
    expect(s.distanceKm).toBeCloseTo(0, 5);
  });
  it('applies the zoom bonus by stage: 20/15/10/5', () => {
    expect([1, 2, 3, 4].map((st) => scoreGuess(truth, truth, st as 1 | 2 | 3 | 4).zoom)).toEqual([20, 15, 10, 5]);
  });
  it('uses absolute month difference across a year boundary', () => {
    expect(scoreGuess(truth, { ...truth, month: 12, year: 2018 }, 1).monthDiff).toBe(5);
    expect(scoreGuess({ ...truth, month: 1, year: 2020 }, { ...truth, month: 12, year: 2019 }, 1).monthDiff).toBe(1);
    expect(scoreGuess(truth, { ...truth, month: 5, year: 2020 }, 1).date).toBe(4); // 12 months
    expect(scoreGuess(truth, { ...truth, month: 6, year: 2020 }, 1).date).toBe(0); // 13 months
  });
  it('scores a far-off guess as zero for location and date, keeping only the zoom bonus', () => {
    const s = scoreGuess(truth, { lat: -33.9, lng: 151.2, month: 1, year: 2000 }, 4);
    expect(s).toMatchObject({ location: 0, date: 0, zoom: 5, total: 5 });
  });
  it('can require accuracy before the zoom bonus (config)', () => {
    const cfg = { ...SCORING, zoomBonusRequiresAccuracy: true };
    expect(scoreGuess(truth, { lat: -33.9, lng: 151.2, month: 1, year: 2000 }, 1, cfg).zoom).toBe(0);
  });
});
