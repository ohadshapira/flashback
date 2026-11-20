import { route } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { isMediaKind, loadMedia } from '@/lib/services/authz';
import { loadScratchTile } from '@/lib/services/scratch';

export const runtime = 'nodejs';

const headers = {
  'Content-Type': 'image/jpeg',
  'Cache-Control': 'private, max-age=60',
  'Content-Disposition': 'inline',
  'X-Robots-Tag': 'noindex',
};

/** Stage-gated, authorized media proxy. Private photos are never served from public/. */
export const GET = route(async (ctx) => {
  const { puzzleId, kind } = ctx.params;
  // Scratch games: one tile per request, served only once the player scratched it (see services/scratch.ts).
  const tile = /^scratch-(\d{1,4})$/.exec(kind);
  if (tile) return new Response(new Uint8Array(await loadScratchTile(ctx.sid, puzzleId, Number(tile[1]))), { headers });
  if (!isMediaKind(kind)) throw new ApiError(404, 'not_found');
  const buf = loadMedia(ctx.sid, puzzleId, kind);
  return new Response(new Uint8Array(buf), { headers });
});
