'use client';

import { useEffect, useState } from 'react';
import { PanImage } from './PanImage';
import { useI18n } from './I18nProvider';

/** The current cropped clue plus a stage indicator. Receives only an already-authorized clue URL. */
export function ClueView({ url, stage, stageCount = 4 }: { url: string; stage: number; stageCount?: number }) {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div className="polaroid mx-auto max-w-full -rotate-1 !pb-3 transition-transform duration-500">
        <div className="relative overflow-hidden rounded-[2px] bg-ink/5">
          {/* key forces the reveal animation each time a wider clue arrives */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={url} src={url} alt={t('play.clue', { n: stage })} className="fb-reveal mx-auto max-h-[56dvh] w-full object-contain" draggable={false} data-testid="clue-image" data-stage={stage} />
        </div>
      </div>
      <StageDots stage={stage} stageCount={stageCount} />
    </div>
  );
}

function StageDots({ stage, stageCount, onDark }: { stage: number; stageCount: number; onDark?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-center gap-2" aria-label={t('room.stage', { n: stage })} role="img">
      {Array.from({ length: stageCount }, (_, i) => (
        <span key={i} className={`h-2.5 rounded-full transition-all duration-500 ${i < stage ? 'w-9 bg-gradient-to-r from-rose to-apricot' : onDark ? 'w-2.5 bg-white/40' : 'w-2.5 bg-line'}`} />
      ))}
      <span className={`ms-2 text-sm font-semibold ${onDark ? 'text-white drop-shadow' : 'text-muted'}`} data-testid="clue-stage">{t('play.clue', { n: stage })}</span>
    </div>
  );
}

/**
 * Full-bleed clue: the (already physically cropped) clue image fills its positioned parent and drifts slowly inside
 * the zoomed frame. When a wider clue arrives it is preloaded and then eases back from a closer zoom, so "Reveal more"
 * feels like pulling the camera back. Only the authorized clue asset is ever drawn; the drift just moves within it.
 */
export function ClueStage({ url, stage, stageCount = 4, top, bottom, testId = 'clue-image', hideDots }: { url: string; stage: number; stageCount?: number; top?: React.ReactNode; bottom?: React.ReactNode; testId?: string; hideDots?: boolean }) {
  const { t } = useI18n();
  // Keep showing the previous clue until the next one has loaded, so the swap never flashes.
  const [shown, setShown] = useState({ url, stage });
  // The entry animation starts once the image has actually loaded (otherwise it would finish before anything is visible).
  const [loaded, setLoaded] = useState<string | null>(null);
  useEffect(() => {
    if (url === shown.url) return;
    let cancelled = false;
    const img = new window.Image();
    const done = () => {
      if (!cancelled) setShown({ url, stage });
    };
    img.onload = done;
    img.onerror = done;
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url, stage, shown.url]);

  const first = shown.stage <= 1;
  const ready = loaded === shown.url;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[#1c1417]">
      <div key={shown.url} className="clue-drift absolute inset-0">
        <div className={`absolute inset-0 ${ready ? (first ? 'clue-in-first' : 'clue-zoom-out') : 'opacity-0'}`}>
          {/* `cover`, panning across whatever it would hide (a wide clue on a tall phone), so the whole clue is gradually seen */}
          <PanImage src={shown.url} alt={t('play.clue', { n: shown.stage })} testId={testId} stage={shown.stage} onLoaded={() => setLoaded(shown.url)} />
        </div>
      </div>
      {/* scrims keep the controls readable on any photo */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
      {top && <div className="absolute inset-x-0 top-0 z-10 px-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">{top}</div>}
      <div className="absolute inset-x-0 bottom-0 z-10 mx-auto w-full max-w-xl space-y-4 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {!hideDots && <StageDots stage={shown.stage} stageCount={stageCount} onDark />}
        {bottom}
      </div>
    </div>
  );
}
