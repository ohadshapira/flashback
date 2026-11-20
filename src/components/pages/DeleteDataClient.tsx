'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { BackLink, ErrorBox, PageShell, Spinner } from '@/components/Shell';
import { useI18n } from '@/components/I18nProvider';
import { api } from '@/lib/client/api';
import { useLoad } from '@/lib/client/hooks';
import type { GameMeta } from '@/lib/client/types';

export function DeleteDataClient() {
  const { t, intl, errText } = useI18n();
  const { data, error, reload } = useLoad(() => api<{ games: GameMeta[] }>('/api/games'), []);
  const [note, setNote] = useState<string | null>(null);

  async function remove(id: string) {
    if (!window.confirm(t('summary.confirmDelete'))) return;
    await api(`/api/games/${id}`, { method: 'DELETE' });
    setNote(t('summary.deleted'));
    await reload();
  }

  return (
    <PageShell>
      <BackLink href="/privacy" />
      <h1 className="mb-2 font-display text-3xl font-semibold">{t('help.title')}</h1>
      <p className="mb-5 text-muted">{t('help.body')}</p>
      {error ? (
        <ErrorBox message={errText(error)} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {note && <p className="rounded-2xl bg-good-soft p-3 font-medium text-good" role="status" data-testid="delete-note">{note}</p>}
          {data.games.length === 0 ? (
            <p className="card text-center text-muted" data-testid="no-games">{t('help.none')}</p>
          ) : (
            <ul className="grid gap-3" data-testid="my-games">
              {data.games.map((g) => (
                <li key={g.id} className="card flex items-center gap-3 !p-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{g.title || t(`home.${g.mode === 'family_shared' ? 'family' : g.mode}.title` as 'home.couple.title')}</p>
                    <p className="text-sm text-muted">{g.photoCount} · {t('help.expires', { date: new Date(g.expiresAt).toLocaleDateString(intl) })}</p>
                  </div>
                  <button type="button" className="btn-secondary !px-3 text-rose-deep" onClick={() => remove(g.id)} aria-label={t('common.delete')} data-testid="delete-my-game"><Trash2 size={18} /></button>
                </li>
              ))}
            </ul>
          )}
          <section className="card space-y-2">
            <h2 className="font-semibold">{t('help.google')}</h2>
            <p className="text-sm text-muted">{t('help.googleBody')}</p>
            <button type="button" className="btn-secondary" onClick={async () => { await api('/api/google-photos/config', { method: 'DELETE' }); setNote(t('help.disconnected')); }}>
              {t('help.googleDisconnect')}
            </button>
          </section>
        </div>
      )}
    </PageShell>
  );
}
