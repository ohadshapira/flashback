import { route } from '@/lib/http';
import { sharedView } from '@/lib/services/play';

export const runtime = 'nodejs';

/** Safe current-stage data for the player. Never contains truth, original URLs or story. */
export const GET = route(async (ctx) => sharedView(ctx.params.id, ctx.sid));
