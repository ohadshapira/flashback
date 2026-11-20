'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarDays, ChevronUp, MapPin, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { WorldMap } from './WorldMap';
import { PanImage } from './PanImage';
import { useI18n } from './I18nProvider';
import { formatMonthYear } from '@/lib/date';
import { ageAt, nearestPlace, roundJobs, type PartnerPlace, type PartnersProfile } from '@/lib/partners';
import { formatDistance } from '@/lib/geo';
import type { RoundResult } from '@/lib/client/types';

function ScoreRing({ total, size = 128 }: { total: number; size?: number }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 108 108" className="absolute inset-0 -rotate-90" aria-hidden>
        <defs>
          <linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ee6a7d" />
            <stop offset="1" stopColor="#f2a15f" />
          </linearGradient>
        </defs>
        <circle cx="54" cy="54" r={r} fill="none" stroke="#f1e3d3" strokeWidth="9" />
        <circle
          cx="54"
          cy="54"
          r={r}
          fill="none"
          stroke="url(#ring-g)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(100, total) / 100)}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.7,.2,1)' }}
        />
      </svg>
      <div className="text-center leading-none">
        <div className="font-display text-4xl font-bold text-rose-deep" data-testid="score-total">{total}</div>
        <div className="mt-1 text-[11px] font-semibold tracking-wider text-muted">/ 100</div>
      </div>
    </div>
  );
}

type Shared = { result: RoundResult; team?: boolean; hideGuess?: boolean; partners?: PartnersProfile | null };

/** Partners: who did which job this round, the family place the memory happened at (within 3 km), and the child's age. */
export function partnerFacts(result: RoundResult, profile: PartnersProfile | null | undefined, t: ReturnType<typeof useI18n>['t']): { jobs: { map: string; wheels: string } | null; place: PartnerPlace | null; age: string | null } {
  if (!profile) return { jobs: null, place: null, age: null };
  const { map, wheels } = roundJobs(profile, result.index);
  const n = profile.birth ? ageAt(profile.birth, result.truth) : null;
  const age = n === null ? null : n > 0 ? `🎂 ${t('partners.ageText', { n })}` : n === 0 ? `🍼 ${t('partners.firstYear')}` : t('partners.beforeBorn');
  return { jobs: { map, wheels }, place: nearestPlace(profile.places, result.truth), age };
}

/** Map with the real place, the guess, the line between them and the distance. */
function MapCard({ result, hideGuess, tall, partners }: Shared & { tall?: boolean }) {
  const { t, intl } = useI18n();
  const g = hideGuess ? null : result.guess;
  const { place } = partnerFacts(result, partners, t);
  return (
    <section className="card fb-pop space-y-3 !p-2.5">
      <div className={`relative overflow-hidden rounded-[22px] ${tall ? 'h-72 @3xl:h-80 sm:h-80' : 'h-64 @3xl:h-80'}`}>
        <WorldMap className="absolute inset-0" pin={g ? { lat: g.lat, lng: g.lng } : null} truth={result.truth} readOnly fit ariaLabel={t('reveal.correct')} />
      </div>
      {place && (
        <p className="chip w-full justify-center whitespace-normal bg-good-soft py-2 text-base text-good" data-testid="reveal-place">
          {t('partners.place')}: {place.icon} {place.label}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-2 pb-1 text-sm">
        <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-good ring-2 ring-white" /> {t('reveal.legendTruth')}</span>
        {g && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-rose ring-2 ring-white" /> {t('reveal.legendGuess')}</span>}
        {g && <span className="chip ms-auto bg-blue-soft text-blue-deep" data-testid="reveal-distance">{t('reveal.distance')}: <bdi dir="ltr">{formatDistance(g.distanceKm, intl)}</bdi></span>}
      </div>
    </section>
  );
}

function DatesCard({ result, team, hideGuess, partners }: Shared) {
  const { t, intl } = useI18n();
  const g = hideGuess ? null : result.guess;
  const diff = g ? g.monthDiff : null;
  const { age } = partnerFacts(result, partners, t);
  return (
    <section className="card grid grid-cols-2 gap-3 text-center">
      <div className={`rounded-2xl bg-good-soft/70 px-3 py-4 ${hideGuess ? 'col-span-2' : ''}`}>
        <div className="eyebrow !text-good">{t('reveal.correct')}</div>
        <div className="mt-1 font-display text-2xl font-semibold text-good" data-testid="reveal-true-date">{formatMonthYear(result.truth, intl)}</div>
        {age && <div className="mt-1 text-sm font-semibold text-good" data-testid="reveal-age">{age}</div>}
      </div>
      <div className={`rounded-2xl bg-rose-soft/70 px-3 py-4 ${hideGuess ? 'hidden' : ''}`}>
        <div className="eyebrow !text-rose-deep">{team ? t('reveal.teamGuess') : t('reveal.yourGuess')}</div>
        <div className="mt-1 font-display text-2xl font-semibold text-rose-deep" data-testid="reveal-guess-date">{g ? formatMonthYear(g, intl) : '—'}</div>
      </div>
      {g && (
        <p className="col-span-2 text-sm font-medium text-muted" data-testid="reveal-month-diff">
          {diff === 0 ? t('reveal.exact') : diff === 1 ? t('reveal.oneOff') : t('reveal.off', { n: diff! })}
        </p>
      )}
    </section>
  );
}

function ScoreCard({ result, hideGuess, partners }: Shared) {
  const { t } = useI18n();
  const g = hideGuess ? null : result.guess;
  const { jobs } = partnerFacts(result, partners, t);
  if (!g) return hideGuess ? null : <p className="card text-center text-muted" data-testid="no-guess">{t('reveal.noGuess')}</p>;
  return (
    <section className="card" data-testid="score-breakdown">
      <div className="flex items-center gap-5">
        <ScoreRing total={g.score.total} />
        <dl className="min-w-0 flex-1 space-y-3">
          {[
            ['reveal.location', g.score.location, 50],
            ['reveal.date', g.score.date, 30],
            ['reveal.zoom', g.score.zoom, 20],
          ].map(([k, v, max]) => (
            <div key={k as string}>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <dt className="font-medium">
                  {k === 'reveal.zoom' && g.scratchPct !== null ? t('reveal.scratch') : t(k as 'reveal.location')}
                  {jobs && k === 'reveal.location' && ` · ${jobs.map}`}
                  {jobs && k === 'reveal.date' && ` · ${jobs.wheels}`}
                </dt>
                <dd className="font-semibold tabular-nums" data-testid={`score-${(k as string).split('.')[1]}`}>{v}/{max}</dd>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-line/70">
                <div className="h-full rounded-full bg-gradient-to-r from-rose to-apricot" style={{ width: `${((v as number) / (max as number)) * 100}%`, animation: 'score-fill 1s cubic-bezier(.2,.7,.2,1) both' }} />
              </div>
            </div>
          ))}
        </dl>
      </div>
      {g.scratchPct !== null && <p className="mt-3 text-center text-sm font-medium text-muted" data-testid="reveal-scratch-pct">{t('reveal.scratchPct', { pct: g.scratchPct })}</p>}
      <p className="sr-only">{t('reveal.total')}</p>
    </section>
  );
}

function verdictKey(total: number): 'perfect' | 'great' | 'good' | 'low' {
  return total >= 85 ? 'perfect' : total >= 60 ? 'great' : total >= 30 ? 'good' : 'low';
}

/**
 * Complete-photo reveal. `immersive` (couple / family): the whole photo fills the screen, with the title and story on it,
 * and the map + dates + score slide up as a sheet below it (a pinned second column on wide screens). Otherwise (party)
 * the original stacked layout.
 */
export function RevealView({
  result,
  team,
  hideGuess,
  partners,
  immersive,
  actions,
  children,
}: Shared & {
  /** Photo-first, full-screen layout. */
  immersive?: boolean;
  /** Pinned action bar (e.g. "Next memory"), immersive only. */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const { t, intl } = useI18n();
  const g = hideGuess ? null : result.guess;
  const facts = partnerFacts(result, partners, t);
  const verdict = g ? verdictKey(g.score.total) : null;
  // Immersive hero: fill the screen by default (slowly panning across whatever `cover` would hide); one tap shows the whole photo.
  const [fit, setFit] = useState(false);
  const [mismatch, setMismatch] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // On phones the photo stays fixed and the details sheet slides up over it; --p (0..1) dims/fades the photo layer as it covers it.
  useEffect(() => {
    if (!immersive) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const small = window.innerWidth < 1024;
      const p = small ? Math.min(1, Math.max(0, window.scrollY / (window.innerHeight * 0.45))) : 0;
      root.current?.style.setProperty('--p', p.toFixed(3));
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [immersive]);
  if (!immersive) {
    return (
      <div className="@container space-y-5" data-testid="reveal-view">
        {verdict && (
          <div className="fb-pop text-center" aria-hidden>
            <p className="text-gradient font-display text-[2.5rem] font-semibold italic leading-none tracking-tight" style={{ fontVariationSettings: "'opsz' 144" }}>
              {t(`reveal.verdict.${verdict}` as 'reveal.verdict.perfect')}
            </p>
          </div>
        )}
        <div className="grid gap-5 @3xl:grid-cols-2 @3xl:items-start">
          <figure className="polaroid fb-pop mx-auto w-full max-w-full -rotate-[0.8deg] !pb-4 @3xl:sticky @3xl:top-4">
            <div className="overflow-hidden rounded-[2px] bg-ink/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.originalUrl} alt={result.title ?? ''} className="fb-reveal max-h-[52dvh] w-full object-contain @3xl:max-h-[64dvh]" data-testid="reveal-photo" />
            </div>
            {(result.title || result.story) && (
              <figcaption className="space-y-1 px-1.5 pt-3.5 text-center">
                {result.title && <p className="font-display text-2xl font-semibold italic" data-testid="reveal-title">{result.title}</p>}
                {result.story && <p className="text-sm leading-relaxed text-muted" data-testid="reveal-story">{result.story}</p>}
              </figcaption>
            )}
          </figure>
          <div className="space-y-5">
            <MapCard result={result} team={team} hideGuess={hideGuess} partners={partners} />
            <DatesCard result={result} team={team} hideGuess={hideGuess} partners={partners} />
            <ScoreCard result={result} team={team} hideGuess={hideGuess} partners={partners} />
          </div>
        </div>
        {children}
      </div>
    );
  }

  const total = g?.score.total ?? 0;
  return (
    <div ref={root} className="lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]" data-testid="reveal-view">
      {/* ---- hero: the full photo, edge to edge ---- */}
      <section className="relative isolate h-dvh overflow-hidden bg-[#1c1417] max-lg:fixed max-lg:inset-0 lg:sticky lg:top-0">
        {/* "whole photo" mode: a blurred copy fills the screen around the uncropped photo */}
        {fit && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.originalUrl} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-125 object-cover opacity-90 blur-3xl brightness-[.55] saturate-125" draggable={false} />
        )}
        <div className="absolute inset-0 will-change-transform" style={{ transform: 'scale(calc(1 + var(--p, 0) * 0.05))' }}>
        <div className="fb-reveal absolute inset-0">
          <PanImage src={result.originalUrl} alt={result.title ?? ''} fit={fit} testId="reveal-photo" onMismatch={setMismatch} />
        </div>
        </div>
        {/* the sheet darkens the photo as it rises over it */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-black" style={{ opacity: 'calc(var(--p, 0) * 0.55)' }} />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 bg-gradient-to-b from-black/80 via-black/40 to-transparent" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[26rem] bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

        {/* top: round progress + verdict */}
        <div className="absolute inset-x-0 top-0 z-10 space-y-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
          <div className="flex gap-1.5" aria-hidden>
            {Array.from({ length: result.total }, (_, i) => (
              <span key={i} className={`h-1 flex-1 rounded-full ${i < result.index ? 'bg-white' : i === result.index ? 'bg-gradient-to-r from-rose to-apricot' : 'bg-white/30'}`} />
            ))}
          </div>
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-display text-lg font-semibold drop-shadow" data-testid="reveal-heading">
              {t('reveal.heading')} <span className="text-sm font-medium text-white/80">· {t('play.round', { n: result.index + 1, total: result.total })}</span>
            </h1>
            {mismatch && (
              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-black/40 px-3.5 text-sm font-semibold text-white ring-1 ring-white/25 backdrop-blur-sm transition hover:bg-black/55"
                onClick={() => setFit((v) => !v)}
                aria-pressed={fit}
                data-testid="reveal-fit"
              >
                {fit ? <Maximize2 size={15} aria-hidden /> : <Minimize2 size={15} aria-hidden />} {fit ? t('reveal.fillScreen') : t('reveal.showWhole')}
              </button>
            )}
          </div>
          {verdict && (
            <p className="fb-pop font-display text-[2.1rem] font-semibold leading-none tracking-tight [text-shadow:0_3px_18px_rgba(0,0,0,0.7)] lg:text-[2.6rem]" aria-hidden style={{ fontVariationSettings: "'opsz' 144", opacity: 'calc(1 - var(--p, 0) * 2)' }}>
              {t(`reveal.verdict.${verdict}` as 'reveal.verdict.perfect')}
            </p>
          )}
        </div>

        {/* bottom: title, story and the headline facts */}
        <div className="absolute inset-x-0 bottom-[calc(40dvh+0.75rem)] z-10 px-4 text-white lg:bottom-0 lg:px-5 lg:pb-[max(7rem,calc(env(safe-area-inset-bottom)+6.5rem))]" style={{ opacity: 'calc(1 - var(--p, 0) * 1.5)' }}>
        <div className="space-y-2 rounded-[24px] bg-black/60 p-3.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.7)] ring-1 ring-white/15 lg:space-y-3 lg:p-4">
          {result.title && <p className="font-display text-[1.4rem] font-semibold leading-tight text-white lg:text-[1.7rem] [text-shadow:0_2px_14px_rgba(0,0,0,0.65)]" data-testid="reveal-title">{result.title}</p>}
          {result.story && <p className="line-clamp-2 max-w-prose text-[14px] leading-snug text-white lg:line-clamp-4 lg:text-[15px] lg:leading-relaxed [text-shadow:0_1px_8px_rgba(0,0,0,0.6)]" data-testid="reveal-story">{result.story}</p>}
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5 lg:gap-2 lg:pt-1" aria-hidden>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[13px] font-semibold ring-1 ring-white/30 lg:px-3 lg:py-1.5 lg:text-sm">
              <CalendarDays size={15} /> {formatMonthYear(result.truth, intl)}
            </span>
            {facts.place && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[13px] font-semibold ring-1 ring-white/30 lg:px-3 lg:py-1.5 lg:text-sm">{facts.place.icon} {facts.place.label}</span>
            )}
            {facts.age && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[13px] font-semibold ring-1 ring-white/30 lg:px-3 lg:py-1.5 lg:text-sm">{facts.age}</span>
            )}
            {g && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[13px] font-semibold ring-1 ring-white/30 lg:px-3 lg:py-1.5 lg:text-sm">
                <MapPin size={15} /> <bdi dir="ltr">{formatDistance(g.distanceKm, intl)}</bdi>
              </span>
            )}
            {g && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-rose to-apricot px-2.5 py-1 text-[13px] font-bold shadow-lg lg:px-3 lg:py-1.5 lg:text-sm">
                <Sparkles size={15} /> {total}/100
              </span>
            )}
          </div>
        </div>
        </div>
      </section>

      {/* ---- details: slides up over the photo on phones, pinned beside it on wide screens ---- */}
      <div className="pointer-events-none relative z-20 lg:pointer-events-auto">
        <div aria-hidden className="h-[60dvh] lg:hidden" />
      <div id="reveal-details" className="pointer-events-auto rounded-t-[32px] bg-[#fbf3e8] px-4 pb-36 pt-3 shadow-[0_-24px_60px_-18px_rgba(38,26,29,0.5)] lg:min-h-dvh lg:rounded-none lg:px-8 lg:pt-10 lg:shadow-none">
        <button
          type="button"
          className="mx-auto mb-3 flex min-h-11 w-full flex-col items-center justify-center gap-1 text-sm font-semibold text-muted lg:hidden"
          onClick={() => document.getElementById('reveal-details')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        >
          <span aria-hidden className="h-1 w-10 rounded-full bg-line" />
          <span className="inline-flex items-center gap-1">{t('reveal.seeDetails')} <ChevronUp size={15} aria-hidden /></span>
        </button>
        <div className="mx-auto max-w-xl space-y-5">
          <MapCard result={result} team={team} hideGuess={hideGuess} partners={partners} tall />
          <DatesCard result={result} team={team} hideGuess={hideGuess} partners={partners} />
          <ScoreCard result={result} team={team} hideGuess={hideGuess} partners={partners} />
          {children}
        </div>
      </div>
      </div>

      {/* ---- pinned action bar ---- */}
      {actions && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:start-auto lg:end-0 lg:w-[46.5%] lg:px-8">
          <div className="mx-auto max-w-xl rounded-[28px] border border-white/80 bg-paper/95 p-2.5 shadow-[0_18px_40px_-14px_rgba(38,26,29,0.5)]">{actions}</div>
        </div>
      )}
    </div>
  );
}
