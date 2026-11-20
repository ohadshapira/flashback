'use client';

import { Crown } from 'lucide-react';
import { useI18n } from './I18nProvider';

export type Entry = { participantId: string; name: string; score: number; rank: number; simulated?: boolean };

export function Leaderboard({ entries, meId, roundPoints }: { entries: Entry[]; meId?: string; roundPoints?: Record<string, number> }) {
  const { t } = useI18n();
  return (
    <section className="card space-y-2" data-testid="leaderboard">
      <h2 className="font-display text-xl font-semibold">{t('room.leaderboard')}</h2>
      <ol className="grid gap-2">
        {entries.map((e) => (
          <li key={e.participantId} className={`flex items-center gap-3 rounded-2xl px-3 py-2 ${e.participantId === meId ? 'bg-rose-soft' : 'bg-ivory'}`} data-testid="leaderboard-row">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-paper text-sm font-bold">{e.rank === 1 && e.score > 0 ? <Crown size={16} className="text-warn" aria-hidden /> : e.rank}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">
              {e.name}
              {e.simulated && <span className="chip ms-2 bg-warn-soft align-middle text-warn">{t('demo.sim')}</span>}
            </span>
            {roundPoints && roundPoints[e.participantId] !== undefined && <span className="text-sm font-semibold text-good">+{roundPoints[e.participantId]}</span>}
            <span className="font-display text-lg font-bold tabular-nums" data-testid="leaderboard-score">{t('room.points', { n: e.score })}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
