/** Central, tweakable game configuration. Scoring thresholds live here so they can be tuned without touching logic. */

export const STAGE_COUNT = 4;
export type Stage = 1 | 2 | 3 | 4;

/** Field-of-view zoom factor per reveal stage (stage 1 = tightest). */
export const ZOOM_FACTORS = [6, 3.5, 2, 1.25] as const;

export const LIMITS = {
  minPhotos: 3,
  maxPhotos: 10,
  defaultPhotos: 3,
  maxUploadBytes: 15 * 1024 * 1024,
  maxPartyPlayers: 12,
  titleMax: 80,
  storyMax: 500,
  nameMax: 20,
  minYear: 1900,
} as const;

/**
 * Party timings. FLASHBACK_TIME_SCALE (default 1) divides every duration; it exists only so automated
 * tests can run a 60-second round in a few seconds. Leave it unset in real deployments.
 */
const scale = () => {
  const n = Number(process.env.FLASHBACK_TIME_SCALE);
  return Number.isFinite(n) && n >= 1 ? n : 1;
};

export const PARTY = {
  get roundSeconds() {
    return 60 / scale();
  },
  /** Elapsed seconds at which stage 1, 2, 3, 4 begin. */
  get stageStartSeconds() {
    return [0, 15, 30, 45].map((s) => s / scale());
  },
  joinWindowMs: 6 * 60 * 60 * 1000,
  /** If the host has not been seen for this long at a reveal, the room advances by itself. */
  get hostAbsentMs() {
    return 60_000 / scale();
  },
  get revealAutoAdvanceMs() {
    return 20_000 / scale();
  },
};

/** Party play styles. `scratch`: the photo is revealed by scratching it. */
export type PlayStyle = 'classic' | 'scratch';

/** Scratch grid: the photo is cut into SCRATCH.cols columns (rows follow the photo's shape); one tile = one cell. */
export const SCRATCH = { cols: 20, minRows: 8, maxRows: 28 } as const;

export type ScoringConfig = {
  location: { maxKm: number; points: number }[];
  date: { maxMonths: number; points: number }[];
  zoom: Record<Stage, number>;
  /** Scratch games: bonus (replaces the zoom bonus) by the share of the photo revealed, in percent. */
  scratch: { maxPct: number; points: number }[];
  zoomBonusRequiresAccuracy: boolean;
};

export const SCORING: ScoringConfig = {
  location: [
    { maxKm: 10, points: 50 },
    { maxKm: 50, points: 40 },
    { maxKm: 200, points: 25 },
    { maxKm: 1000, points: 10 },
  ],
  date: [
    { maxMonths: 0, points: 30 },
    { maxMonths: 1, points: 24 },
    { maxMonths: 3, points: 15 },
    { maxMonths: 6, points: 8 },
    { maxMonths: 12, points: 4 },
  ],
  zoom: { 1: 20, 2: 15, 3: 10, 4: 5 },
  scratch: [
    { maxPct: 10, points: 20 },
    { maxPct: 25, points: 15 },
    { maxPct: 45, points: 10 },
    { maxPct: 70, points: 5 },
  ],
  /** When true, the zoom bonus is only granted if location or date earned points. Spec default: false. */
  zoomBonusRequiresAccuracy: false,
};

export function retentionDays(): number {
  const n = Number(process.env.IMAGE_RETENTION_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

export function demoModeEnabled(): boolean {
  return (process.env.DEMO_MODE ?? 'true').toLowerCase() !== 'false';
}
