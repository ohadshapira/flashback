import { z } from 'zod';
import { route, parseCookies } from '@/lib/http';
import { requireOwner } from '@/lib/owner';
import { rateLimit } from '@/lib/ratelimit';
import { resolveLocale } from '@/i18n';
import { createDemoGame } from '@/lib/services/demo';
import { gameMeta } from '@/lib/services/games';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = route(async (ctx) => {
  requireOwner(ctx.req);
  rateLimit(`demo:${ctx.sid}`, 6, 60_000);
  const { mode, solo, style, partners } = await ctx.body(z.object({ mode: z.enum(['couple', 'family_shared', 'party']), solo: z.boolean().optional(), style: z.enum(['classic', 'scratch']).optional(), partners: z.boolean().optional() }));
  const locale = resolveLocale(parseCookies(ctx.req.headers.get('cookie')).fb_locale);
  const game = await createDemoGame(ctx.sid, mode, locale, { solo, style, partners });
  return Response.json(gameMeta(game, ctx.sid), { status: 201, headers: { 'Cache-Control': 'no-store' } });
});
