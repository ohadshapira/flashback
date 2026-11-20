'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useI18n } from './I18nProvider';
import { api, ApiClientError } from '@/lib/client/api';

export type ScratchState = {
  puzzleId: string;
  cols: number;
  rows: number;
  aspect: number;
  cells: number[];
  pct: number;
  tiers: { maxPct: number; points: number }[];
};

type ScratchReply = { cells: number[]; pct: number; tiles: Record<string, string> };

/** Errors after which scratching is over for this round (anything else is retried). */
const FATAL = new Set(['round_closed', 'not_joined', 'forbidden', 'host_cannot_play', 'bad_state', 'not_found']);
const MAX_IN_FLIGHT = 3;

/**
 * Scratch-off photo. The pixels under the foil are NOT in the browser: the server sends a tile only after the player
 * scratched it (the answer to the scratch request carries the pixels) and counts those tiles as the revealed share,
 * which sets the score.
 *
 * How it feels: where the photo has already arrived, scratching removes the foil instantly (as with any scratch card).
 * Where it has not arrived yet (a split second), the stroke shows as soft "rub marks" on the foil, which turn into photo
 * the moment the tile is there. So the foil never becomes a blank or white patch, and nothing piles up.
 */
export function ScratchCard({
  code,
  scratch,
  locked,
  top,
  bottom,
}: {
  code: string;
  scratch: ScratchState;
  locked: boolean;
  top?: React.ReactNode;
  bottom?: React.ReactNode;
}) {
  const { t } = useI18n();
  const { cols, rows, aspect, puzzleId, tiers } = scratch;
  const total = cols * rows;

  const area = useRef<HTMLDivElement>(null);
  const foil = useRef<HTMLCanvasElement>(null); // the silver foil
  const marks = useRef<HTMLCanvasElement>(null); // soft rub marks where photo is still on its way (also the stroke mask)
  const applied = useRef<Set<number>>(new Set()); // arrived tiles whose pending rub marks have been turned into a hole
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [revealed, setRevealed] = useState<Set<number>>(() => new Set(scratch.cells)); // released by the server
  const [tiles, setTiles] = useState<Record<number, string>>({});
  const revealedRef = useRef(revealed);
  revealedRef.current = revealed;
  const touched = useRef<Set<number>>(new Set(scratch.cells)); // everything scratched so far, even if the server has not answered yet
  const [, setTick] = useState(0);
  const tickScheduled = useRef(false);
  const pending = useRef<Set<number>>(new Set());
  const flushing = useRef<number | ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(0);
  const blockUntil = useRef(0);
  const [failed, setFailed] = useState(false);
  const drawing = useRef<{ x: number; y: number } | null>(null);

  // wake the endpoint up (the first request after a start is slow) so the first real scratch is quick
  useEffect(() => {
    void fetch(`/api/rooms/${code}/scratch`, { cache: 'no-store' }).catch(() => undefined);
  }, [code]);

  // whatever the server already knows (e.g. after a reload) counts as revealed
  useEffect(() => {
    scratch.cells.forEach((c) => touched.current.add(c));
    setRevealed((prev) => {
      const next = new Set(prev);
      scratch.cells.forEach((c) => next.add(c));
      return next.size === prev.size ? prev : next;
    });
  }, [scratch.cells]);

  // fit the photo box (its true aspect ratio) inside the free area
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    const fit = () => {
      const mw = el.clientWidth - 24;
      const mh = el.clientHeight - 24;
      if (mw <= 0 || mh <= 0) return;
      const w = Math.min(mw, mh * aspect);
      setSize({ w: Math.floor(w), h: Math.floor(w / aspect) });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [aspect]);

  const cw = size.w / cols;
  const ch = size.h / rows;
  const dprOf = () => (foil.current && size.w ? foil.current.width / size.w : 1);

  const bump = () => {
    if (tickScheduled.current) return;
    tickScheduled.current = true;
    requestAnimationFrame(() => {
      tickScheduled.current = false;
      setTick((n) => n + 1);
    });
  };

  const cellRect = useCallback((cell: number) => ({ x: (cell % cols) * cw - 0.5, y: Math.floor(cell / cols) * ch - 0.5, w: cw + 1, h: ch + 1 }), [cols, cw, ch]);

  /** (Re)paint the foil, then clear the tiles the server already released. */
  const paintFoil = useCallback(() => {
    const c = foil.current;
    const m = marks.current;
    if (!c || !m || !size.w || !size.h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = m.width = Math.floor(size.w * dpr);
    c.height = m.height = Math.floor(size.h * dpr);
    applied.current = new Set();
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    const g = ctx.createLinearGradient(0, 0, size.w, size.h);
    g.addColorStop(0, '#c7cad6');
    g.addColorStop(0.45, '#eef0f6');
    g.addColorStop(0.7, '#cfd2de');
    g.addColorStop(1, '#b3b8c9');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size.w, size.h);
    // foil texture: fine speckle plus diagonal sheen
    for (let i = 0; i < (size.w * size.h) / 140; i++) {
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(80,90,120,0.14)';
      ctx.fillRect(Math.random() * size.w, Math.random() * size.h, 1.4, 1.4);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 6;
    for (let x = -size.h; x < size.w; x += 46) {
      ctx.beginPath();
      ctx.moveTo(x, size.h);
      ctx.lineTo(x + size.h, 0);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(70,80,110,0.55)';
    ctx.font = `600 ${Math.max(16, Math.min(size.w, size.h) * 0.09)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✦', size.w / 2, size.h / 2);
    revealedRef.current.forEach((cell) => {
      const r = cellRect(cell);
      ctx.clearRect(r.x, r.y, r.w, r.h);
      applied.current.add(cell);
    });
  }, [size.w, size.h, cellRect]);

  useEffect(() => {
    paintFoil();
  }, [paintFoil]);

  /** Turn the rub marks of tiles whose photo has just arrived into a hole in the foil (and wipe the marks there). */
  const applyArrived = useCallback(() => {
    const c = foil.current;
    const m = marks.current;
    const ctx = c?.getContext('2d');
    const mctx = m?.getContext('2d');
    if (!c || !m || !ctx || !mctx || !size.w) return;
    const dpr = c.width / size.w;
    revealedRef.current.forEach((cell) => {
      if (applied.current.has(cell)) return;
      applied.current.add(cell);
      const r = cellRect(cell);
      const x = Math.floor(r.x * dpr);
      const y = Math.floor(r.y * dpr);
      const w = Math.ceil(r.w * dpr) + 1;
      const h = Math.ceil(r.h * dpr) + 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.drawImage(m, x, y, w, h, x, y, w, h);
      ctx.restore();
      mctx.save();
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.clearRect(x, y, w, h);
      mctx.restore();
    });
  }, [size.w, cellRect]);

  // after React has put the new tiles on screen, take the foil off them
  useEffect(() => {
    const id = requestAnimationFrame(applyArrived);
    return () => cancelAnimationFrame(id);
  }, [tiles, revealed, applyArrived]);

  const flush = useCallback(() => {
    flushing.current = null;
    if (inFlight.current >= MAX_IN_FLIGHT) return; // the next batch goes out as soon as one of these is back
    const wait = blockUntil.current - Date.now();
    if (wait > 0) {
      flushing.current = setTimeout(flush, wait);
      return;
    }
    const cells = [...pending.current].slice(0, 300);
    if (!cells.length) return;
    cells.forEach((c) => pending.current.delete(c));
    inFlight.current += 1;
    api<ScratchReply>(`/api/rooms/${code}/scratch`, { body: { cells } })
      .then((r) => {
        setTiles((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(r.tiles).map(([k, v]) => [Number(k), v])) }));
        setRevealed((prev) => new Set([...prev, ...r.cells]));
      })
      .catch((e) => {
        if (e instanceof ApiClientError && FATAL.has(e.code)) setFailed(true);
        else {
          cells.forEach((c) => pending.current.add(c)); // transient (network, rate limit): try again shortly
          blockUntil.current = Date.now() + 800;
        }
      })
      .finally(() => {
        inFlight.current -= 1;
        if (pending.current.size && !flushing.current) flush();
      });
  }, [code]);

  const queue = useCallback(
    (cells: number[]) => {
      let any = false;
      for (const c of cells) {
        touched.current.add(c);
        if (!revealedRef.current.has(c) && !pending.current.has(c)) {
          pending.current.add(c);
          any = true;
        }
      }
      bump();
      // sent with the next frame: strokes within a frame travel together, but nothing waits longer than that
      if (any && !flushing.current) flushing.current = requestAnimationFrame(flush);
    },
    [flush],
  );
  useEffect(
    () => () => {
      if (flushing.current) {
        if (typeof flushing.current === 'number') cancelAnimationFrame(flushing.current);
        else clearTimeout(flushing.current);
        flush(); // do not lose tiles scratched just before leaving this tab
      }
    },
    [flush],
  );

  // brush: about two tiles wide, so what you scratch is close to what is counted
  const brush = Math.max(24, Math.min(46, cw * 2.1));

  /** Tiles the brush touches at a point (a tile counts once any part of it is under the brush). */
  const cellsAt = (x: number, y: number) => {
    const r = brush / 2;
    const out: number[] = [];
    for (let cy = Math.max(0, Math.floor((y - r) / ch)); cy <= Math.min(rows - 1, Math.floor((y + r) / ch)); cy++) {
      for (let cx = Math.max(0, Math.floor((x - r) / cw)); cx <= Math.min(cols - 1, Math.floor((x + r) / cw)); cx++) {
        const nx = Math.max(cx * cw, Math.min(x, (cx + 1) * cw));
        const ny = Math.max(cy * ch, Math.min(y, (cy + 1) * ch));
        if (Math.hypot(nx - x, ny - y) <= r) out.push(cy * cols + cx);
      }
    }
    return out;
  };

  /** Draw one stroke segment onto `ctx`, only inside the given tiles. */
  const strokeIn = (ctx: CanvasRenderingContext2D, cells: number[], op: GlobalCompositeOperation, x0: number, y0: number, x1: number, y1: number) => {
    if (!cells.length) return;
    ctx.save();
    ctx.setTransform(dprOf(), 0, 0, dprOf(), 0, 0);
    ctx.beginPath();
    for (const c of cells) {
      const r = cellRect(c);
      ctx.rect(r.x, r.y, r.w, r.h);
    }
    ctx.clip();
    ctx.globalCompositeOperation = op;
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#2d3558';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  };

  const stroke = (x0: number, y0: number, x1: number, y1: number) => {
    const dist = Math.hypot(x1 - x0, y1 - y0);
    const steps = Math.max(1, Math.ceil(dist / (brush / 3)));
    const hit = new Set<number>();
    for (let i = 0; i <= steps; i++) cellsAt(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps).forEach((c) => hit.add(c));
    const here = [...hit];
    const arrived = here.filter((c) => revealedRef.current.has(c));
    const waiting = here.filter((c) => !revealedRef.current.has(c));
    const fctx = foil.current?.getContext('2d');
    const mctx = marks.current?.getContext('2d');
    // photo already there: the foil simply comes off, as on any scratch card
    if (fctx) strokeIn(fctx, arrived, 'destination-out', x0, y0, x1, y1);
    // photo on its way: soft rub marks (they become a hole in the foil, and photo, as soon as the tile arrives)
    if (mctx) strokeIn(mctx, waiting, 'source-over', x0, y0, x1, y1);
    queue(here);
  };

  const pos = (clientX: number, clientY: number) => {
    const r = foil.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const off = locked || failed;

  const revealBit = () => {
    // keyboard / assistive alternative: release a patch of tiles around a random hidden one
    const hidden = Array.from({ length: total }, (_, i) => i).filter((i) => !touched.current.has(i));
    if (!hidden.length) return;
    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    const px = ((pick % cols) + 0.5) * cw;
    const py = (Math.floor(pick / cols) + 0.5) * ch;
    stroke(px, py, px + 0.01, py);
  };

  const pct = Math.min(100, Math.round((Math.max(touched.current.size, revealed.size) / total) * 100));
  const bonus = useMemo(() => tiers.find((x) => pct <= x.maxPct)?.points ?? 0, [pct, tiers]);

  return (
    <div className="absolute inset-0 flex flex-col bg-[#1c1417] text-white" data-testid="scratch-card" data-pct={pct}>
      <div className="shrink-0 space-y-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {top}
        <div className="flex items-center gap-3 rounded-2xl bg-white/10 px-3.5 py-2.5 ring-1 ring-white/15">
          <Sparkles size={16} className="shrink-0 text-apricot" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-2 text-sm font-semibold">
              <span data-testid="scratch-pct">{t('scratch.revealed', { pct })}</span>
              <span className="text-apricot" data-testid="scratch-bonus">{t('scratch.bonus', { n: bonus })}</span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-r from-apricot to-rose transition-all duration-200" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <p className="text-center text-xs text-white/75">{failed ? t('scratch.closed') : t('scratch.hint')}</p>
      </div>

      <div ref={area} className="grid min-h-0 flex-1 place-items-center">
        {size.w > 0 && (
          <div className="relative overflow-hidden rounded-2xl bg-[#2a2024] shadow-[0_24px_60px_-18px_rgba(0,0,0,0.8)] ring-1 ring-white/15" style={{ width: size.w, height: size.h }}>
            {/* tiles: only those the server released */}
            {[...revealed].map((cell) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={cell}
                src={tiles[cell] ?? `/api/media/${puzzleId}/scratch-${cell}`}
                alt=""
                draggable={false}
                className="absolute select-none object-fill"
                style={{ left: `${((cell % cols) / cols) * 100}%`, top: `${(Math.floor(cell / cols) / rows) * 100}%`, width: `calc(${100 / cols}% + 1px)`, height: `calc(${100 / rows}% + 1px)` }}
                data-testid="scratch-tile"
              />
            ))}
            <canvas
              ref={foil}
              className={`absolute inset-0 h-full w-full touch-none ${off ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
              style={{ width: size.w, height: size.h }}
              role="img"
              aria-label={t('scratch.label')}
              data-testid="scratch-canvas"
              onPointerDown={(e) => {
                if (off) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const p = pos(e.clientX, e.clientY);
                drawing.current = p;
                stroke(p.x, p.y, p.x + 0.01, p.y);
              }}
              onPointerMove={(e) => {
                if (off || !drawing.current) return;
                // touch screens batch many finger positions into one event; use them all so fast swipes leave no gaps
                const pts = e.nativeEvent.getCoalescedEvents?.() ?? [];
                for (const ev of pts.length ? pts : [e.nativeEvent]) {
                  const p = pos(ev.clientX, ev.clientY);
                  stroke(drawing.current.x, drawing.current.y, p.x, p.y);
                  drawing.current = p;
                }
              }}
              onPointerUp={() => (drawing.current = null)}
              onPointerCancel={() => (drawing.current = null)}
            />
            {/* rub marks: soft, never opaque, and wiped as soon as the photo is there */}
            <canvas ref={marks} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.22]" style={{ width: size.w, height: size.h }} />
          </div>
        )}
      </div>

      <div className="shrink-0 space-y-2.5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {!off && (
          <button type="button" className="mx-auto flex min-h-10 items-center rounded-full px-4 text-sm font-semibold text-white/80 underline-offset-4 hover:underline" onClick={revealBit} data-testid="scratch-reveal-bit">
            {t('scratch.revealBit')}
          </button>
        )}
        {bottom}
      </div>
    </div>
  );
}
