'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ErrorBox, Spinner } from '@/components/Shell';
import { RevealView } from '@/components/RevealView';
import { useI18n } from '@/components/I18nProvider';
import { api, ApiClientError } from '@/lib/client/api';
import { useLoad } from '@/lib/client/hooks';
import type { RoundResult, SharedView } from '@/lib/client/types';

export default function RevealPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const { t, dir, errText } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { data, error, reload } = useLoad(async () => {
    try {
      const [result, view] = await Promise.all([api<RoundResult>(`/api/games/${gameId}/round/result`), api<SharedView>(`/api/games/${gameId}/round/current`)]);
      return { result, mode: view.game.mode };
    } catch (e) {
      // Not guessed yet → back to the clue (the server never reveals early).
      if (e instanceof ApiClientError && (e.code === 'not_revealed' || e.code === 'bad_state')) router.replace(`/play/${gameId}`);
      throw e;
    }
  }, [gameId]);

  async function next() {
    if (busy) return;
    setBusy(true);
    try {
      const v = await api<SharedView>(`/api/games/${gameId}/round/next`, { method: 'POST' });
      router.push(v.game.status === 'finished' ? `/play/${gameId}/summary` : `/play/${gameId}`);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight;
  if (error) return <main className="mx-auto w-full max-w-xl p-4"><ErrorBox message={errText(error)} onRetry={reload} /></main>;
  if (!data) return <main className="mx-auto w-full max-w-xl p-4"><Spinner /></main>;

  return (
    <main>
      <RevealView
        immersive
        result={data.result}
        team={data.mode === 'family_shared'}
        actions={
          <>
            {err && <div className="mb-2"><ErrorBox message={err} /></div>}
            <button type="button" className="btn-primary w-full !py-3.5 text-lg" onClick={next} disabled={busy} data-testid="next-memory">
              {data.result.index + 1 >= data.result.total ? t('reveal.finish') : t('reveal.next')} <Arrow size={20} aria-hidden />
            </button>
          </>
        }
      >
        <p className="text-center font-display text-lg italic text-muted">{t('reveal.talk')}</p>
      </RevealView>
    </main>
  );
}
