import sharp from 'sharp';
import { ApiError } from '../errors';
import { demoModeEnabled } from '../config';
import { DEMO_SCENES } from '../demo-scenes';
import { addPhoto, createGame, startGame } from './games';
import { seedSoloParty } from './demo-bots';
import { getGame, type Mode } from './shared';

/** Three very different places keep the sample game short (3 rounds) and the scores varied: beach, Paris, Kyoto. */
const DEMO_PICK = [0, 2, 4] as const;

/** Builds a ready-to-play sample game from the bundled illustrations. Clearly demo content, not Google Photos. */
export async function createDemoGame(sid: string, mode: Mode, locale: 'he' | 'en', opts: { solo?: boolean; style?: 'classic' | 'scratch' } = {}) {
  if (!demoModeEnabled()) throw new ApiError(404, 'not_found');
  const game = createGame(sid, { mode, title: locale === 'he' ? 'משחק הדגמה' : 'Demo game', targetCount: DEMO_PICK.length, style: opts.style });
  for (const idx of DEMO_PICK) {
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
