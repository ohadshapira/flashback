import { route } from '@/lib/http';
import { cancelSession } from '@/lib/google/sessions';

export const runtime = 'nodejs';

export const DELETE = route(async (ctx) => {
  await cancelSession(ctx.sid, ctx.params.id);
  return { cancelled: true };
});
