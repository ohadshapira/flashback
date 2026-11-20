export const EARTH_RADIUS_KM = 6371.0088;

export type LatLng = { lat: number; lng: number };

/** Wraps any longitude into [-180, 180). */
export function normalizeLng(lng: number): number {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

export function isValidLatLng(p: LatLng): boolean {
  return Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= -90 && p.lat <= 90 && p.lng >= -180 && p.lng <= 180;
}

const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km (haversine). Correct across the International Date Line. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  // sin² of half the longitude delta is periodic, so 179°E vs 179°W is handled without special-casing.
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Returns lng shifted by multiples of 360 so it is within 180° of refLng (for drawing lines across the date line). */
export function unwrapLng(refLng: number, lng: number): number {
  let l = lng;
  while (l - refLng > 180) l -= 360;
  while (l - refLng < -180) l += 360;
  return l;
}

export function formatDistance(km: number, locale = 'en'): string {
  // Locale unit names (e.g. Hebrew "ק״מ" / "מ׳"), with a plain fallback for runtimes without unit formatting.
  try {
    if (km < 1) return new Intl.NumberFormat(locale, { style: 'unit', unit: 'meter', unitDisplay: 'short', maximumFractionDigits: 0 }).format(Math.round(km * 1000));
    return new Intl.NumberFormat(locale, { style: 'unit', unit: 'kilometer', unitDisplay: 'short', maximumFractionDigits: km < 100 ? 1 : 0 }).format(km);
  } catch {
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${new Intl.NumberFormat(locale, { maximumFractionDigits: km < 100 ? 1 : 0 }).format(km)} km`;
  }
}
