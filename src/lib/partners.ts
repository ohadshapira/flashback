import { haversineKm, type LatLng } from './geo';
import type { MonthYear } from './date';

/** Pure helpers for "Partners" games (a parent and a child, one team). Shared by the server and the browser. */

export const PLACE_ICONS = ['🏠', '👵', '👴', '🎒', '🌳', '🏖️', '🛝', '⚽', '🐶', '🍦', '⛺', '✈️'] as const;
export type PlaceIcon = (typeof PLACE_ICONS)[number];

export type PartnerPlace = { icon: PlaceIcon; label: string; lat: number; lng: number };

export type PartnersProfile = {
  /** The child's name. */
  childName: string;
  /** What the child calls the grown-up (Mom, Dad, Grandpa...). */
  parentName: string;
  birth: MonthYear | null;
  places: PartnerPlace[];
};

export const PARTNERS_LIMITS = { nameMax: 20, labelMax: 20, maxPlaces: 6, nearKm: 3, snapPx: 44 } as const;

export type Role = 'map' | 'wheels';

/** The child starts on the map (round index 0), then the jobs swap every round. */
export const childRole = (roundIndex: number): Role => (roundIndex % 2 === 0 ? 'map' : 'wheels');

export function roundJobs(profile: Pick<PartnersProfile, 'childName' | 'parentName'>, roundIndex: number): { map: string; wheels: string; childOnMap: boolean } {
  const childOnMap = childRole(roundIndex) === 'map';
  return childOnMap
    ? { map: profile.childName, wheels: profile.parentName, childOnMap }
    : { map: profile.parentName, wheels: profile.childName, childOnMap };
}

/** Whole years of age at `at` (month granularity). Negative before the birth month. */
export function ageAt(birth: MonthYear, at: MonthYear): number {
  const months = (at.year - birth.year) * 12 + (at.month - birth.month);
  return Math.floor(months / 12);
}

export type Season = 'winter' | 'spring' | 'summer' | 'autumn';

/** Northern-hemisphere seasons, flipped by six months in the southern hemisphere. */
export function seasonOf(month: number, south = false): Season {
  const m = south ? ((month + 5) % 12) + 1 : month;
  if (m === 12 || m <= 2) return 'winter';
  if (m <= 5) return 'spring';
  if (m <= 8) return 'summer';
  return 'autumn';
}

const SEASON_ICONS: Record<Season, string> = { winter: '❄️', spring: '🌸', summer: '☀️', autumn: '🍂' };
export const seasonIcon = (month: number, south = false): string => SEASON_ICONS[seasonOf(month, south)];

/** The first marked place decides the hemisphere; with no places it is the north. */
export const isSouthern = (profile: Pick<PartnersProfile, 'places'>): boolean => (profile.places[0]?.lat ?? 0) < 0;

export function nearestPlace(places: readonly PartnerPlace[], point: LatLng, maxKm: number = PARTNERS_LIMITS.nearKm): PartnerPlace | null {
  let best: PartnerPlace | null = null;
  let bestKm = Infinity;
  for (const p of places) {
    const km = haversineKm(p, point);
    if (km <= maxKm && km < bestKm) {
      best = p;
      bestKm = km;
    }
  }
  return best;
}

/** Both coordinates equal (within 1e-6 degrees): a pin snapped onto a place. */
export const isAt = (a: LatLng, b: LatLng): boolean => Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
