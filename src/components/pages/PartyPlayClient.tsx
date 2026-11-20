'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, MapPinned, Sparkles, Trophy } from 'lucide-react';
import { AppHeader, ErrorBox, GameScreen, Spinner } from '@/components/Shell';
import { ClueStage, ClueView } from '@/components/ClueView';
import { Leaderboard } from '@/components/Leaderboard';
import { ScratchCard } from '@/components/ScratchCard';
import { MapWheelStage } from '@/components/MapWheelStage';
import { neutralMonthYear } from '@/components/DateWheels';
import { RevealView } from '@/components/RevealView';
import { useI18n } from '@/components/I18nProvider';
import { api, ApiClientError, safeStore } from '@/lib/client/api';
import { useCountdown, usePersistedState, useRoom } from '@/lib/client/hooks';
import type { Pin, RoomState } from '@/lib/client/types';
import type { MonthYear } from '@/lib/date';
import { formatDistance } from '@/lib/geo';

type Draft = { pin: Pin | null; date: MonthYear };

/**
 * One screen for every party state. All timing, stage and reveal decisions come from the server's
 * /state (kept fresh by SSE hints); this component only renders them and submits one private guess per round.
 */
export function PartyPlayClient({ code }: { code: string }) {
  const { errText } = useI18n();
  const router = useRouter();
  const { state, error, connected, refresh, serverNow } = useRoom(code);

  useEffect(() => {
    if (error instanceof ApiClientError && error.code === 'not_joined') router.replace(`/room/${code}`);
  }, [error, code, router]);
  useEffect(() => {
    if (state?.game.status === 'lobby') router.replace(`/room/${code}/lobby`);
  }, [state, code, router]);

  if (!state) {
    return (
      <>
        <AppHeader />
        <main className="mx-auto max-w-xl px-4">{error && !(error instanceof ApiClientError && error.code === 'not_joined') ? <ErrorBox message={errText(error)} onRetry={refresh} /> : <Spinner />}</main>
      </>
    );
  }
  if (state.game.status === 'finished') return <Finished state={state} />;
  if (state.game.roundState === 'revealed' && state.result) return <RoundReveal state={state} code={code} refresh={refresh} connected={connected} />;
  if (state.me.role === 'host') return <HostLive state={state} serverNow={serverNow} connected={connected} />;
  return <PlayerLive state={state} code={code} serverNow={serverNow} refresh={refresh} connected={connected} />;
}

/* ----------------------------------------------------------------- pieces */

function TimerBar({ state, serverNow }: { state: RoomState; serverNow: () => number }) {
  const { t } = useI18n();
  const left = useCountdown(state.game.deadline, serverNow);
  const pct = Math.min(100, (left / state.game.roundSeconds) * 100);
  return (
    <div className="flex items-center gap-2" role="timer" aria-live="off">
      <span className="h-2 w-24 overflow-hidden rounded-full bg-line"><span className={`block h-full rounded-full transition-[width] duration-300 ${left <= 10 ? 'bg-rose' : 'bg-blue'}`} style={{ width: `${pct}%` }} /></span>
      <span className="min-w-12 whitespace-nowrap text-end font-mono text-base font-bold tabular-nums" data-testid="countdown">{t('room.seconds', { s: left })}</span>
    </div>
  );
}

function HostLive({ state, serverNow, connected }: { state: RoomState; serverNow: () => number; connected: boolean }) {
  const { t } = useI18n();
  return (
    <GameScreen title={t('play.round', { n: state.game.currentRound + 1, total: state.game.total })} right={<TimerBar state={state} serverNow={serverNow} />}>
      <div className="mx-auto flex h-full max-w-xl flex-col gap-4 overflow-y-auto px-4 py-4">
        <p className="rounded-2xl bg-blue-soft p-3 text-center font-medium text-blue-deep" data-testid="host-console">{t('room.hostConsole')}</p>
        {state.clue && <ClueView url={state.clue.url} stage={state.clue.stage} />}
        {state.game.playStyle === 'scratch' && <p className="rounded-2xl bg-white p-3 text-center text-sm text-muted ring-1 ring-line" data-testid="host-scratch-note">{t('room.hostScratch')}</p>}
        <div className="card flex items-center justify-between">
          <span className="font-semibold" data-testid="answered-count">{t('room.answered', { n: state.answeredCount, m: state.players.length })}</span>
          <span className="flex gap-1">{state.players.map((p) => <span key={p.id} className={`h-3 w-3 rounded-full ${p.answered ? 'bg-good' : 'bg-line'}`} title={p.name} />)}</span>
        </div>
        {!connected && <p className="text-center text-sm font-semibold text-warn">{t('room.reconnecting')}</p>}
      </div>
    </GameScreen>
  );
}

function PlayerLive({ state, code, serverNow, refresh, connected }: { state: RoomState; code: string; serverNow: () => number; refresh: () => Promise<void>; connected: boolean }) {
  const { t, errText } = useI18n();
  const round = state.game.currentRound;
  const key = `fb:party:${code}:${round}`;
  const [draft, setDraft] = usePersistedState<Draft>(key, { pin: null, date: neutralMonthYear() });
  const [tab, setTab] = useState<'clue' | 'guess'>('clue');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const sending = useRef(false);

  async function confirm() {
    if (!draft.pin || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      await api(`/api/rooms/${code}/guess`, { body: { lat: draft.pin.lat, lng: draft.pin.lng, month: draft.date.month, year: draft.date.year } });
      safeStore.del(key);
      await refresh();
    } catch (e) {
      if (!(e instanceof ApiClientError && e.code === 'round_closed')) setErr(errText(e));
      await refresh();
    } finally {
      setBusy(false);
      sending.current = false;
    }
  }

  const submitted = state.me.submitted;
  const title = t('play.round', { n: round + 1, total: state.game.total });
  const demoNote = state.demo.solo ? (
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold" data-testid="demo-live-note">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 ring-1 ring-white/20"><Sparkles size={14} aria-hidden /> {t('demo.live.chip')}</span>
      <span className="rounded-full bg-black/55 px-3 py-1.5 ring-1 ring-white/20">{t('room.answered', { n: state.answeredCount, m: state.players.length })}</span>
    </div>
  ) : undefined;
  const toGuess = (
    <button type="button" className="btn-primary w-full !py-3.5 text-lg" onClick={() => setTab('guess')} data-testid="party-to-guess">
      <MapPinned size={20} aria-hidden /> {t('room.tabGuess')}
    </button>
  );

  return (
    <GameScreen title={title} right={<TimerBar state={state} serverNow={serverNow} />}>
      {err && <div className="absolute inset-x-3 top-3 z-40"><ErrorBox message={err} /></div>}
      {!connected && <p className="absolute inset-x-0 top-1 z-40 text-center text-xs font-semibold text-warn">{t('room.reconnecting')}</p>}
      {submitted ? (
        <div className="mx-auto flex h-full max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-good-soft text-good"><Trophy size={36} aria-hidden /></div>
          <h1 className="font-display text-3xl font-semibold" data-testid="submitted-banner">{t('room.submitted')}</h1>
          <p className="text-muted">{t('room.waitOthers')}</p>
          <p className="chip bg-blue-soft text-blue-deep" data-testid="answered-count">{t('room.answered', { n: state.answeredCount, m: state.players.length })}</p>
        </div>
      ) : tab === 'clue' ? (
        <div className="relative h-full">
          {state.scratch ? (
            <ScratchCard code={code} scratch={state.scratch} locked={false} top={demoNote} bottom={toGuess} />
          ) : (
            state.clue && <ClueStage url={state.clue.url} stage={state.clue.stage} top={demoNote} bottom={toGuess} />
          )}
        </div>
      ) : (
        <>
          <button type="button" className="btn-secondary absolute start-1/2 top-3 z-30 -translate-x-1/2 !min-h-10 text-sm rtl:translate-x-1/2" onClick={() => setTab('clue')} data-testid="party-to-clue">
            <Eye size={16} aria-hidden /> {t('room.tabClue')}
          </button>
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
            clueUrl={state.clue?.url}
          />
        </>
      )}
    </GameScreen>
  );
}

function RoundReveal({ state, code, refresh, connected }: { state: RoomState; code: string; refresh: () => Promise<void>; connected: boolean }) {
  const { t, errText } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isHost = state.me.role === 'host';
  const controls = state.me.isOwner; // the room's owner starts every round (in the solo demo the owner also plays)
  const result = state.result!;
  const points = Object.fromEntries(result.guesses.map((g) => [g.participantId, g.score.total]));

  async function next() {
    setBusy(true);
    try {
      await api(`/api/rooms/${code}/next`, { method: 'POST' });
      await refresh();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl space-y-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <h1 className="font-display text-2xl font-semibold" data-testid="party-reveal-heading">
          {t('room.roundOver')} <span className="text-base font-medium text-muted">· {t('play.round', { n: result.index + 1, total: result.total })}</span>
        </h1>
        <RevealView result={result} hideGuess={isHost} />
        {state.demo.solo && <OthersCard state={state} />}
        <Leaderboard entries={state.leaderboard} meId={state.me.participantId} roundPoints={points} />
        {!connected && <p className="text-center text-sm font-semibold text-warn">{t('room.reconnecting')}</p>}
        {err && <ErrorBox message={err} />}
        {controls ? (
          <button type="button" className="btn-primary w-full !py-3.5 text-lg" onClick={next} disabled={busy} data-testid="party-next">
            {state.game.isLast ? t('reveal.finish') : t('room.next')}
          </button>
        ) : (
          <p className="text-center font-medium text-muted" data-testid="wait-host-next">{t('room.waitHost')}</p>
        )}
        <p className="text-center text-xs text-muted">{t('room.hostAway')}</p>
      </main>
    </>
  );
}

/** Solo demo only: spells out what the simulated players did this round, so the demo explains itself. */
function OthersCard({ state }: { state: RoomState }) {
  const { t, intl } = useI18n();
  const others = state.result!.guesses.filter((g) => g.participantId !== state.me.participantId).sort((a, b) => b.score.total - a.score.total);
  const diffText = (months: number) => (months === 0 ? t('reveal.exact') : months === 1 ? t('reveal.oneOff') : t('reveal.off', { n: months }));
  return (
    <section className="card space-y-3" data-testid="demo-others">
      <div className="space-y-1">
        <h2 className="font-display text-xl font-semibold">{t('demo.others.title')}</h2>
        <p className="text-sm leading-relaxed text-muted">{t('demo.others.note')}</p>
      </div>
      <ul className="grid gap-2">
        {others.map((g) => (
          <li key={g.participantId} className="flex items-start gap-3 rounded-2xl bg-white px-3 py-2.5 ring-1 ring-line" data-testid="demo-other-row">
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="flex flex-wrap items-center gap-2 font-semibold">
                {g.name} <span className="chip bg-warn-soft text-warn">{t('demo.sim')}</span>
              </p>
              <p className="text-sm text-muted">
                {g.scratchPct !== null
                  ? t('demo.others.lineScratch', { distance: formatDistance(g.distanceKm, intl), diff: diffText(g.monthDiff), pct: g.scratchPct })
                  : t('demo.others.line', { distance: formatDistance(g.distanceKm, intl), diff: diffText(g.monthDiff), stage: g.stage })}
              </p>
            </div>
            <span className="font-display text-lg font-bold tabular-nums text-good">+{g.score.total}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Scratch games: every player's score per round, and how much of each photo they scratched. */
function ScoreTable({ state }: { state: RoomState }) {
  const { t } = useI18n();
  const rows = state.scoreboard!;
  const n = rows[0]?.rounds.length ?? 0;
  return (
    <section className="card space-y-3 overflow-x-auto" data-testid="score-table">
      <h2 className="font-display text-xl font-semibold">{t('scoreboard.title')}</h2>
      <table className="w-full min-w-[20rem] border-separate border-spacing-y-1.5 text-sm">
        <thead>
          <tr className="text-xs text-muted">
            <th className="text-start font-semibold" />
            {Array.from({ length: n }, (_, i) => (
              <th key={i} className="px-1 text-center font-semibold">{t('scoreboard.round', { n: i + 1 })}</th>
            ))}
            <th className="px-1 text-center font-semibold">{t('scoreboard.total')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.participantId} className={r.participantId === state.me.participantId ? 'bg-rose-soft' : 'bg-ivory'} data-testid="score-row">
              <td className="rounded-s-2xl px-3 py-2 font-semibold">
                {r.name}
                {r.simulated && <span className="chip ms-2 bg-warn-soft align-middle text-warn">{t('demo.sim')}</span>}
              </td>
              {r.rounds.map((c, i) => (
                <td key={i} className="px-1 py-2 text-center">
                  <div className="font-display text-base font-bold tabular-nums">{c ? c.score : '—'}</div>
                  {c && c.scratchPct !== null && <div className="text-[11px] text-muted">{t('scoreboard.scratched', { pct: c.scratchPct })}</div>}
                </td>
              ))}
              <td className="rounded-e-2xl px-2 py-2 text-center font-display text-lg font-bold tabular-nums text-rose-deep" data-testid="score-row-total">{r.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted">{t('scoreboard.note')}</p>
    </section>
  );
}

function Finished({ state }: { state: RoomState }) {
  const { t } = useI18n();
  const winner = state.leaderboard[0];
  return (
    <>
      <AppHeader />
      <main className="mx-auto w-full max-w-xl space-y-5 px-4 pb-10 pt-4">
        <section className="space-y-2 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-warn-soft text-warn"><Trophy size={30} aria-hidden /></div>
          <h1 className="font-display text-3xl font-semibold" data-testid="party-final">{t('room.final')}</h1>
          {winner && winner.score > 0 && <p className="text-lg text-muted" data-testid="party-winner">{t('room.winner', { name: winner.name })}</p>}
        </section>
        <Leaderboard entries={state.leaderboard} meId={state.me.participantId} />
        {state.scoreboard && state.game.playStyle === 'scratch' && <ScoreTable state={state} />}
        {state.demo.solo && <p className="card text-sm leading-relaxed text-muted" data-testid="demo-final-note">{t('demo.final.note')}</p>}
        <Link href="/" className="btn-secondary w-full">{t('common.home')}</Link>
      </main>
    </>
  );
}
