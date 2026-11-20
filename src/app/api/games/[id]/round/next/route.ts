import { route } from '@/lib/http';
import { sharedNext } from '@/lib/services/play';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => sharedNext(ctx.params.id, ctx.sid));
