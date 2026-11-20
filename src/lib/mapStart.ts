/**
 * Where the map opens. Default: the player's own region, so they do not have to drag across the planet.
 *
 * Privacy: this runs entirely in the browser. It uses (a) the device location ONLY if the user already granted that
 * permission to this site (we never prompt), otherwise (b) the browser's IANA time zone mapped to a region. Nothing is
 * sent to a server. Set NEXT_PUBLIC_MAP_START=world to always open on the neutral world view instead.
 */
export type MapStart = { lat: number; lng: number; zoom: number; source: 'geolocation' | 'timezone' | 'offset' | 'world' };

/** [lat, lng, zoom] for a ~375px-wide phone map: a country/region-sized view. */
const ZONES: Record<string, [number, number, number]> = {
  // Middle East
  'Asia/Jerusalem': [31.6, 35.0, 6.4], 'Asia/Tel_Aviv': [31.6, 35.0, 6.4], 'Asia/Beirut': [33.9, 35.9, 7.4], 'Asia/Amman': [31.3, 36.5, 6.6],
  'Asia/Dubai': [24.4, 54.6, 6.4], 'Asia/Riyadh': [24.0, 44.0, 4.6], 'Asia/Qatar': [25.3, 51.2, 8], 'Asia/Kuwait': [29.3, 47.7, 7.6],
  'Asia/Baghdad': [33.0, 44.0, 5], 'Asia/Tehran': [32.4, 53.7, 4.4], 'Asia/Baku': [40.3, 47.7, 6], 'Asia/Tbilisi': [42.0, 43.5, 6.6], 'Asia/Yerevan': [40.2, 44.8, 7],
  // Europe
  'Europe/London': [52.6, -1.8, 4.8], 'Europe/Dublin': [53.3, -7.6, 5.6], 'Europe/Paris': [46.6, 2.4, 4.9], 'Europe/Berlin': [51.0, 10.2, 5], 'Europe/Madrid': [40.0, -3.7, 4.9],
  'Europe/Lisbon': [39.6, -8.0, 5.6], 'Europe/Rome': [42.5, 12.6, 4.9], 'Europe/Amsterdam': [52.2, 5.3, 6.4], 'Europe/Brussels': [50.6, 4.6, 6.8], 'Europe/Zurich': [46.8, 8.2, 6.9],
  'Europe/Vienna': [47.6, 14.1, 6.4], 'Europe/Prague': [49.8, 15.5, 6.4], 'Europe/Warsaw': [52.1, 19.4, 5.5], 'Europe/Budapest': [47.2, 19.4, 6.5], 'Europe/Bucharest': [45.9, 25.0, 5.8],
  'Europe/Athens': [38.4, 23.7, 5.8], 'Europe/Istanbul': [39.0, 35.2, 4.8], 'Europe/Kiev': [49.0, 31.5, 4.9], 'Europe/Kyiv': [49.0, 31.5, 4.9], 'Europe/Moscow': [56.0, 37.6, 4.4],
  'Europe/Stockholm': [60.0, 15.5, 4.2], 'Europe/Oslo': [61.0, 9.0, 4.2], 'Europe/Copenhagen': [56.0, 10.4, 6], 'Europe/Helsinki': [62.0, 26.0, 4.4], 'Europe/Sofia': [42.7, 25.5, 6.4],
  'Europe/Belgrade': [44.0, 20.8, 6.4], 'Europe/Zagreb': [45.5, 16.0, 6.3], 'Europe/Riga': [56.9, 24.6, 6.4], 'Europe/Vilnius': [55.2, 23.9, 6.4], 'Europe/Tallinn': [58.7, 25.5, 6.6],
  'Europe/Luxembourg': [49.8, 6.1, 8.6], 'Europe/Malta': [35.9, 14.4, 8.8], 'Atlantic/Reykjavik': [64.9, -18.5, 5.2], 'Asia/Nicosia': [35.0, 33.3, 7.6],
  // North America
  'America/New_York': [40.7, -76.0, 4.8], 'America/Toronto': [44.5, -79.5, 5], 'America/Chicago': [39.0, -90.0, 4.4], 'America/Denver': [39.5, -105.5, 4.4],
  'America/Phoenix': [34.0, -111.9, 5], 'America/Los_Angeles': [36.5, -119.5, 4.6], 'America/Vancouver': [49.8, -123.0, 5.2], 'America/Anchorage': [62.0, -150.0, 3.6],
  'Pacific/Honolulu': [20.8, -157.4, 6.4], 'America/Mexico_City': [21.0, -99.5, 4.8], 'America/Halifax': [45.0, -63.0, 5.6], 'America/Edmonton': [52.0, -113.5, 4.8],
  'America/Winnipeg': [50.0, -98.0, 4.8], 'America/Panama': [8.6, -80.0, 7], 'America/Havana': [22.0, -79.5, 6.2], 'America/Puerto_Rico': [18.2, -66.5, 8.4],
  // South America
  'America/Bogota': [4.6, -74.0, 5], 'America/Lima': [-10.0, -75.5, 4.6], 'America/Santiago': [-33.5, -70.7, 5.2], 'America/Argentina/Buenos_Aires': [-34.6, -61.0, 4.8],
  'America/Buenos_Aires': [-34.6, -61.0, 4.8], 'America/Sao_Paulo': [-22.5, -46.0, 5], 'America/Caracas': [8.0, -66.0, 5.2], 'America/Montevideo': [-33.0, -56.0, 6.2],
  'America/Guayaquil': [-1.8, -78.2, 6], 'America/La_Paz': [-16.5, -65.0, 5],
  // Africa
  'Africa/Cairo': [28.0, 30.5, 5], 'Africa/Johannesburg': [-28.5, 25.0, 4.8], 'Africa/Lagos': [9.1, 7.5, 5.4], 'Africa/Nairobi': [0.5, 37.8, 5.4], 'Africa/Casablanca': [32.0, -6.5, 5.4],
  'Africa/Algiers': [32.0, 3.0, 4.6], 'Africa/Tunis': [34.0, 9.5, 6], 'Africa/Accra': [7.9, -1.0, 6], 'Africa/Addis_Ababa': [9.0, 40.0, 5], 'Africa/Dar_es_Salaam': [-6.4, 35.0, 5.2],
  // Asia
  'Asia/Karachi': [30.0, 70.0, 4.8], 'Asia/Kolkata': [22.5, 79.0, 4], 'Asia/Calcutta': [22.5, 79.0, 4], 'Asia/Dhaka': [23.8, 90.3, 6.4], 'Asia/Colombo': [7.8, 80.7, 7],
  'Asia/Kathmandu': [28.2, 84.0, 6.6], 'Asia/Bangkok': [14.5, 101.0, 5.2], 'Asia/Ho_Chi_Minh': [14.5, 107.0, 4.8], 'Asia/Saigon': [14.5, 107.0, 4.8], 'Asia/Singapore': [1.35, 103.8, 9.6],
  'Asia/Kuala_Lumpur': [3.8, 102.0, 6], 'Asia/Jakarta': [-6.5, 108.0, 5.4], 'Asia/Manila': [12.8, 122.0, 5.2], 'Asia/Hong_Kong': [22.3, 114.2, 9.2], 'Asia/Shanghai': [34.0, 108.0, 3.7],
  'Asia/Taipei': [23.8, 121.0, 7], 'Asia/Seoul': [36.4, 127.8, 6.2], 'Asia/Tokyo': [36.0, 138.0, 5], 'Asia/Almaty': [45.0, 68.0, 4], 'Asia/Tashkent': [41.3, 64.5, 5.2],
  'Asia/Ulaanbaatar': [47.0, 104.0, 4.4], 'Asia/Yangon': [20.0, 96.5, 5], 'Asia/Phnom_Penh': [12.6, 104.9, 6.6],
  // Oceania
  'Australia/Sydney': [-33.0, 149.5, 5.2], 'Australia/Melbourne': [-37.0, 145.0, 5.8], 'Australia/Brisbane': [-24.0, 148.0, 4.6], 'Australia/Perth': [-31.9, 117.0, 4.8],
  'Australia/Adelaide': [-33.0, 138.0, 5.2], 'Pacific/Auckland': [-40.5, 174.5, 5.2],
};

/** Pure: time-zone name (and UTC offset in minutes, for unlisted zones) → a regional start view. */
export function startFromTimeZone(timeZone: string | undefined, offsetMinutes: number): MapStart {
  const hit = timeZone ? ZONES[timeZone] : undefined;
  if (hit) return { lat: hit[0], lng: hit[1], zoom: hit[2], source: 'timezone' };
  // Unknown zone: the UTC offset still tells us roughly which longitude band the user is in.
  const lng = Math.max(-170, Math.min(170, (-offsetMinutes / 60) * 15));
  return { lat: 28, lng, zoom: 2.6, source: 'offset' };
}

export const WORLD_START: MapStart = { lat: 22, lng: 10, zoom: 0, source: 'world' };

export function mapStartMode(): 'local' | 'world' {
  return process.env.NEXT_PUBLIC_MAP_START === 'world' ? 'world' : 'local';
}

/** Device location, but only when the user has ALREADY granted it (never triggers a permission prompt). */
async function grantedPosition(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (!navigator.geolocation || !navigator.permissions) return null;
    const status = await Promise.race([navigator.permissions.query({ name: 'geolocation' as PermissionName }), new Promise<null>((r) => setTimeout(() => r(null), 400))]);
    if (!status || status.state !== 'granted') return null;
    return await new Promise((resolve) =>
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { maximumAge: 3_600_000, timeout: 2500, enableHighAccuracy: false },
      ),
    );
  } catch {
    return null;
  }
}

/** Resolve the opening view; `world` means the caller should use its own neutral world-scale view. */
export async function resolveMapStart(): Promise<MapStart> {
  if (mapStartMode() === 'world') return WORLD_START;
  const pos = await grantedPosition();
  if (pos) return { lat: pos.lat, lng: pos.lng, zoom: 7.2, source: 'geolocation' };
  let tz: string | undefined;
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    tz = undefined;
  }
  return startFromTimeZone(tz, new Date().getTimezoneOffset());
}
