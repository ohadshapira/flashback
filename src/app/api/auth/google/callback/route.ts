import { route } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { handleCallback } from '@/lib/google/oauth';

export const runtime = 'nodejs';

export const GET = route(async (ctx) => {
  const q = ctx.url.searchParams;
  const dest = (gameId: string | null, flag: string) =>
    new Response(null, { status: 302, headers: { Location: gameId ? `/new/photos?game=${encodeURIComponent(gameId)}&google=${flag}` : `/?google=${flag}`, 'Cache-Control': 'no-store' } });

  if (q.get('error')) return dest(null, 'denied');
  const code = q.get('code');
  const state = q.get('state');
  if (!code || !state) return dest(null, 'error');
  try {
    const { gameId } = await handleCallback(ctx.sid, code, state);
    return dest(gameId, 'connected');
  } catch (e) {
    const flag = e instanceof ApiError && e.code === 'google_scope_denied' ? 'denied' : 'error';
    return dest(null, flag);
  }
});
