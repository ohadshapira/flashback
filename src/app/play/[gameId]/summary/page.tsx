'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Heart, RotateCcw, Trash2 } from 'lucide-react';
import { AppHeader, ErrorBox, Spinner } from '@/components/Shell';
import { useI18n } from '@/components/I18nProvider';
import { api } from '@/lib/client/api';
import { useLoad } from '@/lib/client/hooks';
import { formatMonthYear } from '@/lib/date';
import type { SharedSummary } from '@/lib/client/types';

/** Emotional end screen: celebrate the shared memories, then replay or swap roles. */
export default function SummaryPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const { t, intl, errText } = useI18n();
  const { data, error, reload } = useLoad(() => api<SharedSummary>(`/api/games/${gameId}/summary`), [gameId]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function replay() {
    setBusy(true);
    try {
      await api(`/api/games/${gameId}/replay`, { method: 'POST' });
      router.push(`/play/${gameId}/handoff`);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }
  async function remove() {
    if (!window.confirm(t('summary.confirmDelete'))) return;
    setBusy(true);
    try {
      await api(`/api/games/${gameId}`, { method: 'DELETE' });
      router.push('/');
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  const couple = data?.game.mode === 'couple';
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl space-y-5 px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-4">
        {error ? (
          <ErrorBox message={errText(error)} onRetry={reload} />
        ) : !data ? (
          <Spinner />
        ) : (
          <>
            <section className="space-y-2 pt-2 text-center">
              <div className="relative mx-auto grid h-36 w-36 place-items-center" aria-hidden>
                <svg viewBox="0 0 108 108" className="absolute inset-0 -rotate-90">
                  <defs>
                    <linearGradient id="sum-g" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#ee6a7d" />
                      <stop offset="1" stopColor="#f2a15f" />
                    </linearGradient>
                  </defs>
                  <circle cx="54" cy="54" r="46" fill="none" stroke="#f1e3d3" strokeWidth="8" />
                  <circle cx="54" cy="54" r="46" fill="none" stroke="url(#sum-g)" strokeWidth="8" strokeLinecap="round" strokeDasharray={2 * Math.PI * 46} strokeDashoffset={2 * Math.PI * 46 * (1 - (data.maxScore ? Math.min(1, data.totalScore / data.maxScore) : 0))} style={{ transition: 'stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1)' }} />
                </svg>
                <div className="grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-rose-soft to-white text-rose-deep shadow-inner"><Heart size={34} fill="currentColor" /></div>
              </div>
              <h1 className="font-display text-[2.25rem] font-semibold leading-tight tracking-tight" data-testid="summary-heading" style={{ fontVariationSettings: "'opsz' 96" }}>{t('summary.heading')}</h1>
              <p className="text-lg text-muted">{couple ? t('summary.couple', { n: data.rounds.length }) : t('summary.family', { n: data.rounds.length })}</p>
              {couple ? (
                <p className="text-sm text-muted" data-testid="summary-score">{t('summary.score', { score: data.totalScore, max: data.maxScore })}</p>
              ) : (
                <div className="card mx-auto max-w-xs">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted">{t('summary.team')}</div>
                  <div className="font-display text-4xl font-bold text-rose-deep" data-testid="summary-score">{data.totalScore}<span className="text-lg font-medium text-muted"> / {data.maxScore}</span></div>
                </div>
              )}
            </section>

            <section aria-label={t('summary.rounds')} className="grid gap-3 fb-stagger">
              {data.rounds.map((r, i) => (
                <article key={r.puzzleId} className="card flex items-center gap-3.5 !p-2.5 !pe-4" data-testid="summary-round">
                  <div className="relative shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={r.thumbUrl} alt="" className="h-[68px] w-24 rounded-2xl object-cover" />
                    <span className="absolute -start-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-ink px-1.5 text-xs font-bold text-white shadow">{i + 1}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-semibold">{r.title ?? t('review.untitled')}</p>
                    <p className="text-sm text-muted">{formatMonthYear(r.truth, intl)}</p>
                  </div>
                  <span className="chip !px-3 !py-1.5 bg-rose-soft font-display text-lg font-bold text-rose-deep">{r.guess?.score.total ?? 0}</span>
                </article>
              ))}
            </section>

            {err && <ErrorBox message={err} />}
            <div className="grid gap-3">
              {couple && (
                <Link href="/new?mode=couple&swap=1" className="btn-primary !py-3.5 text-lg" data-testid="challenge-me">
                  <Heart size={20} aria-hidden /> {t('summary.challenge')}
                </Link>
              )}
              <button type="button" className={couple ? 'btn-secondary' : 'btn-primary'} onClick={replay} disabled={busy} data-testid="replay">
                <RotateCcw size={18} aria-hidden /> {t('summary.replay')}
              </button>
              {!couple && <Link href="/new?mode=family-shared" className="btn-secondary">{t('home.family.title')}</Link>}
              {/* sample games are throw-away; nothing of the user's to delete */}
              {!data.game.demo && (
                <button type="button" className="btn-ghost text-rose-deep" onClick={remove} disabled={busy} data-testid="delete-game">
                  <Trash2 size={18} aria-hidden /> {t('summary.delete')}
                </button>
              )}
              <Link href="/" className="btn-ghost">{t('common.home')}</Link>
            </div>
          </>
        )}
      </main>
    </>
  );
}
