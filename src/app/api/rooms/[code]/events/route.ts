import { route } from '@/lib/http';
import { ApiError } from '@/lib/errors';
import { subscribe } from '@/lib/bus';
import { effectiveStage, getGame, getGameByCode } from '@/lib/services/shared';
import { canListen, markHostSeen, tickParty } from '@/lib/services/rooms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Server-Sent Events: "something changed, refetch /state". The 1s loop also drives time-based
 * transitions (deadline → reveal) and emits a hint when the zoom stage advances.
 */
export const GET = route(async (ctx) => {
  const game = getGameByCode(ctx.params.code);
  if (!canListen(game.id, ctx.sid)) throw new ApiError(403, 'not_joined', 'Join the room first');
  const enc = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(enc.encode(s));
        } catch {
          /* closed */
        }
      };
      send('retry: 3000\n\nevent: ready\ndata: {}\n\n');
      const unsub = subscribe(game.id, () => send('event: changed\ndata: {}\n\n'));
      let lastStage = effectiveStage(getGame(game.id));
      let n = 0;
      const timer = setInterval(() => {
        try {
          tickParty(game.id);
          const g = getGame(game.id);
          markHostSeen(g, ctx.sid);
          const stage = g.status === 'playing' && g.round_state === 'accepting_guesses' ? effectiveStage(g) : lastStage;
          if (stage !== lastStage) {
            lastStage = stage;
            send('event: changed\ndata: {}\n\n');
          }
        } catch {
          /* game deleted */
          send('event: changed\ndata: {}\n\n');
        }
        if (++n % 15 === 0) send(': ping\n\n');
      }, 1000);
      cleanup = () => {
        clearInterval(timer);
        unsub();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      ctx.req.signal.addEventListener('abort', cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
  });
});
