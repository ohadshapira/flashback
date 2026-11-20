import { z } from 'zod';
import { route } from '@/lib/http';
import { requireOwner } from '@/lib/owner';
import { rateLimit } from '@/lib/ratelimit';
import { activeSessionForGame, createPickerSession } from '@/lib/google/sessions';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => {
  requireOwner(ctx.req);
  rateLimit(`gsession:${ctx.sid}`, 10, 60_000);
  const { gameId } = await ctx.body(z.object({ gameId: z.string().min(1) }));
  return createPickerSession(ctx.sid, gameId);
});

/** Resume after a reload or when returning from the Google Photos tab. */
export const GET = route(async (ctx) => ({ session: activeSessionForGame(ctx.sid, ctx.url.searchParams.get('gameId') ?? '') }));
