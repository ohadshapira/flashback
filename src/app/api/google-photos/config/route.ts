import { route } from '@/lib/http';
import { googleConfig, isGoogleConfigured } from '@/lib/google/config';
import { hasValidToken, discardToken } from '@/lib/google/oauth';

export const runtime = 'nodejs';

export const GET = route(async (ctx) => ({
  configured: isGoogleConfigured(),
  mock: googleConfig().mock,
  connected: isGoogleConfigured() && hasValidToken(ctx.sid),
}));

/** Disconnect: forget the stored (encrypted) token for this browser. */
export const DELETE = route(async (ctx) => {
  discardToken(ctx.sid);
  return { disconnected: true };
});
