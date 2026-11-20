import { route } from '@/lib/http';
import { revealMore } from '@/lib/services/play';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => revealMore(ctx.params.id, ctx.sid));
