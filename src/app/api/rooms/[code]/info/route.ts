import { route } from '@/lib/http';
import { rateLimit } from '@/lib/ratelimit';
import { roomInfo } from '@/lib/services/rooms';

export const runtime = 'nodejs';

export const GET = route(async (ctx) => {
  rateLimit(`room-info:${ctx.ip}`, 60, 60_000);
  return roomInfo(ctx.params.code);
});
