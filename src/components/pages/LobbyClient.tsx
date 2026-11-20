'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Crown, Play, Sparkles } from 'lucide-react';
import { ErrorBox, PageShell, Spinner } from '@/components/Shell';
import { useI18n } from '@/components/I18nProvider';
import { api, ApiClientError } from '@/lib/client/api';
import { useRoom } from '@/lib/client/hooks';

const AVATARS = [
  'linear-gradient(135deg,#ee6a7d,#f2a15f)',
  'linear-gradient(135deg,#46628a,#2f4668)',
  'linear-gradient(135deg,#f2a15f,#e3a23a)',
  'linear-gradient(135deg,#2f7a57,#5fa37f)',
  'linear-gradient(135deg,#a8324a,#d24b62)',
];

export function LobbyClient({ code }: { code: string }) {
  const { t, intl, errText } = useI18n();
  const router = useRouter();
  const { state, error, connected, refresh } = useRoom(code);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [url, setUrl] = useState('');

  useEffect(() => {
    const joinUrl = `${window.location.origin}/room/${code}`;
    setUrl(joinUrl);
    import('qrcode').then((Q) => Q.toDataURL(joinUrl, { margin: 1, width: 240, color: { dark: '#2b2622', light: '#fffdf9' } })).then(setQr).catch(() => undefined);
  }, [code]);

  useEffect(() => {
    if (error instanceof ApiClientError && error.code === 'not_joined') router.replace(`/room/${code}`);
  }, [error, code, router]);
  useEffect(() => {
    if (state && state.game.status !== 'lobby') router.replace(`/room/${code}/play`);
  }, [state, code, router]);

  async function start() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/rooms/${code}/start`, { method: 'POST' });
      await refresh();
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  const isHost = state?.me.role === 'host';
  // the owner runs the room (in the solo demo the owner also plays)
  const controls = !!state?.me.isOwner;
  const simNames = new Intl.ListFormat(intl, { style: 'long', type: 'conjunction' }).format((state?.players ?? []).filter((p) => p.simulated).map((p) => p.name));
  const players = state?.players ?? [];

  return (
    <PageShell>
      {!state ? (
        error && !(error instanceof ApiClientError && error.code === 'not_joined') ? <ErrorBox message={errText(error)} onRetry={refresh} /> : <Spinner />
      ) : (
        <div className="space-y-5">
          <div className="text-center">
            <h1 className="font-display text-[2rem] font-semibold tracking-tight">{t('room.lobby')}</h1>
            {state.game.title && <p className="text-muted">{state.game.title}</p>}
            <span className="chip mt-2 bg-blue-soft text-blue-deep" data-testid="style-chip">{t(state.game.playStyle === 'scratch' ? 'room.style.scratch' : 'room.style.classic')}</span>
          </div>

          {state.demo.solo && (
            <section className="card space-y-1.5 !border-rose/30 bg-rose-soft/50" data-testid="demo-lobby-note">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold"><Sparkles size={18} className="text-rose" aria-hidden /> {t('demo.lobby.title')}</h2>
              <p className="text-sm leading-relaxed text-ink/80">{t('demo.lobby.body', { names: simNames })}</p>
            </section>
          )}

          <section className="card relative space-y-3 overflow-hidden text-center">
            <div aria-hidden className="pointer-events-none absolute -end-10 -top-10 h-36 w-36 rounded-full bg-gradient-to-br from-rose/25 to-apricot/25 blur-2xl" />
            <p className="eyebrow">{t('room.code')}</p>
            <p className="sr-only" data-testid="room-code">{state.code}</p>
            <p aria-hidden className="flex justify-center gap-2" dir="ltr">
              {(state.code ?? code).split('').map((ch, i) => (
                <span key={i} className="grid h-14 w-11 place-items-center rounded-2xl bg-white font-mono text-3xl font-bold text-rose-deep shadow-(--shadow-soft) ring-1 ring-line">{ch}</span>
              ))}
            </p>
            {qr && (
              <div className="mx-auto w-fit rounded-3xl border border-line bg-white p-3 shadow-(--shadow-soft)">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr} alt={t('room.scan')} width={200} height={200} data-testid="room-qr" />
              </div>
            )}
            <p className="text-sm text-muted">{t('room.scan')}</p>
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                } catch {
                  /* clipboard unavailable */
                }
              }}
              data-testid="copy-link"
            >
              {copied ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />} {copied ? t('common.copied') : t('room.share')}
            </button>
            <p className="break-all text-xs text-muted" dir="ltr" data-testid="room-link">{url}</p>
          </section>

          <section className="card space-y-2" aria-live="polite">
            <h2 className="font-semibold">{t('room.players', { n: players.length })}</h2>
            {players.length === 0 ? (
              <p className="text-muted">{t('room.noPlayers')}</p>
            ) : (
              <ul className="grid gap-2" data-testid="player-list">
                {players.map((p) => (
                  <li key={p.id} className="fb-pop flex items-center gap-3 rounded-2xl bg-white px-3 py-2 ring-1 ring-line" data-testid="player-item">
                    <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white shadow" style={{ backgroundImage: AVATARS[[...p.name].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATARS.length] }}>
                      {([...p.name][0] ?? '?').toUpperCase()}
                    </span>
                    <span className="font-medium">{p.name}</span>
                    {p.id === state.me.participantId && <span className="chip bg-blue-soft text-blue-deep">{t('common.you')}</span>}
                    {p.simulated && <span className="chip bg-warn-soft text-warn" data-testid="sim-chip">{t('demo.sim')}</span>}
                  </li>
                ))}
              </ul>
            )}
            {isHost && <p className="flex items-center gap-1 text-sm text-muted"><Crown size={14} aria-hidden /> {t('room.hostBadge')}</p>}
          </section>

          {!connected && <p className="text-center text-sm font-semibold text-warn">{t('room.reconnecting')}</p>}
          {err && <ErrorBox message={err} />}
          {controls ? (
            <>
              <button type="button" className="btn-primary w-full !py-3.5 text-lg" disabled={busy || players.length < 1} onClick={start} data-testid="start-room">
                <Play size={20} aria-hidden /> {t('room.start')}
              </button>
              {players.length < 1 && <p className="text-center text-sm text-muted">{t('room.needPlayer')}</p>}
            </>
          ) : (
            <p className="text-center font-medium text-muted" data-testid="wait-host">{t('room.waitHost')}</p>
          )}
        </div>
      )}
    </PageShell>
  );
}
