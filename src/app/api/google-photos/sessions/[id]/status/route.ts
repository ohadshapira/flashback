import { route } from '@/lib/http';
import { sessionStatus } from '@/lib/google/sessions';

export const runtime = 'nodejs';

export const GET = route(async (ctx) => sessionStatus(ctx.sid, ctx.params.id));
