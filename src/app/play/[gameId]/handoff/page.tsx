'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { EyeOff, Smartphone } from 'lucide-react';
import { AppHeader, ErrorBox, Spinner } from '@/components/Shell';
import { useI18n } from '@/components/I18nProvider';
import { api } from '@/lib/client/api';
import { useLoad } from '@/lib/client/hooks';
import { roundJobs } from '@/lib/partners';
import type { SharedView } from '@/lib/client/types';

/** Hides every host control and answer, then hands the device to the player. */
export default function HandoffPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const { t, errText } = useI18n();
  const { data, error, reload } = useLoad(() => api<SharedView>(`/api/games/${gameId}/round/current`), [gameId]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (data?.game.status === 'finished') router.replace(`/play/${gameId}/summary`);
  }, [data, gameId, router]);

  async function begin() {
    if (busy) return;
    setBusy(true);
    try {
      await api(`/api/games/${gameId}/play`, { method: 'POST' });
      router.push(`/play/${gameId}`);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  const couple = data?.game.mode === 'couple';
  const partners = data?.game.partners ?? null;
  const first = partners ? roundJobs(partners, 0) : null;
  return (
    <>
      <AppHeader />
      <main className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 pb-10 pt-10 text-center">
        {error ? (
          <ErrorBox message={errText(error)} onRetry={reload} />
        ) : !data ? (
          <Spinner />
        ) : data.game.status === 'draft' ? (
          <Link className="btn-primary" href={`/new/review?game=${gameId}`}>{t('review.start')}</Link>
        ) : (
          <>
            <div className="relative grid h-36 w-36 place-items-center rounded-full bg-rose-soft text-rose-deep">
              <Smartphone size={64} aria-hidden />
              <span className="absolute -bottom-1 -end-1 grid h-12 w-12 place-items-center rounded-full bg-ink text-white"><EyeOff size={22} aria-hidden /></span>
            </div>
            <h1 className="font-display text-4xl font-semibold" data-testid="handoff-title">{t('handoff.title')}</h1>
            {first ? (
              <p className="max-w-sm text-lg leading-relaxed text-muted" data-testid="handoff-text">{t('partners.handoff', { n: data.total, map: first.map, wheels: first.wheels })}</p>
            ) : (
              <>
                <p className="max-w-sm text-lg text-muted">{couple ? t('handoff.couple') : t('handoff.family')}</p>
                <p className="chip bg-blue-soft text-blue-deep">{t('handoff.photos', { n: data.total })}</p>
              </>
            )}
            {err && <ErrorBox message={err} />}
            <button type="button" className="btn-primary min-w-56 !py-3.5 text-lg" onClick={begin} disabled={busy} data-testid="handoff-ready">
              {t('handoff.ready')}
            </button>
          </>
        )}
      </main>
    </>
  );
}
