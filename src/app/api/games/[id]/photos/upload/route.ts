import { route } from '@/lib/http';
import { requireOwner } from '@/lib/owner';
import { ApiError } from '@/lib/errors';
import { LIMITS } from '@/lib/config';
import { rateLimit } from '@/lib/ratelimit';
import { getGame } from '@/lib/services/shared';
import { addPhoto, toHostPuzzle } from '@/lib/services/games';

export const runtime = 'nodejs';
export const maxDuration = 60;

export const POST = route(async (ctx) => {
  requireOwner(ctx.req);
  rateLimit(`upload:${ctx.sid}`, 40, 60_000);
  const game = getGame(ctx.params.id);
  if (game.owner_sid !== ctx.sid) throw new ApiError(404, 'not_found');
  let form: FormData;
  try {
    form = await ctx.req.formData();
  } catch {
    throw new ApiError(400, 'invalid_body', 'Expected multipart form data');
  }
  const files = form.getAll('files').filter((f): f is File => typeof f !== 'string');
  if (!files.length) throw new ApiError(400, 'invalid_input', 'No files');
  if (files.length > LIMITS.maxPhotos) throw new ApiError(400, 'too_many_photos', 'Too many files');

  const added = [];
  const errors: { name: string; code: string }[] = [];
  for (const f of files) {
    try {
      if (f.size > LIMITS.maxUploadBytes) throw new ApiError(413, 'file_too_large');
      const puzzle = await addPhoto(game, ctx.sid, { buffer: Buffer.from(await f.arrayBuffer()), source: 'upload' });
      added.push(toHostPuzzle(puzzle));
    } catch (e) {
      if (e instanceof ApiError) errors.push({ name: f.name, code: e.code });
      else throw e;
    }
  }
  return Response.json({ added, errors }, { status: added.length ? 201 : 422, headers: { 'Cache-Control': 'no-store' } });
});
