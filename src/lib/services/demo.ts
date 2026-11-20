import sharp from 'sharp';
import { ApiError } from '../errors';
import { demoModeEnabled } from '../config';
import { DEMO_SCENES } from '../demo-scenes';
import { addPhoto, createGame, startGame } from './games';
import { seedSoloParty } from './demo-bots';
import { getGame, type Mode } from './shared';
import type { PartnersProfile } from '../partners';

/** Three very different places keep the sample game short (3 rounds) and the scores varied: beach, Paris, Kyoto. */
const DEMO_PICK = [0, 2, 4] as const;

/** Partners demo: beach, Paris, desert. Rounds 1 and 3 (child on the map) happen at family places; round 2 (Paris) does not. */
const PARTNERS_PICK = [0, 2, 3] as const;

/** A fictional family. The beach and desert places sit exactly on those scenes' answers, so a correct tap scores full location. */
function demoPartners(locale: 'he' | 'en'): PartnersProfile {
  const he = locale === 'he';
  const beach = DEMO_SCENES[0];
  const desert = DEMO_SCENES[3];
  return {
    childName: he ? 'נועה' : 'Noa',
    parentName: he ? 'אמא' : 'Mom',
    birth: { month: 3, year: 2018 },
    places: [
      { icon: '🏠', label: he ? 'בית' : 'Home', lat: 31.7784, lng: 35.2066 },
      { icon: '👵', label: he ? 'סבתא' : 'Grandma', lat: 32.794, lng: 34.9896 },
      { icon: '🏖️', label: he ? 'הים' : 'The beach', lat: beach.lat, lng: beach.lng },
      { icon: '⛺', label: he ? 'הטיול במדבר' : 'Desert trip', lat: desert.lat, lng: desert.lng },
    ],
  };
}

/** Builds a ready-to-play sample game from the bundled illustrations. Clearly demo content, not Google Photos. */
export async function createDemoGame(sid: string, mode: Mode, locale: 'he' | 'en', opts: { solo?: boolean; style?: 'classic' | 'scratch'; partners?: boolean } = {}) {
  if (!demoModeEnabled()) throw new ApiError(404, 'not_found');
  if (opts.partners && mode !== 'family_shared') throw new ApiError(400, 'invalid_input', 'Partners is a Family & Friends game');
  const pick = opts.partners ? PARTNERS_PICK : DEMO_PICK;
  const game = createGame(sid, { mode, title: locale === 'he' ? 'משחק הדגמה' : 'Demo game', targetCount: pick.length, style: opts.style, partners: opts.partners ? demoPartners(locale) : undefined });
  for (const idx of pick) {
    const s = DEMO_SCENES[idx];
    const png = await sharp(Buffer.from(s.svg)).png().toBuffer();
    await addPhoto(getGame(game.id), sid, {
      buffer: png,
      source: 'demo',
      preset: { lat: s.lat, lng: s.lng, month: s.month, year: s.year, title: s.title[locale], story: s.story[locale], cropCenterX: s.cropCenterX, cropCenterY: s.cropCenterY },
    });
  }
  const started = startGame(getGame(game.id), sid);
  // Solo party demo: you play, with simulated rivals, and still control the room.
  if (mode === 'party' && opts.solo) seedSoloParty(started.id, sid, locale);
  return getGame(started.id);
}
