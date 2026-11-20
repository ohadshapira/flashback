import { route } from '@/lib/http';
import { guessSchema } from '@/lib/schemas';
import { rateLimit } from '@/lib/ratelimit';
import { submitGuess } from '@/lib/services/play';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => {
  rateLimit(`guess:${ctx.sid}`, 60, 60_000);
  const input = await ctx.body(guessSchema);
  return submitGuess(ctx.params.id, ctx.sid, input);
});
