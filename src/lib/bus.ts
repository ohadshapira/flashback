/**
 * In-process change notifications for realtime rooms. Events are only *hints* ("something changed,
 * refetch"); the database stays the source of truth. Single-instance by design — see docs/REFERENCE.md for the
 * multi-instance story (swap this for Redis/Supabase Realtime).
 */
type Listener = () => void;
const g = globalThis as unknown as { __fbBus?: Map<string, Set<Listener>> };
const listeners = (g.__fbBus ??= new Map<string, Set<Listener>>());

export function subscribe(gameId: string, fn: Listener): () => void {
  let set = listeners.get(gameId);
  if (!set) listeners.set(gameId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (set!.size === 0) listeners.delete(gameId);
  };
}

export function publish(gameId: string) {
  listeners.get(gameId)?.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a dead listener must never break a write */
    }
  });
}
