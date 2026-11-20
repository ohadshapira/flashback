'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import type { RoomState } from './types';

/** Loads once and exposes reload/error. Cancels stale responses. */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const load = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const r = await loader();
      if (my === seq.current) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(e);
    } finally {
      if (my === seq.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** Per-key draft persisted in sessionStorage (survives back-navigation and reloads of the same tab). */
export function usePersistedState<T>(key: string, initial: T): [T, (v: T) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw) {
        setValue(JSON.parse(raw) as T);
        setRestored(true);
      }
    } catch {
      /* private mode */
    }
  }, [key]);
  const set = useCallback(
    (v: T) => {
      setValue(v);
      try {
        window.sessionStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* ignore */
      }
    },
    [key],
  );
  return [value, set, restored];
}

/**
 * Realtime room state. Server-Sent Events are only *hints*; every hint triggers a refetch of the
 * authoritative /state. Falls back to polling if the stream is unavailable, and keeps a server-clock offset
 * so countdowns agree across devices.
 */
export function useRoom(code: string) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [connected, setConnected] = useState(true);
  const offset = useRef(0);
  const inflight = useRef(false);
  const again = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) {
      again.current = true;
      return;
    }
    inflight.current = true;
    try {
      const s = await api<RoomState>(`/api/rooms/${code}/state`);
      offset.current = s.serverNow - Date.now();
      setState(s);
      setError(null);
      setConnected(true);
    } catch (e) {
      setError(e);
      if (e instanceof Error && 'status' in e && (e as { status: number }).status === 0) setConnected(false);
    } finally {
      inflight.current = false;
      if (again.current) {
        again.current = false;
        void refresh();
      }
    }
  }, [code]);

  useEffect(() => {
    void refresh();
    let es: EventSource | null = null;
    try {
      es = new EventSource(`/api/rooms/${code}/events`);
      es.addEventListener('changed', () => void refresh());
      es.addEventListener('ready', () => void refresh());
      es.onerror = () => setConnected(false);
    } catch {
      /* polling covers it */
    }
    const poll = setInterval(() => void refresh(), 4000); // safety net behind SSE
    return () => {
      es?.close();
      clearInterval(poll);
    };
  }, [code, refresh]);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  return { state, error, connected, refresh, serverNow };
}

/** Seconds remaining until a server-clock deadline, ticking every 250ms. */
export function useCountdown(deadline: number | null | undefined, serverNow: () => number): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!deadline) return void setLeft(0);
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - serverNow()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline, serverNow]);
  return left;
}
