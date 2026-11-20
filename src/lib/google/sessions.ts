import { db } from '../db';
import { ApiError } from '../errors';
import { LIMITS } from '../config';
import { addPhoto } from '../services/games';
import { assertOwner, getGame, puzzleCount } from '../services/shared';
import { discardToken, getAccessToken, hasValidToken } from './oauth';
import { createSession, deleteSession, downloadImage, getSession, listMediaItems } from './picker';
import { googleConfig } from './config';

type SessionRow = {
  id: string;
  sid: string;
  game_id: string;
  picker_uri: string;
  expire_time: number;
  poll_interval_ms: number;
  timeout_at: number;
  max_items: number;
  media_items_set: 0 | 1;
  import_state: 'idle' | 'importing' | 'done' | 'failed' | 'cancelled';
  import_total: number;
  import_done: number;
  import_errors: string;
  created_at: number;
};

export type ImportIssue = { code: string; name?: string };

const lastPoll = new Map<string, number>(); // session id → last real call to Google (honours pollInterval)

function loadRow(sid: string, id: string): SessionRow {
  const r = db().prepare('SELECT * FROM google_sessions WHERE id = ? AND sid = ?').get(id, sid) as SessionRow | undefined;
  if (!r) throw new ApiError(404, 'not_found');
  return r;
}

/** Google's session lives 1h-ish; `/autoclose` makes the Photos tab close itself when the user taps Done. */
const openUri = (uri: string) => (googleConfig().mock ? uri : `${uri.replace(/\/$/, '')}/autoclose`);

function view(r: SessionRow) {
  const now = Date.now();
  let state: 'waiting' | 'ready' | 'importing' | 'done' | 'failed' | 'expired' | 'cancelled' = 'waiting';
  if (r.import_state === 'importing') state = 'importing';
  else if (r.import_state === 'done') state = 'done';
  else if (r.import_state === 'failed') state = 'failed';
  else if (r.import_state === 'cancelled') state = 'cancelled';
  else if (r.media_items_set) state = 'ready';
  else if (now >= Math.min(r.expire_time, r.timeout_at)) state = 'expired';
  return {
    id: r.id,
    gameId: r.game_id,
    pickerUri: openUri(r.picker_uri),
    state,
    pollIntervalMs: r.poll_interval_ms,
    progress: { total: r.import_total, done: r.import_done },
    issues: JSON.parse(r.import_errors) as ImportIssue[],
    mock: googleConfig().mock,
  };
}

export async function createPickerSession(sid: string, gameId: string) {
  const game = getGame(gameId);
  assertOwner(game, sid);
  if (game.status !== 'draft') throw new ApiError(409, 'game_locked');
  const remaining = LIMITS.maxPhotos - puzzleCount(game.id);
  if (remaining < 1) throw new ApiError(409, 'too_many_photos');
  if (!hasValidToken(sid)) throw new ApiError(401, 'google_reauth');

  // Drop any earlier unfinished session for this game so we never leak Picker sessions.
  await cancelAllForGame(gameId, sid).catch(() => undefined);

  const token = getAccessToken(sid);
  const s = await createSession(token, remaining);
  const now = Date.now();
  db()
    .prepare(
      `INSERT INTO google_sessions (id, sid, game_id, picker_uri, expire_time, poll_interval_ms, timeout_at, max_items, media_items_set, created_at)
       VALUES (?,?,?,?,?,?,?,?,0,?)`,
    )
    .run(s.id, sid, gameId, s.pickerUri, s.expireTimeMs, s.pollIntervalMs, Math.min(s.expireTimeMs, now + s.timeoutMs), remaining, now);
  return view(loadRow(sid, s.id));
}

/** Resume after a reload: the newest live session for this game, if any. */
export function activeSessionForGame(sid: string, gameId: string) {
  const r = db().prepare("SELECT * FROM google_sessions WHERE sid = ? AND game_id = ? AND import_state != 'cancelled' ORDER BY created_at DESC LIMIT 1").get(sid, gameId) as SessionRow | undefined;
  return r ? view(r) : null;
}

/** Polls Google at most once per server-provided pollInterval; in between, returns the cached state. */
export async function sessionStatus(sid: string, id: string) {
  let r = loadRow(sid, id);
  if (r.import_state === 'idle' && !r.media_items_set) {
    const now = Date.now();
    const last = lastPoll.get(id) ?? 0;
    if (now < Math.min(r.expire_time, r.timeout_at) && now - last >= r.poll_interval_ms) {
      lastPoll.set(id, now);
      try {
        const s = await getSession(getAccessToken(sid), id);
        db()
          .prepare('UPDATE google_sessions SET media_items_set = ?, poll_interval_ms = ?, timeout_at = ? WHERE id = ?')
          .run(s.mediaItemsSet ? 1 : 0, s.pollIntervalMs, Math.min(s.expireTimeMs, now + s.timeoutMs), id);
      } catch (e) {
        if (e instanceof ApiError && (e.code === 'google_forbidden' || e.code === 'google_not_found')) {
          // The session expired on Google's side.
          db().prepare('UPDATE google_sessions SET timeout_at = 0 WHERE id = ?').run(id);
        } else throw e;
      }
      r = loadRow(sid, id);
    }
  }
  return view(r);
}

function setProgress(id: string, patch: Partial<Pick<SessionRow, 'import_state' | 'import_total' | 'import_done'>> & { errors?: ImportIssue[] }) {
  const d = db();
  if (patch.import_state) d.prepare('UPDATE google_sessions SET import_state = ? WHERE id = ?').run(patch.import_state, id);
  if (patch.import_total !== undefined) d.prepare('UPDATE google_sessions SET import_total = ? WHERE id = ?').run(patch.import_total, id);
  if (patch.import_done !== undefined) d.prepare('UPDATE google_sessions SET import_done = ? WHERE id = ?').run(patch.import_done, id);
  if (patch.errors) d.prepare('UPDATE google_sessions SET import_errors = ? WHERE id = ?').run(JSON.stringify(patch.errors), id);
}

/** Kicks off the import in the background and returns immediately; the UI polls /status for progress. */
export async function startImport(sid: string, id: string) {
  let r = loadRow(sid, id);
  if (r.import_state === 'importing' || r.import_state === 'done') return view(r);
  const token = getAccessToken(sid);
  if (!r.media_items_set) {
    const s = await getSession(token, id);
    if (!s.mediaItemsSet) throw new ApiError(409, 'google_precondition', 'Finish choosing photos in the Google Photos tab first');
    db().prepare('UPDATE google_sessions SET media_items_set = 1 WHERE id = ?').run(id);
  }
  setProgress(id, { import_state: 'importing', import_done: 0, import_total: 0, errors: [] });
  r = loadRow(sid, id);
  void runImport(sid, id, token).catch((e) => {
    console.error('[google import]', e);
    setProgress(id, { import_state: 'failed', errors: [{ code: e instanceof ApiError ? e.code : 'google_error' }] });
  });
  return view(r);
}

async function runImport(sid: string, id: string, token: string) {
  const row = loadRow(sid, id);
  const game = getGame(row.game_id);
  const items = await listMediaItems(token, id);
  const issues: ImportIssue[] = [];
  const photos = items.filter((i) => {
    if (i.type === 'VIDEO') {
      issues.push({ code: 'video_skipped', name: i.mediaFile?.filename });
      return false;
    }
    return true;
  });
  const room = Math.max(0, LIMITS.maxPhotos - puzzleCount(game.id));
  const wanted = photos.slice(0, room);
  if (photos.length > room) issues.push({ code: 'item_limit', name: String(photos.length - room) });
  setProgress(id, { import_total: wanted.length, errors: issues });

  let done = 0;
  let ok = 0;
  for (const item of wanted) {
    const name = item.mediaFile?.filename;
    try {
      if (!item.mediaFile?.baseUrl) throw new ApiError(502, 'google_download_failed');
      const buffer = await downloadImage(token, item.mediaFile.baseUrl);
      await addPhoto(getGame(game.id), sid, { buffer, source: 'google_photos', sourceId: item.id, sourceCreateTime: item.createTime ?? null });
      ok++;
    } catch (e) {
      issues.push({ code: e instanceof ApiError ? e.code : 'import_failed', name });
      if (e instanceof ApiError && e.code === 'google_reauth') break;
    }
    done++;
    setProgress(id, { import_done: done, errors: issues });
  }

  // Cleanup per the Picker lifecycle: delete the session at Google and drop the short-lived token.
  await deleteSession(token, id).catch(() => undefined);
  discardToken(sid);
  setProgress(id, { import_state: ok === 0 ? 'failed' : 'done', errors: issues });
}

export async function cancelSession(sid: string, id: string) {
  const r = loadRow(sid, id);
  try {
    await deleteSession(getAccessToken(sid), r.id);
  } catch {
    /* already gone or token expired — local cleanup still proceeds */
  }
  lastPoll.delete(id);
  db().prepare('DELETE FROM google_sessions WHERE id = ?').run(id);
}

export async function cancelAllForGame(gameId: string, sid: string) {
  const rows = db().prepare('SELECT id FROM google_sessions WHERE game_id = ? AND sid = ?').all(gameId, sid) as { id: string }[];
  for (const r of rows) await cancelSession(sid, r.id);
}
