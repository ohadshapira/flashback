'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MapPin, Check, Eye, X } from 'lucide-react';
import { WorldMap } from './WorldMap';
import { ClueStage } from './ClueView';
import { DateWheels, type WheelDecor } from './DateWheels';
import { useI18n } from './I18nProvider';
import type { MonthYear } from '@/lib/date';
import { isAt, isSouthern, roundJobs, type PartnersProfile } from '@/lib/partners';
import type { Pin } from '@/lib/client/types';

type Props = {
  mode: 'guess' | 'answer';
  pin: Pin | null;
  onPinChange: (p: Pin) => void;
  date: MonthYear;
  onDateChange: (d: MonthYear) => void;
  onConfirm: () => void;
  confirmLabel: string;
  title: string;
  busy?: boolean;
  /** After submission: block any further editing. */
  locked?: boolean;
  /** Only the *currently authorized* cropped clue. Never an original. */
  clueUrl?: string;
  /** Which zoom stage the clue is at (shown on the thumbnail). */
  clueStage?: number;
  /** Extra content above the wheels (e.g. host suggestion chips). */
  extra?: React.ReactNode;
  focus?: (Pin & { nonce: number }) | null;
  /** Partners: the family's places on the map, child-friendly wheel labels, and (with `roundIndex`) who does which job. */
  partners?: { profile: PartnersProfile; roundIndex?: number } | null;
  className?: string;
};

function useCompactHeight() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-height: 720px)');
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return compact;
}

/** Optional human-readable place for the pin. Needs a MapTiler key; the pin coordinates stay the real answer. */
function usePlaceLabel(pin: Pin | null): string | null {
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    if (!key || !pin) return void setLabel(null);
    const ctrl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const r = await fetch(`https://api.maptiler.com/geocoding/${pin.lng},${pin.lat}.json?key=${key}&limit=1`, { signal: ctrl.signal });
        const j = (await r.json()) as { features?: { place_name?: string }[] };
        setLabel(j.features?.[0]?.place_name ?? null);
      } catch {
        setLabel(null);
      }
    }, 450);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [pin, key]);
  return label;
}

/**
 * THE answer screen: one world map (single draggable pin) with the month + year wheels anchored in
 * a bottom panel on the same map, and the confirm action inside that panel. Used both for guessing
 * (all game modes) and for the host's setup of the correct answer.
 */
export function MapWheelStage({ mode, pin, onPinChange, date, onDateChange, onConfirm, confirmLabel, title, busy, locked, clueUrl, clueStage, extra, focus, partners, className }: Props) {
  const { t } = useI18n();
  const compact = useCompactHeight();
  const panel = useRef<HTMLDivElement>(null);
  const [inset, setInset] = useState(260);
  const [zoomed, setZoomed] = useState(false);
  const place = usePlaceLabel(pin);

  const profile = partners?.profile ?? null;
  const roundIndex = partners?.roundIndex;
  const jobs = profile && roundIndex !== undefined ? roundJobs(profile, roundIndex) : null;
  const decor = useMemo<WheelDecor | undefined>(() => (profile ? { birth: profile.birth, south: isSouthern(profile) } : undefined), [profile]);
  const mapPlaces = profile?.places.map((p) => ({ lat: p.lat, lng: p.lng, icon: p.icon, label: p.label, active: !!pin && isAt(pin, p) }));
  const pinPlace = profile && pin ? profile.places.find((p) => isAt(pin, p)) : undefined;

  useEffect(() => {
    const el = panel.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setInset(el.offsetHeight));
    ro.observe(el);
    setInset(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  const canConfirm = !!pin && !busy && !locked;

  useEffect(() => {
    if (!zoomed) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setZoomed(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomed]);

  return (
    <div className={`relative isolate overflow-hidden ${className ?? ''}`} data-testid="map-wheel-stage" data-mode={mode}>
      <WorldMap
        className="absolute inset-0"
        pin={pin}
        onPinChange={locked ? undefined : onPinChange}
        readOnly={locked}
        bottomInset={inset}
        focus={focus}
        places={mapPlaces}
        onPlaceTap={mapPlaces && !locked ? (i) => onPinChange({ lat: profile!.places[i].lat, lng: profile!.places[i].lng }) : undefined}
        snapToPlaces={!!mapPlaces?.length}
        ariaLabel={t('stage.mapLabel')}
      />

      {/* current clue: only the authorized crop, as a small thumbnail */}
      {clueUrl && (
        <button type="button" onClick={() => setZoomed(true)} aria-label={t('stage.clueLabel')} className="group absolute start-3 top-3 z-10 -rotate-2 rounded-[6px] bg-white p-1.5 pb-6 shadow-[0_14px_26px_-10px_rgba(38,26,29,0.55)] transition hover:rotate-0 hover:scale-105 active:scale-95 sm:start-5 sm:top-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={clueUrl} alt="" className="h-[68px] w-24 object-cover sm:h-[96px] sm:w-36" draggable={false} data-testid="clue-thumb" />
          <span className="absolute end-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white"><Eye size={15} aria-hidden /></span>
          <span className="absolute inset-x-0 bottom-1 text-center text-[11px] font-semibold text-ink/70">{t('stage.peek')}</span>
        </button>
      )}

      {/* hint */}
      <div className="pointer-events-none absolute inset-x-0 z-10 flex justify-center px-16" style={{ bottom: inset + 12 }}>
        <div className="max-w-full truncate rounded-full bg-ink/85 px-4 py-2 text-sm font-medium text-white shadow-lg backdrop-blur" data-testid="map-hint" aria-live="polite">
          {locked
            ? t('stage.locked')
            : pinPlace
              ? `${pinPlace.icon} ${pinPlace.label}`
              : pin
                ? (place ?? t('stage.hintDrag'))
                : jobs
                  ? t('partners.hintPlace', { name: jobs.map })
                  : t('stage.hintPlace')}
        </div>
      </div>

      {/* bottom panel: wheels + confirm, anchored to the bottom edge of the map */}
      <div
        ref={panel}
        data-testid="wheel-panel"
        className={`absolute inset-x-0 bottom-0 z-20 rounded-t-[32px] border-t border-white/80 bg-paper px-4 shadow-[0_-18px_50px_-12px_rgba(38,26,29,0.35)] sm:inset-x-auto sm:start-1/2 sm:w-[min(30rem,100%)] sm:-translate-x-1/2 sm:border-x sm:px-6 rtl:sm:translate-x-1/2 ${compact ? 'pt-2' : 'pt-2.5'}`}
        style={{ paddingBottom: `max(${compact ? '0.6rem' : '1rem'}, env(safe-area-inset-bottom))` }}
      >
        <div className="mx-auto max-w-md">
          {!compact && <div aria-hidden className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" />}
          {jobs && (
            <div className="mb-1.5 flex flex-wrap gap-1.5" role="note" aria-label={t('partners.jobsAria', { map: jobs.map, wheels: jobs.wheels })} data-testid="partners-jobs">
              <span className={`chip ${jobs.childOnMap ? 'bg-rose-soft text-rose-deep ring-2 ring-rose/30' : 'bg-blue-soft text-blue-deep'}`} data-testid="job-map">🗺️ {t('partners.mapJob', { name: jobs.map })}</span>
              <span className={`chip ${jobs.childOnMap ? 'bg-blue-soft text-blue-deep' : 'bg-rose-soft text-rose-deep ring-2 ring-rose/30'}`} data-testid="job-wheels">📅 {t('partners.wheelsJob', { name: jobs.wheels })}</span>
            </div>
          )}
          <div className={`flex items-center justify-between gap-2 ${compact ? 'mb-0.5' : 'mb-2'}`}>
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <span className={`chip shrink-0 whitespace-nowrap transition-colors ${pin ? 'bg-good-soft text-good' : 'bg-blue-soft text-blue-deep'}`}>
              <MapPin size={14} aria-hidden /> {pin ? t('stage.pinSet') : t('stage.noPin')}
            </span>
          </div>
          {extra}
          <DateWheels value={date} onChange={onDateChange} rows={compact ? 3 : 5} disabled={locked} decor={decor} />
          <button type="button" className={`btn-primary w-full ${compact ? 'mt-2' : 'mt-3'}`} disabled={!canConfirm} onClick={onConfirm} data-testid="confirm-guess" aria-disabled={!canConfirm}>
            <Check size={18} aria-hidden /> {busy ? t('common.loading') : confirmLabel}
          </button>
          {!pin && !compact && <p className="mt-1.5 text-center text-xs text-muted">{t('stage.pickBoth')}</p>}
        </div>
      </div>

      {/* immersive peek: the same full-screen, slowly drifting clue as the clue screen; tap anywhere (or Esc) to return to the map */}
      {zoomed && clueUrl && createPortal(
        <div className="fixed inset-0 z-[60] cursor-pointer" role="dialog" aria-modal="true" aria-label={t('stage.clueLabel')} onClick={() => setZoomed(false)} data-testid="clue-peek">
          <ClueStage
            url={clueUrl}
            stage={clueStage ?? 1}
            testId="clue-peek-image"
            hideDots
            top={
              <div className="flex items-center justify-between">
                <span className="chip bg-black/45 !px-3 !py-1.5 text-sm text-white">{t('stage.clueTag', { n: clueStage ?? 1 })}</span>
                <button type="button" className="grid h-11 w-11 place-items-center rounded-full bg-black/45 text-white" onClick={() => setZoomed(false)} aria-label={t('common.close')} data-testid="clue-peek-close">
                  <X size={22} />
                </button>
              </div>
            }
            bottom={<p className="pb-1 text-center text-sm font-medium text-white/90 drop-shadow">{t('stage.peekClose')}</p>}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}
