import { route } from '@/lib/http';
import { getGame } from '@/lib/services/shared';
import { gameMeta, startGame } from '@/lib/services/games';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => {
  const game = startGame(getGame(ctx.params.id), ctx.sid);
  return gameMeta(game, ctx.sid);
});
