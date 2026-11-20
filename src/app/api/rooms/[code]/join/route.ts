import { route } from '@/lib/http';
import { joinSchema } from '@/lib/schemas';
import { rateLimit } from '@/lib/ratelimit';
import { joinRoom } from '@/lib/services/rooms';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => {
  // Rate-limited per IP so room codes cannot be brute-forced.
  rateLimit(`join:${ctx.ip}`, 20, 60_000);
  const { name } = await ctx.body(joinSchema);
  return joinRoom(ctx.params.code, ctx.sid, name);
});
