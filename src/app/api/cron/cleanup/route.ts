import { ApiError } from '@/lib/errors';
import { route } from '@/lib/http';
import { cleanupExpired } from '@/lib/services/cleanup';

export const runtime = 'nodejs';

export const GET = route(async (ctx) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || ctx.req.headers.get('authorization') !== `Bearer ${secret}`) throw new ApiError(404, 'not_found');
  return cleanupExpired();
});
