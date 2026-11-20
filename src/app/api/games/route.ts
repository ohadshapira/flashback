import { route } from '@/lib/http';
import { requireOwner } from '@/lib/owner';
import { createGameSchema } from '@/lib/schemas';
import { createGame, gameMeta } from '@/lib/services/games';
import { db } from '@/lib/db';
import type { GameRow } from '@/lib/services/shared';
import { rateLimit } from '@/lib/ratelimit';
import { maybeCleanup } from '@/lib/services/cleanup';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => {
  requireOwner(ctx.req);
  rateLimit(`create:${ctx.sid}`, 20, 60_000);
  const input = await ctx.body(createGameSchema);
  maybeCleanup();
  const game = createGame(ctx.sid, input);
  return Response.json(gameMeta(game, ctx.sid), { status: 201, headers: { 'Cache-Control': 'no-store' } });
});

/** The games created on this device (for the delete-your-data page). Metadata only, never answers. */
export const GET = route(async (ctx) => {
  const rows = db().prepare("SELECT * FROM games WHERE owner_sid = ? AND status != 'deleted' ORDER BY created_at DESC").all(ctx.sid) as GameRow[];
  return { games: rows.map((g) => gameMeta(g, ctx.sid)) };
});
