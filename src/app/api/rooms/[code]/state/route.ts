import { route } from '@/lib/http';
import { roomState } from '@/lib/services/rooms';

export const runtime = 'nodejs';

export const GET = route(async (ctx) => roomState(ctx.params.code, ctx.sid));
