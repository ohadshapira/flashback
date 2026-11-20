import { route } from '@/lib/http';
import { nextRoom, roomState } from '@/lib/services/rooms';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => {
  nextRoom(ctx.params.code, ctx.sid);
  return roomState(ctx.params.code, ctx.sid);
});
