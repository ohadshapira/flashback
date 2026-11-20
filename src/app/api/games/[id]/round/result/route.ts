import { route } from '@/lib/http';
import { sharedResult } from '@/lib/services/play';

export const runtime = 'nodejs';

/** 403 not_revealed until the round has been guessed. */
export const GET = route(async (ctx) => sharedResult(ctx.params.id, ctx.sid));
