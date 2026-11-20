import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PARTNERS_LIMITS,
  PLACE_ICONS,
  ageAt,
  childRole,
  isAt,
  isSouthern,
  nearestPlace,
  roundJobs,
  seasonIcon,
  seasonOf,
  type PartnerPlace,
} from '@/lib/partners';
import { partnersSchema } from '@/lib/schemas';
import { DEMO_SCENES } from '@/lib/demo-scenes';

/** Pure helpers first, then integration on a real SQLite file in a temp data dir (same pattern as game-flow.test.ts). */

const profile = { childName: 'Noa', parentName: 'Mom' };
const home: PartnerPlace = { icon: '🏠', label: 'Home', lat: 31.7784, lng: 35.2066 };
const grandma: PartnerPlace = { icon: '👵', label: 'Grandma', lat: 32.794, lng: 34.9896 };

describe('jobs', () => {
  it('the child starts on the map and the jobs swap every round', () => {
    expect([0, 1, 2, 3].map(childRole)).toEqual(['map', 'wheels', 'map', 'wheels']);
    expect(roundJobs(profile, 0)).toEqual({ map: 'Noa', wheels: 'Mom', childOnMap: true });
    expect(roundJobs(profile, 1)).toEqual({ map: 'Mom', wheels: 'Noa', childOnMap: false });
    expect(roundJobs(profile, 2).childOnMap).toBe(true);
  });
});

describe('age', () => {
  const birth = { month: 3, year: 2018 };
  it('counts whole years at the selected month, negative before the birth month', () => {
    expect(ageAt(birth, { month: 2, year: 2018 })).toBe(-1);
    expect(ageAt(birth, { month: 3, year: 2018 })).toBe(0);
    expect(ageAt(birth, { month: 2, year: 2022 })).toBe(3);
    expect(ageAt(birth, { month: 3, year: 2022 })).toBe(4);
    expect(ageAt(birth, { month: 8, year: 2022 })).toBe(4);
  });
});

describe('seasons', () => {
  it('follow the northern calendar, flipped by six months in the south', () => {
    expect([12, 1, 2].map((m) => seasonOf(m))).toEqual(['winter', 'winter', 'winter']);
    expect([3, 4, 5].map((m) => seasonOf(m))).toEqual(['spring', 'spring', 'spring']);
    expect([6, 7, 8].map((m) => seasonOf(m))).toEqual(['summer', 'summer', 'summer']);
    expect([9, 10, 11].map((m) => seasonOf(m))).toEqual(['autumn', 'autumn', 'autumn']);
    expect(seasonIcon(1)).toBe('❄️');
    expect(seasonIcon(4)).toBe('🌸');
    expect(seasonIcon(7)).toBe('☀️');
    expect(seasonIcon(10)).toBe('🍂');
    expect(seasonOf(1, true)).toBe('summer');
    expect(seasonOf(7, true)).toBe('winter');
    expect(seasonOf(4, true)).toBe('autumn');
    expect(seasonOf(10, true)).toBe('spring');
    expect(seasonOf(12, true)).toBe('summer');
  });
  it('the first place decides the hemisphere; no places means north', () => {
    expect(isSouthern({ places: [] })).toBe(false);
    expect(isSouthern({ places: [home] })).toBe(false);
    expect(isSouthern({ places: [{ ...home, lat: -33.9, lng: 151.2 }, home] })).toBe(true);
  });
});

describe('places', () => {
  const paris = { lat: 48.86, lng: 2.29 };
  it('nearestPlace hits within 3 km and is null for Paris', () => {
    expect(nearestPlace([home, grandma], { lat: home.lat + 0.01, lng: home.lng })?.label).toBe('Home'); // about 1.1 km
    expect(nearestPlace([home, grandma], paris)).toBeNull();
  });
  it('is null between two far places, and the nearer one wins', () => {
    const between = { lat: (home.lat + grandma.lat) / 2, lng: (home.lng + grandma.lng) / 2 };
    expect(nearestPlace([home, grandma], between)).toBeNull();
    expect(nearestPlace([home, { ...grandma, lat: home.lat + 0.015, lng: home.lng }], { lat: home.lat + 0.012, lng: home.lng })?.label).toBe('Grandma');
  });
  it('isAt needs both coordinates equal (1e-6)', () => {
    expect(isAt(home, { lat: home.lat, lng: home.lng })).toBe(true);
    expect(isAt(home, { lat: home.lat + 5e-7, lng: home.lng })).toBe(true);
    expect(isAt(home, { lat: home.lat + 1e-4, lng: home.lng })).toBe(false);
    expect(isAt(home, { lat: home.lat, lng: home.lng + 1e-4 })).toBe(false);
  });
});

describe('partnersSchema', () => {
  const ok = { childName: ' Noa ', parentName: ' Mom ' };
  it('trims names and defaults birth and places', () => {
    expect(partnersSchema.parse(ok)).toEqual({ childName: 'Noa', parentName: 'Mom', birth: null, places: [] });
    expect(partnersSchema.parse({ ...ok, birth: null }).birth).toBeNull();
  });
  it('trims place labels', () => {
    const r = partnersSchema.parse({ ...ok, places: [{ icon: '🏠', label: '  Home  ', lat: 1, lng: 2 }] });
    expect(r.places[0].label).toBe('Home');
  });
  it('rejects an empty name, an unknown icon, 7 places, a 21-char label and a future birth', () => {
    expect(partnersSchema.safeParse({ ...ok, childName: '   ' }).success).toBe(false);
    expect(partnersSchema.safeParse({ ...ok, parentName: '' }).success).toBe(false);
    expect(partnersSchema.safeParse({ ...ok, places: [{ icon: '💣', label: 'x', lat: 1, lng: 2 }] }).success).toBe(false);
    const place = { icon: PLACE_ICONS[0], label: 'x', lat: 1, lng: 2 };
    expect(partnersSchema.safeParse({ ...ok, places: Array(PARTNERS_LIMITS.maxPlaces).fill(place) }).success).toBe(true);
    expect(partnersSchema.safeParse({ ...ok, places: Array(PARTNERS_LIMITS.maxPlaces + 1).fill(place) }).success).toBe(false);
    expect(partnersSchema.safeParse({ ...ok, places: [{ ...place, label: 'x'.repeat(21) }] }).success).toBe(false);
    expect(partnersSchema.safeParse({ ...ok, birth: { month: 1, year: 2999 } }).success).toBe(false);
  });
});

/* ------------------------------------------------------------ integration */

let S: {
  games: typeof import('@/lib/services/games');
  play: typeof import('@/lib/services/play');
  shared: typeof import('@/lib/services/shared');
  demo: typeof import('@/lib/services/demo');
  db: typeof import('@/lib/db');
};
let tmp: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flashback-partners-'));
  process.env.FLASHBACK_DATA_DIR = tmp;
  S = {
    games: await import('@/lib/services/games'),
    play: await import('@/lib/services/play'),
    shared: await import('@/lib/services/shared'),
    demo: await import('@/lib/services/demo'),
    db: await import('@/lib/db'),
  };
});
afterAll(() => {
  S.db.closeDb();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const OWNER = 'p'.padEnd(32, '0');
const STRANGER = 'q'.padEnd(32, '0');
const input = { childName: ' Noa ', parentName: 'Mom', birth: { month: 3, year: 2018 }, places: [{ icon: '🏠', label: 'Home', lat: 31.7784, lng: 35.2066 }] };

describe('Partners games', () => {
  it('stores the profile on a family_shared game and shows it to the owner only', () => {
    const g = S.games.createGame(OWNER, { mode: 'family_shared', partners: input });
    expect(g.mode).toBe('family_shared');
    const mine = S.games.gameMeta(g, OWNER);
    expect(mine.partners).toEqual({ childName: 'Noa', parentName: 'Mom', birth: { month: 3, year: 2018 }, places: input.places });
    expect(S.games.gameMeta(g, STRANGER).partners).toBeNull();
    expect(S.games.gameMeta(g, null).partners).toBeNull();
    expect(S.games.gameMeta(S.games.createGame(OWNER, { mode: 'family_shared' }), OWNER).partners).toBeNull();
  });

  it('is only available for Family & Friends', () => {
    for (const mode of ['couple', 'party'] as const) {
      expect(() => S.games.createGame(OWNER, { mode, partners: input })).toThrow(/Family & Friends/);
    }
  });

  it('rejects an invalid profile', () => {
    expect(() => S.games.createGame(OWNER, { mode: 'family_shared', partners: { ...input, childName: '' } })).toThrow(/Invalid partners/);
  });

  it('treats damaged stored JSON as no profile', () => {
    const g = S.games.createGame(OWNER, { mode: 'family_shared', partners: input });
    S.db.db().prepare('UPDATE games SET partners = ? WHERE id = ?').run('{not json', g.id);
    expect(S.games.partnersOf(S.shared.getGame(g.id))).toBeNull();
    S.db.db().prepare('UPDATE games SET partners = ? WHERE id = ?').run('{"childName":""}', g.id);
    expect(S.games.partnersOf(S.shared.getGame(g.id))).toBeNull();
    expect(S.games.gameMeta(S.shared.getGame(g.id), OWNER).partners).toBeNull();
  });

  it('shows the profile on the answer screen of the owner only (puzzleInfo)', async () => {
    const sid = 'r'.padEnd(32, '0');
    const g = S.games.createGame(sid, { mode: 'family_shared', partners: input });
    const sharp = (await import('sharp')).default;
    const buffer = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 90, g: 120, b: 40 } } }).jpeg().toBuffer();
    const p = await S.games.addPhoto(S.shared.getGame(g.id), sid, { buffer, source: 'upload' });
    expect(S.games.puzzleInfo(p.id, sid).partners?.childName).toBe('Noa');
    expect(() => S.games.puzzleInfo(p.id, STRANGER)).toThrow(); // strangers get a 404
  });
});

describe('Partners demo', () => {
  it('is refused for couple games', async () => {
    await expect(S.demo.createDemoGame(OWNER, 'couple', 'en', { partners: true })).rejects.toMatchObject({ status: 400 });
  });

  it('has the four fictional places in order and plays like any other game: a tap on the beach scores 50/50', async () => {
    const g = await S.demo.createDemoGame(OWNER, 'family_shared', 'en', { partners: true });
    const prof = S.games.partnersOf(g)!;
    expect(prof.places.map((p) => p.icon)).toEqual(['🏠', '👵', '🏖️', '⛺']);
    expect(prof.childName).toBe('Noa');
    expect(S.shared.puzzleCount(g.id)).toBe(3);

    S.play.beginPlay(g.id, OWNER);
    const beach = prof.places[2];
    const scene = DEMO_SCENES[0];
    expect(beach).toMatchObject({ lat: scene.lat, lng: scene.lng });
    await S.play.submitGuess(g.id, OWNER, { lat: beach.lat, lng: beach.lng, month: 7, year: 2022 });

    const result = S.play.sharedResult(g.id, OWNER);
    expect(result.guess).toMatchObject({ distanceKm: 0, monthDiff: 1 });
    expect(result.guess!.score.location).toBe(50);
    expect(result.guess!.score.date).toBe(24);
    expect(nearestPlace(prof.places, result.truth)?.icon).toBe('🏖️');
    expect(ageAt(prof.birth!, result.truth)).toBe(4);
  });

  it('does not put Paris (round 2, the parent on the map) near any family place', async () => {
    const g = await S.demo.createDemoGame(OWNER, 'family_shared', 'en', { partners: true });
    const prof = S.games.partnersOf(g)!;
    const paris = DEMO_SCENES[2];
    expect(nearestPlace(prof.places, paris)).toBeNull();
    const desert = DEMO_SCENES[3];
    expect(nearestPlace(prof.places, desert)?.icon).toBe('⛺');
  });
});
