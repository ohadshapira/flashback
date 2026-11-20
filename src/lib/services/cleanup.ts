import { db } from '../db';
import { retentionDays } from '../config';
import { destroyGame } from './games';
import { listGameDirs, deleteGameMedia } from '../storage';

export type CleanupReport = { gamesDeleted: number; orphanDirsDeleted: number; statesDeleted: number; tokensDeleted: number };

/** Deletes games past their retention window, orphaned media directories, and stale OAuth data. */
export function cleanupExpired(now = Date.now()): CleanupReport {
  const d = db();
  const expired = d.prepare("SELECT id FROM games WHERE expires_at <= ?").all(now) as { id: string }[];
  expired.forEach((g) => destroyGame(g.id));

  const known = new Set((d.prepare('SELECT id FROM games').all() as { id: string }[]).map((g) => g.id));
  let orphans = 0;
  for (const dir of listGameDirs()) {
    if (!known.has(dir)) {
      deleteGameMedia(dir);
      orphans++;
    }
  }
  const states = d.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(now).changes;
  const tokens = d.prepare('DELETE FROM google_tokens WHERE created_at <= ?').run(now - retentionDays() * 86_400_000).changes;
  return { gamesDeleted: expired.length, orphanDirsDeleted: orphans, statesDeleted: states, tokensDeleted: tokens };
}

const g = globalThis as unknown as { __fbLastCleanup?: number };

/** Opportunistic cleanup at most every 10 minutes (plus the cron route / `npm run cleanup`). */
export function maybeCleanup() {
  const now = Date.now();
  if (now - (g.__fbLastCleanup ?? 0) < 10 * 60_000) return;
  g.__fbLastCleanup = now;
  try {
    cleanupExpired(now);
  } catch (e) {
    console.error('[cleanup]', e);
  }
}
