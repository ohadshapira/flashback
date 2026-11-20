import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { ownerCookieHeader, ownerLockEnabled, passcodeMatches } from '@/lib/owner';
import { rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';

/** Exchange the owner passcode for the owner cookie. Slow-guess protected: 8 tries per 10 minutes per client. */
export const POST = route(async (ctx) => {
  if (!ownerLockEnabled()) return { ok: true, locked: false };
  rateLimit(`unlock:${ctx.ip}`, 8, 10 * 60_000);
  const { code } = await ctx.body(z.object({ code: z.string().min(1).max(200) }));
  if (!passcodeMatches(code)) throw new ApiError(401, 'wrong_passcode', 'Wrong passcode');
  return Response.json({ ok: true }, { headers: { 'Set-Cookie': ownerCookieHeader(), 'Cache-Control': 'no-store' } });
});
