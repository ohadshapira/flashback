import { route } from '@/lib/http';
import { beginPlay, sharedView } from '@/lib/services/play';

export const runtime = 'nodejs';

/** Hand-off confirmed: from here on, even the host's device can no longer read answers. */
export const POST = route(async (ctx) => {
  beginPlay(ctx.params.id, ctx.sid);
  return sharedView(ctx.params.id, ctx.sid);
});
