import { route } from '@/lib/http';
import { photoPatchSchema } from '@/lib/schemas';
import { puzzleInfo, removePuzzle, toHostPuzzle, updatePuzzle } from '@/lib/services/games';

export const runtime = 'nodejs';

export const GET = route(async (ctx) => puzzleInfo(ctx.params.id, ctx.sid));

export const PATCH = route(async (ctx) => {
  const patch = await ctx.body(photoPatchSchema);
  return toHostPuzzle(await updatePuzzle(ctx.params.id, ctx.sid, patch));
});

export const DELETE = route(async (ctx) => {
  removePuzzle(ctx.params.id, ctx.sid);
  return { deleted: true };
});
