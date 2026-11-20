import { route } from '@/lib/http';
import { scratchSchema } from '@/lib/schemas';
import { rateLimit } from '@/lib/ratelimit';
import { getGameByCode } from '@/lib/services/shared';
import { revealCells, tileDataUrls } from '@/lib/services/scratch';

export const runtime = 'nodejs';

/** Cheap no-op so the client can wake this endpoint up (and open its connection) before the first real scratch. */
export const GET = route(async () => ({ ok: true }));

/** A scratch-game player releases the tiles they scratched. The server records them (they decide the score) and only then serves them. */
export const POST = route(async (ctx) => {
  rateLimit(`scratch:${ctx.sid}`, 1500, 60_000);
  const game = getGameByCode(ctx.params.code);
  const { cells } = await ctx.body(scratchSchema);
  const r = revealCells(game.id, ctx.sid, cells);
  // answer with the pixels of what was just released: one round trip, so the photo shows up as soon as it is scratched
  const tiles = await tileDataUrls(r.gameId, r.puzzleId, cells);
  return { cells: r.cells, pct: r.pct, tiles };
});
