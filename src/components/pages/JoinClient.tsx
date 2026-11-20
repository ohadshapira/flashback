'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PartyPopper } from 'lucide-react';
import { ErrorBox, PageShell, Spinner } from '@/components/Shell';
import { useI18n } from '@/components/I18nProvider';
import { api, ApiClientError } from '@/lib/client/api';
import { LIMITS } from '@/lib/config';

type Info = { code: string; title: string | null; status: string; players: number; joinable: boolean };

export function JoinClient({ code }: { code: string }) {
  const { t, errText } = useI18n();
  const router = useRouter();
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      // Already in this room (e.g. the host, or a refresh)? Go straight to it.
      try {
        const s = await api<{ game: { status: string } }>(`/api/rooms/${code}/state`);
        router.replace(s.game.status === 'lobby' ? `/room/${code}/lobby` : `/room/${code}/play`);
        return;
      } catch {
        /* not joined yet */
      }
      try {
        setInfo(await api<Info>(`/api/rooms/${code}/info`));
      } catch (e) {
        setError(e instanceof ApiClientError && e.code === 'not_found' ? t('room.notFound') : errText(e));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function join(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/rooms/${code}/join`, { body: { name } });
      router.push(info?.status === 'playing' ? `/room/${code}/play` : `/room/${code}/lobby`);
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <div className="card mx-auto mt-4 max-w-sm space-y-5 !p-6 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-apricot to-[#e3a23a] text-white shadow-lg"><PartyPopper size={30} aria-hidden /></div>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">{t('room.joinHeading')}</h1>
        <p className="inline-block rounded-2xl bg-white px-4 py-2 font-mono text-3xl font-bold tracking-[0.3em] text-rose-deep ring-1 ring-line" dir="ltr" data-testid="join-room-code">{code}</p>
        {error && <ErrorBox message={error} />}
        {!info && !error && <Spinner />}
        {info && !info.joinable && <ErrorBox message={info.players >= LIMITS.maxPartyPlayers ? t('room.full') : t('room.closed')} />}
        {info?.joinable && (
          <form onSubmit={join} className="space-y-3 text-start">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-muted">{t('room.nickname')}</span>
              <input className="field text-lg" value={name} maxLength={LIMITS.nameMax} autoComplete="nickname" autoFocus onChange={(e) => setName(e.target.value)} data-testid="nickname-input" />
            </label>
            <button type="submit" className="btn-primary w-full !py-3.5 text-lg" disabled={busy || !name.trim()} data-testid="join-room">{t('room.join')}</button>
          </form>
        )}
      </div>
    </PageShell>
  );
}
