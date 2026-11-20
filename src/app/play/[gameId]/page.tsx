'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, Lightbulb } from 'lucide-react';
import { ErrorBox, Spinner } from '@/components/Shell';
import { ClueStage } from '@/components/ClueView';
import { useI18n } from '@/components/I18nProvider';
import { api } from '@/lib/client/api';
import { useLoad } from '@/lib/client/hooks';
import type { SharedView } from '@/lib/client/types';

/** Clue screen: tightly cropped photo → "I know it" (map + wheels) or "Reveal more" (wider crop). */
export default function CluePage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const { t, errText } = useI18n();
  const { data, error, reload, setData } = useLoad(() => api<SharedView>(`/api/games/${gameId}/round/current`), [gameId]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    if (data.game.status === 'finished') router.replace(`/play/${gameId}/summary`);
    else if (data.game.status !== 'playing') router.replace(`/play/${gameId}/handoff`);
    else if (data.round && (data.guessed || data.round.state === 'revealed')) router.replace(`/play/${gameId}/reveal`);
  }, [data, gameId, router]);

  async function more() {
    if (busy) return;
    setBusy(true);
    try {
      setData(await api<SharedView>(`/api/games/${gameId}/round/more`, { method: 'POST' }));
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const round = data?.round;
  if (error) return <main className="mx-auto w-full max-w-xl p-4"><ErrorBox message={errText(error)} onRetry={reload} /></main>;
  if (!data || !round || data.guessed) return <main className="mx-auto w-full max-w-xl p-4"><Spinner label={t('play.loading')} /></main>;

  // Full-screen clue: the image fills the viewport, controls float on top of it.
  return (
    <main className="fixed inset-0" style={{ height: '100dvh' }}>
      <ClueStage
        url={round.clueUrl}
        stage={round.stage}
        stageCount={round.stageCount}
        top={
          <div className="mx-auto flex max-w-xl items-center justify-between text-sm font-semibold drop-shadow">
            <span data-testid="round-label">{t('play.round', { n: round.index + 1, total: data.total })}</span>
            <span className="text-white/85">{data.game.mode === 'couple' ? t('play.coupleNote') : t('play.teamNote')}</span>
          </div>
        }
        bottom={
          <>
            {err && <ErrorBox message={err} />}
            <div className="grid gap-3">
              <Link href={`/play/${gameId}/guess`} className="btn-primary !py-3.5 text-lg" data-testid="i-know-it">
                <Lightbulb size={20} aria-hidden /> {t('play.iKnow')}
              </Link>
              <button type="button" className="btn-secondary !bg-white/90" onClick={more} disabled={busy || round.stage >= round.stageCount} data-testid="reveal-more">
                <Eye size={18} aria-hidden /> {round.stage >= round.stageCount ? t('play.widest') : t('play.revealMore')}
              </button>
            </div>
          </>
        }
      />
    </main>
  );
}
