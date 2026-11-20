'use client';

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Languages } from 'lucide-react';
import { useI18n } from './I18nProvider';
import { translate } from '@/i18n';

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" style={{ filter: 'drop-shadow(0 6px 8px rgba(190,60,80,.35))' }}>
      <defs>
        <linearGradient id="lm-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ee6a7d" />
          <stop offset="1" stopColor="#f2a15f" />
        </linearGradient>
        <linearGradient id="lm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#46628a" />
          <stop offset="1" stopColor="#f4b087" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="18" fill="url(#lm-bg)" />
      <g transform="rotate(-7 32 32)">
        <rect x="14" y="12" width="36" height="40" rx="3" fill="#fffcf7" />
        <rect x="18" y="16" width="28" height="25" rx="1.5" fill="url(#lm-sky)" />
        <circle cx="35" cy="31" r="5" fill="#fff3d6" />
        <path d="M18 41 L28 30 L34 36 L40 29 L46 41 Z" fill="#2f4668" opacity=".85" />
      </g>
      <path d="M48 10c-4.4 0-8 3.4-8 7.6 0 5.6 8 13.4 8 13.4s8-7.8 8-13.4C56 13.4 52.4 10 48 10z" fill="#fffcf7" />
      <circle cx="48" cy="17.6" r="3" fill="#d24b62" />
    </svg>
  );
}

export function LocaleSwitch() {
  const { locale, setLocale, t } = useI18n();
  return (
    <button type="button" className="btn-ghost !min-h-11 text-sm" onClick={() => setLocale(locale === 'he' ? 'en' : 'he')} data-testid="locale-switch" lang={locale === 'he' ? 'en' : 'he'}>
      <Languages size={16} aria-hidden /> {t('lang.switch')}
    </button>
  );
}

/** Wordmark + tagline header used across non-fullscreen pages. */
const WIDTHS = { narrow: 'max-w-xl', wide: 'max-w-3xl', huge: 'max-w-6xl' } as const;
export type ShellSize = keyof typeof WIDTHS;

export function AppHeader({ large, wide, size }: { large?: boolean; wide?: boolean; size?: ShellSize }) {
  const { t } = useI18n();
  const width = size ? WIDTHS[size] : wide ? 'max-w-5xl' : WIDTHS.narrow;
  return (
    // The brand header looks the same in every language: logo, wordmark and the English tagline on the left, the language switch on the right.
    <header dir="ltr" className={`mx-auto flex w-full ${width} items-center justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))]`}>
      <Link href="/" className="flex items-center gap-2.5" aria-label={`${t('brand.name')} — ${t('common.home')}`} data-testid="brand-link">
        <LogoMark size={large ? 40 : 32} />
        <span className="flex flex-col leading-tight">
          <span className={`font-brand font-bold lowercase tracking-[-0.045em] ${large ? 'text-[2.15rem]' : 'text-[1.75rem]'}`} data-testid="brand-name">
            {t('brand.name')}
          </span>
          <span className="text-[11px] font-medium tracking-wide text-muted" data-testid="brand-tagline" lang="en">
            {translate('en', 'brand.tagline')}
          </span>
        </span>
      </Link>
      <LocaleSwitch />
    </header>
  );
}

/** Four-step setup progress (1 setup, 2 photos, 3 answers, 4 review). */
export function Stepper({ current }: { current: 1 | 2 | 3 | 4 }) {
  const { t } = useI18n();
  const steps = [t('steps.setup'), t('steps.photos'), t('steps.answers'), t('steps.review')];
  return (
    <nav aria-label={t('steps.label', { n: current, total: 4 })} className="mb-5">
      <ol className="flex items-center gap-1.5" data-testid="stepper">
        {steps.map((label, i) => {
          const n = i + 1;
          const done = n < current;
          const active = n === current;
          return (
            <li key={label} className="flex flex-1 flex-col gap-1.5" aria-current={active ? 'step' : undefined}>
              <span className={`h-1.5 rounded-full transition-colors ${done ? 'bg-rose' : active ? 'bg-gradient-to-r from-rose to-apricot' : 'bg-line'}`} />
              <span className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${active ? 'text-rose-deep' : done ? 'text-ink/70' : 'text-muted/70'}`}>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Page title block: serif heading + short supporting line. */
export function PageHeading({ title, subtitle, testId }: { title: string; subtitle?: string; testId?: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight" data-testid={testId} style={{ fontVariationSettings: "'opsz' 96" }}>
        {title}
      </h1>
      {subtitle && <p className="mt-1.5 max-w-prose text-[15px] leading-relaxed text-muted">{subtitle}</p>}
    </div>
  );
}

export function BackLink({ href, label }: { href: string; label?: string }) {
  const { dir, t } = useI18n();
  const Icon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  return (
    <Link href={href} className="btn-ghost -ms-3 mb-2 !px-3">
      <Icon size={18} aria-hidden /> {label ?? t('common.back')}
    </Link>
  );
}

export function PageShell({ children, wide, size }: { children: React.ReactNode; wide?: boolean; size?: ShellSize }) {
  const s: ShellSize = size ?? (wide ? 'wide' : 'narrow');
  return (
    <>
      <AppHeader size={s} />
      <main className={`mx-auto w-full px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-2 ${WIDTHS[s]}`}>{children}</main>
    </>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="rounded-2xl border border-rose/30 bg-rose-soft p-4 text-rose-deep" data-testid="error-box">
      <p className="font-medium">{message}</p>
      {onRetry && (
        <button type="button" className="btn-secondary mt-3" onClick={onRetry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="grid place-items-center gap-3 py-16 text-muted" role="status">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-rose" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}

/** Full-viewport game screen: slim top bar + content that fills the rest (dvh-safe on mobile browsers). */
export function GameScreen({ title, right, back, progress, children }: { title: React.ReactNode; right?: React.ReactNode; back?: { href: string; label: string }; /** 0-based current round + total, shown as a segmented bar. */ progress?: { current: number; total: number }; children: React.ReactNode }) {
  const { dir } = useI18n();
  const Icon = dir === 'rtl' ? ArrowRight : ArrowLeft;
  return (
    <div className="fixed inset-0 flex flex-col bg-ivory" style={{ height: '100dvh' }}>
      <div className="relative z-30 flex min-h-12 items-center justify-between gap-2 border-b border-line/80 bg-paper px-3 pt-[env(safe-area-inset-top)] shadow-[0_6px_18px_-12px_rgba(38,26,29,0.4)]">
        {back ? (
          <Link href={back.href} className="btn-ghost !min-h-11 !px-2 text-sm" data-testid="game-back">
            <Icon size={18} aria-hidden /> {back.label}
          </Link>
        ) : (
          <span className="w-16" />
        )}
        <div className="text-center font-display text-base font-semibold">{title}</div>
        <div className="flex min-w-16 justify-end text-sm font-semibold text-muted">{right}</div>
        {progress && (
          <div aria-hidden className="absolute inset-x-0 bottom-0 flex gap-0.5 px-0">
            {Array.from({ length: progress.total }, (_, i) => (
              <span key={i} className={`h-[3px] flex-1 ${i < progress.current ? 'bg-rose' : i === progress.current ? 'bg-gradient-to-r from-rose to-apricot' : 'bg-line/60'}`} />
            ))}
          </div>
        )}
      </div>
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  );
}
