import { route } from '@/lib/http';
import { reorderSchema } from '@/lib/schemas';
import { getGame } from '@/lib/services/shared';
import { hostSetupView, reorderPuzzles } from '@/lib/services/games';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => {
  const game = getGame(ctx.params.id);
  const { ids } = await ctx.body(reorderSchema);
  reorderPuzzles(game, ctx.sid, ids);
  return hostSetupView(getGame(game.id), ctx.sid);
});
