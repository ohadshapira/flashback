'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

export type WheelItem<V extends string | number> = { value: V; label: string; disabled?: boolean };

type Props<V extends string | number> = {
  items: WheelItem<V>[];
  value: V;
  onChange: (v: V) => void;
  /** Accessible name, e.g. "Month". */
  label: string;
  /** Visible rows: 3 (compact) or 5. */
  rows?: 3 | 5;
  testId?: string;
  disabled?: boolean;
};

export const ITEM_HEIGHT = 40;

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * iOS-style vertical wheel built on CSS scroll-snap. Supports touch swipes, mouse wheel, mouse
 * drag, click-to-select and keyboard (↑ ↓ PageUp PageDown Home End). It scrolls only itself
 * (overscroll-behavior: contain) so it never moves the map or the page. Disabled items are
 * visible but un-selectable; landing on one snaps to the nearest enabled item.
 */
export function WheelPicker<V extends string | number>({ items, value, onChange, label, rows = 5, testId, disabled }: Props<V>) {
  const id = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** scrollTop we are animating towards (null when the user is in control). */
  const programmatic = useRef<number | null>(null);
  const progTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [snapSupported, setSnapSupported] = useState(true);

  const selected = Math.max(0, items.findIndex((i) => i.value === value));
  const [live, setLiveState] = useState(selected);
  // Synchronous mirrors so rapid key presses never act on a stale render's value.
  const liveRef = useRef(selected);
  const valueRef = useRef(value);
  valueRef.current = value;
  const setLive = useCallback((i: number) => {
    liveRef.current = i;
    setLiveState(i);
  }, []);
  const pad = ((rows - 1) / 2) * ITEM_HEIGHT;

  useEffect(() => {
    setSnapSupported(typeof CSS === 'undefined' || !CSS.supports || CSS.supports('scroll-snap-type', 'y mandatory'));
  }, []);

  const scrollToIndex = useCallback((idx: number, smooth: boolean) => {
    const el = scroller.current;
    if (!el) return;
    programmatic.current = idx * ITEM_HEIGHT;
    // A settle scheduled by an earlier user scroll must not fire against this new animation's half-way position.
    if (settleTimer.current) clearTimeout(settleTimer.current);
    el.scrollTo({ top: idx * ITEM_HEIGHT, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
    // Safety net: control returns to the user when the animation reaches its target (see onScroll) or after this timeout.
    if (progTimer.current) clearTimeout(progTimer.current);
    progTimer.current = setTimeout(() => (programmatic.current = null), smooth ? 1500 : 80);
  }, []);

  const nearestEnabled = useCallback(
    (idx: number): number => {
      const clamped = Math.min(items.length - 1, Math.max(0, idx));
      if (!items[clamped]?.disabled) return clamped;
      for (let d = 1; d < items.length; d++) {
        if (items[clamped - d] && !items[clamped - d].disabled) return clamped - d;
        if (items[clamped + d] && !items[clamped + d].disabled) return clamped + d;
      }
      return clamped;
    },
    [items],
  );

  // Keep the scroll position in sync with the controlled value (first paint, external changes, list changes).
  useLayoutEffect(() => {
    setLive(selected);
    const el = scroller.current;
    if (!el || dragging) return;
    if (Math.abs(el.scrollTop - selected * ITEM_HEIGHT) > 1) scrollToIndex(selected, el.scrollTop !== 0);
  }, [selected, items.length, dragging, scrollToIndex, setLive]);

  const commit = useCallback(
    (idx: number, smooth = true) => {
      const target = nearestEnabled(idx);
      setLive(target);
      scrollToIndex(target, smooth);
      if (items[target] && items[target].value !== valueRef.current) {
        valueRef.current = items[target].value;
        onChange(items[target].value);
      }
    },
    [items, nearestEnabled, onChange, scrollToIndex, setLive],
  );

  const settle = useCallback(() => {
    const el = scroller.current;
    if (!el || programmatic.current !== null) return; // our own animation is still running
    commit(Math.round(el.scrollTop / ITEM_HEIGHT));
  }, [commit]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    // Our own animated scrolls must not overwrite the logical selection with intermediate positions.
    if (programmatic.current !== null) {
      if (Math.abs(el.scrollTop - programmatic.current) < 1.5) programmatic.current = null;
      return;
    }
    setLive(Math.min(items.length - 1, Math.max(0, Math.round(el.scrollTop / ITEM_HEIGHT))));
    if (drag.current) return;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(settle, 120);
  };

  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const step = e.key === 'PageUp' || e.key === 'PageDown' ? 3 : 1;
    let next: number | null = null;
    const cur = liveRef.current;
    if (e.key === 'ArrowUp' || e.key === 'PageUp') next = cur - step;
    else if (e.key === 'ArrowDown' || e.key === 'PageDown') next = cur + step;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next === null) return;
    e.preventDefault();
    e.stopPropagation();
    const dir = next < cur ? -1 : 1;
    let idx = Math.min(items.length - 1, Math.max(0, next));
    while (items[idx]?.disabled && idx + dir >= 0 && idx + dir < items.length) idx += dir;
    if (items[idx]?.disabled) idx = nearestEnabled(idx);
    commit(idx);
  };

  // Mouse drag-to-scroll (touch uses native scrolling).
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || disabled) return;
    programmatic.current = null;
    drag.current = { y: e.clientY, top: scroller.current!.scrollTop, moved: false };
    scroller.current!.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 4) d.moved = true;
    scroller.current!.scrollTop = d.top - dy;
  };
  const endDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const el = scroller.current;
    el?.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    // keep `moved` visible to the click that follows pointerup, then clear
    setTimeout(() => (drag.current = null), 0);
    if (!d.moved && el && e.type === 'pointerup') {
      // Pointer capture retargets the click to the scroller, so select the tapped row from its position.
      const idx = Math.floor((e.clientY - el.getBoundingClientRect().top + el.scrollTop - pad) / ITEM_HEIGHT);
      if (idx >= 0 && idx < items.length && !items[idx].disabled) return commit(idx);
    }
    settle();
  };

  if (!snapSupported) {
    // Accessible fallback when custom wheel scrolling is unavailable: a native select.
    return (
      <select
        aria-label={label}
        data-testid={testId}
        className="field text-center"
        value={String(value)}
        disabled={disabled}
        onChange={(e) => {
          const hit = items.find((i) => String(i.value) === e.target.value);
          if (hit && !hit.disabled) onChange(hit.value);
        }}
      >
        {items.map((i) => (
          <option key={String(i.value)} value={String(i.value)} disabled={i.disabled}>
            {i.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="relative select-none" style={{ height: rows * ITEM_HEIGHT }} dir="ltr" data-testid={testId ? `${testId}-wheel` : undefined}>
      <div
        ref={scroller}
        role="listbox"
        aria-label={label}
        aria-activedescendant={`${id}-${live}`}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        data-testid={testId}
        data-value={String(value)}
        className={`wheel-scroll relative z-10 h-full overflow-y-scroll rounded-2xl outline-offset-2 ${dragging ? 'is-dragging' : ''} ${disabled ? 'opacity-50' : ''}`}
        onScroll={onScroll}
        // the user takes over from any running animation
        onTouchStart={() => (programmatic.current = null)}
        onWheel={() => (programmatic.current = null)}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div style={{ height: pad }} aria-hidden />
        {items.map((it, i) => {
          const dist = Math.abs(i - live);
          return (
            <div
              key={String(it.value)}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selected}
              aria-disabled={it.disabled || undefined}
              data-value={String(it.value)}
              data-selected={i === selected ? 'true' : undefined}
              className="wheel-item flex items-center justify-center text-center tabular-nums transition-[opacity,transform] duration-100"
              style={{
                height: ITEM_HEIGHT,
                opacity: it.disabled ? 0.25 : Math.max(0.25, 1 - dist * 0.3),
                transform: `scale(${i === live ? 1.08 : 1 - Math.min(dist, 3) * 0.04})`,
                fontWeight: i === live ? 700 : 500,
                fontSize: i === live ? 20 : 17,
                color: i === live ? '#a8324a' : undefined,
                cursor: it.disabled ? 'not-allowed' : 'pointer',
              }}
              onClick={() => {
                if (drag.current?.moved || it.disabled || disabled) return;
                commit(i);
              }}
            >
              <span dir="auto" className="whitespace-nowrap">{it.label}</span>
            </div>
          );
        })}
        <div style={{ height: pad }} aria-hidden />
      </div>
      {/* centre highlight band */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 rounded-2xl border border-rose/25 bg-gradient-to-b from-rose-soft/80 to-rose-soft/40 shadow-[0_6px_16px_-8px_rgba(210,75,98,0.55),inset_0_1px_0_rgba(255,255,255,0.8)]"
        style={{ top: pad, height: ITEM_HEIGHT, zIndex: 0 }}
      />
      {/* (the edge fade is a CSS mask on the scroller) */}
    </div>
  );
}
