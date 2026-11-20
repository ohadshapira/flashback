import { route } from '@/lib/http';
import { sharedSummary } from '@/lib/services/play';

export const runtime = 'nodejs';

export const GET = route(async (ctx) => sharedSummary(ctx.params.id, ctx.sid));
