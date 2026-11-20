import { route } from '@/lib/http';
import { replay } from '@/lib/services/play';
import { gameMeta } from '@/lib/services/games';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => gameMeta(replay(ctx.params.id, ctx.sid), ctx.sid));
