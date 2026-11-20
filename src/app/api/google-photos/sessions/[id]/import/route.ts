import { route } from '@/lib/http';
import { startImport } from '@/lib/google/sessions';

export const runtime = 'nodejs';

export const POST = route(async (ctx) => Response.json(await startImport(ctx.sid, ctx.params.id), { status: 202, headers: { 'Cache-Control': 'no-store' } }));
