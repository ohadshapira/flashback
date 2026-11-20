import { route } from '@/lib/http';
import { guessSchema } from '@/lib/schemas';
import { rateLimit } from '@/lib/ratelimit';
import { getGameByCode } from '@/lib/services/shared';
import { submitGuess } from '@/lib/services/play';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => {
  rateLimit(`guess:${ctx.sid}`, 60, 60_000);
  const game = getGameByCode(ctx.params.code);
  const input = await ctx.body(guessSchema);
  return submitGuess(game.id, ctx.sid, input);
});
