import { route } from '@/lib/http';
import { startRoom, roomState } from '@/lib/services/rooms';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => {
  startRoom(ctx.params.code, ctx.sid);
  return roomState(ctx.params.code, ctx.sid);
});
