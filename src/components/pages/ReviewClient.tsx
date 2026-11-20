'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleAlert, ShieldCheck } from 'lucide-react';
import { BackLink, ErrorBox, PageHeading, PageShell, Spinner, Stepper } from '@/components/Shell';
import { useI18n } from '@/components/I18nProvider';
import { api } from '@/lib/client/api';
import { useLoad } from '@/lib/client/hooks';
import { formatMonthYear } from '@/lib/date';
import { LIMITS } from '@/lib/config';
import type { GameMeta, HostSetup } from '@/lib/client/types';

export function ReviewClient({ gameId }: { gameId: string }) {
  const { t, intl, errText } = useI18n();
  const router = useRouter();
  const { data, error, reload } = useLoad(() => api<HostSetup>(`/api/games/${gameId}/setup`), [gameId]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const g = await api<GameMeta>(`/api/games/${gameId}/start`, { method: 'POST' });
      router.push(g.mode === 'party' ? `/room/${g.joinCode}/lobby` : `/play/${g.id}/handoff`);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  const missing = data?.problems.find((p) => p.code === 'missing_answer')?.puzzleIds?.length ?? 0;
  const few = data?.problems.some((p) => p.code === 'too_few_photos');
  return (
    <PageShell wide>
      <BackLink href={`/new/photos?game=${gameId}`} />
      <Stepper current={4} />
      <PageHeading title={t('review.heading')} subtitle={t('review.subtitle')} testId="review-heading" />
      {error ? (
        <ErrorBox message={errText(error)} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <ol className="grid gap-3 sm:grid-cols-2 fb-stagger" data-testid="review-list">
            {data.puzzles.map((p, i) => (
              <li key={p.id} className="card flex items-center gap-3.5 !p-2.5 !pe-3" data-testid="review-item">
                <div className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.urls.thumb} alt="" className="h-[72px] w-24 rounded-2xl object-cover" />
                  <span className="absolute -start-1.5 -top-1.5 grid h-6 min-w-6 place-items-center rounded-full bg-ink px-1.5 text-xs font-bold text-white shadow">{i + 1}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-display text-base font-semibold">{p.title || t('review.untitled')}</p>
                  <p className={`mt-0.5 flex items-center gap-1 text-sm font-medium ${p.confirmed ? 'text-good' : 'text-warn'}`}>
                    {p.confirmed ? <CheckCircle2 size={14} aria-hidden /> : <CircleAlert size={14} aria-hidden />}
                    {p.answer ? formatMonthYear(p.answer, intl) : t('photos.needsAnswer')}
                  </p>
                  <div className="-ms-2 mt-0.5 flex gap-0.5">
                    <Link href={`/new/photo/${p.id}/details`} className="btn-ghost !min-h-8 !px-2 text-[13px]">{t('review.editAnswer')}</Link>
                    <Link href={`/new/photo/${p.id}/crop`} className="btn-ghost !min-h-8 !px-2 text-[13px]">{t('review.editCrop')}</Link>
                  </div>
                </div>
              </li>
            ))}
          </ol>

          {few && <p className="rounded-2xl bg-warn-soft p-3 text-warn" role="alert">{t('review.few', { min: LIMITS.minPhotos })}</p>}
          {missing > 0 && <p className="rounded-2xl bg-warn-soft p-3 text-warn" role="alert">{t('review.missing', { n: missing })}</p>}
          <p className="flex items-start gap-2 text-sm text-muted"><ShieldCheck size={18} className="mt-0.5 shrink-0" aria-hidden /> {t('review.retention', { days: data.game.retentionDays })}</p>
          {err && <ErrorBox message={err} />}
          <button type="button" className="btn-primary w-full !py-3.5 text-lg" disabled={busy || data.problems.length > 0} onClick={start} data-testid="start-game">
            {data.game.mode === 'party' ? t('review.startParty') : t('review.start')}
          </button>
        </div>
      )}
    </PageShell>
  );
}
