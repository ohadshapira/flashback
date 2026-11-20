import { route } from '@/lib/http';
import { getGame } from '@/lib/services/shared';
import { deleteGame, gameMeta, updateGameTitle } from '@/lib/services/games';
import { patchGameSchema } from '@/lib/schemas';
import { cancelAllForGame } from '@/lib/google/sessions';

export const runtime = 'nodejs';

export const GET = route(async (ctx) => gameMeta(getGame(ctx.params.id), ctx.sid));

export const PATCH = route(async (ctx) => {
  const game = getGame(ctx.params.id);
  const { title } = await ctx.body(patchGameSchema);
  updateGameTitle(game, ctx.sid, title);
  return gameMeta(getGame(game.id), ctx.sid);
});

export const DELETE = route(async (ctx) => {
  const game = getGame(ctx.params.id);
  if (game.owner_sid === ctx.sid) await cancelAllForGame(game.id, ctx.sid).catch(() => undefined);
  deleteGame(game, ctx.sid);
  return { deleted: true };
});
