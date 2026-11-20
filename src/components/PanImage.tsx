'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type Layout = { w: number; h: number; ox: number; oy: number };

/**
 * An image that fills its (positioned) parent like `object-fit: cover`, and, when `cover` would hide a lot of it, pans
 * slowly across the hidden part with a compositor-friendly transform (no per-frame repaint). `fit` shows it whole.
 * `onMismatch` tells the parent whether the image and the box have clearly different shapes (so a fit/fill toggle makes sense).
 */
export function PanImage({
  src,
  alt,
  fit,
  testId,
  stage,
  onLoaded,
  onMismatch,
}: {
  src: string;
  alt: string;
  fit?: boolean;
  testId?: string;
  stage?: number;
  onLoaded?: () => void;
  onMismatch?: (mismatch: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  const compute = useCallback(() => {
    const el = box.current;
    const im = img.current;
    if (!el || !im || !im.naturalWidth || !im.naturalHeight) return;
    const bw = el.clientWidth;
    const bh = el.clientHeight;
    if (!bw || !bh) return;
    const scale = Math.max(bw / im.naturalWidth, bh / im.naturalHeight);
    const w = im.naturalWidth * scale;
    const h = im.naturalHeight * scale;
    setLayout({ w, h, ox: Math.max(0, w - bw), oy: Math.max(0, h - bh) });
    onMismatch?.(Math.abs(im.naturalWidth / im.naturalHeight / (bw / bh) - 1) >= 0.1);
  }, [onMismatch]);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => compute());
    ro.observe(el);
    return () => ro.disconnect();
  }, [compute]);

  const panX = !fit && !!layout && layout.ox > layout.w * 0.1;
  const panY = !fit && !!layout && layout.oy > layout.h * 0.1;
  const sized = !fit && !!layout && (panX || panY);

  return (
    <div ref={box} className="absolute inset-0 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={img}
        src={src}
        alt={alt}
        draggable={false}
        data-testid={testId}
        data-stage={stage}
        onLoad={() => {
          compute();
          onLoaded?.();
        }}
        className={sized ? `absolute max-w-none ${panX ? 'pan-x' : 'pan-y'}` : `absolute inset-0 h-full w-full ${fit ? 'object-contain' : 'object-cover'}`}
        style={
          sized && layout
            ? ({
                width: layout.w,
                height: layout.h,
                left: panX ? 0 : -layout.ox / 2,
                top: panY ? 0 : -layout.oy / 2,
                ['--pan' as string]: `${-(panX ? layout.ox : layout.oy)}px`,
              } as React.CSSProperties)
            : undefined
        }
      />
    </div>
  );
}
