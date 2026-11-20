import { SCORING, type ScoringConfig, type Stage } from './config';
import { haversineKm, type LatLng } from './geo';
import { monthDiff, type MonthYear } from './date';

export type ScoreBreakdown = {
  location: number;
  date: number;
  zoom: number;
  total: number;
  distanceKm: number;
  monthDiff: number;
};

export function locationPoints(distanceKm: number, cfg: ScoringConfig = SCORING): number {
  for (const t of cfg.location) if (distanceKm <= t.maxKm) return t.points;
  return 0;
}

export function datePoints(diffMonths: number, cfg: ScoringConfig = SCORING): number {
  for (const t of cfg.date) if (diffMonths <= t.maxMonths) return t.points;
  return 0;
}

/** Pure scoring: max 100 = location 50 + date 30 + zoom bonus 20. */
export function scoreGuess(
  truth: LatLng & MonthYear,
  guess: LatLng & MonthYear,
  stage: Stage,
  cfg: ScoringConfig = SCORING,
): ScoreBreakdown {
  const distanceKm = haversineKm(truth, guess);
  const diff = monthDiff(truth, guess);
  const location = locationPoints(distanceKm, cfg);
  const date = datePoints(diff, cfg);
  const zoom = cfg.zoomBonusRequiresAccuracy && location + date === 0 ? 0 : (cfg.zoom[stage] ?? 0);
  return { location, date, zoom, total: location + date + zoom, distanceKm, monthDiff: diff };
}

/** Scratch games: same location and date points, but the 20-point bonus depends on how much of the photo you revealed. */
export function scratchBonus(revealedPct: number, cfg: ScoringConfig = SCORING): number {
  for (const t of cfg.scratch) if (revealedPct <= t.maxPct) return t.points;
  return 0;
}

export function scoreGuessScratch(truth: LatLng & MonthYear, guess: LatLng & MonthYear, revealedPct: number, cfg: ScoringConfig = SCORING): ScoreBreakdown {
  const distanceKm = haversineKm(truth, guess);
  const diff = monthDiff(truth, guess);
  const location = locationPoints(distanceKm, cfg);
  const date = datePoints(diff, cfg);
  const zoom = cfg.zoomBonusRequiresAccuracy && location + date === 0 ? 0 : scratchBonus(revealedPct, cfg);
  return { location, date, zoom, total: location + date + zoom, distanceKm, monthDiff: diff };
}

export const MAX_ROUND_SCORE = 100;
