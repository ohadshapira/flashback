import { route } from '@/lib/http';
import { getGame } from '@/lib/services/shared';
import { hostSetupView } from '@/lib/services/games';

export const runtime = 'nodejs';

/** Host-only. Contains answers, so it is refused once the game is handed over (see hostSetupView). */
export const GET = route(async (ctx) => hostSetupView(getGame(ctx.params.id), ctx.sid));
