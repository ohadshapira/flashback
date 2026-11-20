import { route } from '@/lib/http';
import { requireOwner } from '@/lib/owner';
import { ApiError } from '@/lib/errors';
import { rateLimit } from '@/lib/ratelimit';
import { getGame, assertOwner } from '@/lib/services/shared';
import { isGoogleConfigured } from '@/lib/google/config';
import { buildAuthUrl } from '@/lib/google/oauth';

export const runtime = 'nodejs';

/** Only reachable after the on-screen disclosure: the UI appends consent=1 when the user agrees. */
export const GET = route(async (ctx) => {
  requireOwner(ctx.req);
  rateLimit(`gstart:${ctx.sid}`, 10, 60_000);
  const gameId = ctx.url.searchParams.get('gameId') ?? '';
  const back = (flag: string) => new Response(null, { status: 302, headers: { Location: `/new/photos?game=${encodeURIComponent(gameId)}&google=${flag}` } });
  if (!isGoogleConfigured()) return back('not_configured');
  if (ctx.url.searchParams.get('consent') !== '1') throw new ApiError(400, 'consent_required', 'Consent is required before connecting Google Photos');
  assertOwner(getGame(gameId), ctx.sid);
  return new Response(null, { status: 302, headers: { Location: buildAuthUrl(ctx.sid, gameId), 'Cache-Control': 'no-store' } });
});
