'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ErrorBox, GameScreen, Spinner } from '@/components/Shell';
import { MapWheelStage } from '@/components/MapWheelStage';
import { neutralMonthYear } from '@/components/DateWheels';
import { useI18n } from '@/components/I18nProvider';
import { api, safeStore } from '@/lib/client/api';
import { useLoad, usePersistedState } from '@/lib/client/hooks';
import type { Pin, SharedView } from '@/lib/client/types';
import type { MonthYear } from '@/lib/date';

type Draft = { pin: Pin | null; date: MonthYear };

/** THE primary answer screen: one world map, one pin, the two wheels anchored at the bottom of the map. */
export default function GuessPage() {
  const { gameId } = useParams<{ gameId: string }>();
  const router = useRouter();
  const { t, errText } = useI18n();
  const { data, error, reload } = useLoad(() => api<SharedView>(`/api/games/${gameId}/round/current`), [gameId]);

  useEffect(() => {
    if (!data) return;
    if (data.game.status === 'finished') router.replace(`/play/${gameId}/summary`);
    else if (data.game.status !== 'playing') router.replace(`/play/${gameId}/handoff`);
    else if (data.round && (data.guessed || data.round.state === 'revealed')) router.replace(`/play/${gameId}/reveal`);
  }, [data, gameId, router]);

  if (error) return <div className="p-4"><ErrorBox message={errText(error)} onRetry={reload} /></div>;
  if (!data?.round || data.guessed) return <Spinner label={t('play.loading')} />;
  return <GuessInner gameId={gameId} round={data.round} total={data.total} partners={data.game.partners} />;
}

function GuessInner({ gameId, round, total, partners }: { gameId: string; round: NonNullable<SharedView['round']>; total: number; partners: SharedView['game']['partners'] }) {
  const router = useRouter();
  const { t, errText } = useI18n();
  const key = `fb:guess:${gameId}:${round.index}`;
  const [draft, setDraft] = usePersistedState<Draft>(key, { pin: null, date: neutralMonthYear() });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sending = useRef(false);

  async function confirm() {
    if (!draft.pin || sending.current) return; // double-tap guard; the server is idempotent too
    sending.current = true;
    setBusy(true);
    try {
      await api(`/api/games/${gameId}/guess`, { body: { lat: draft.pin.lat, lng: draft.pin.lng, month: draft.date.month, year: draft.date.year } });
      safeStore.del(key);
      router.replace(`/play/${gameId}/reveal`);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
      sending.current = false;
    }
  }

  return (
    <GameScreen
      title={t('play.round', { n: round.index + 1, total })}
      right={t('play.clue', { n: round.stage })}
      progress={{ current: round.index, total }}
      back={{ href: `/play/${gameId}`, label: t('common.back') }}
    >
      {err && <div className="absolute inset-x-3 top-3 z-30"><ErrorBox message={err} /></div>}
      <MapWheelStage
        className="h-full w-full"
        mode="guess"
        pin={draft.pin}
        onPinChange={(pin) => setDraft({ ...draft, pin })}
        date={draft.date}
        onDateChange={(date) => setDraft({ ...draft, date })}
        onConfirm={confirm}
        confirmLabel={t('stage.confirmGuess')}
        title={t('stage.whenGuess')}
        busy={busy}
        clueUrl={round.clueUrl}
        clueStage={round.stage}
        partners={partners ? { profile: partners, roundIndex: round.index } : null}
      />
    </GameScreen>
  );
}
