import { ApiError } from '../errors';
import { googleConfig } from './config';

/** Thin client for https://photospicker.googleapis.com/v1 (field names per the official REST reference). */

export type PickerSession = {
  id: string;
  pickerUri: string;
  pollIntervalMs: number;
  timeoutMs: number;
  expireTimeMs: number;
  mediaItemsSet: boolean;
};

export type PickedMediaItem = {
  id: string;
  createTime?: string;
  type?: 'TYPE_UNSPECIFIED' | 'PHOTO' | 'VIDEO';
  mediaFile?: { baseUrl?: string; mimeType?: string; filename?: string; mediaFileMetadata?: { width?: number; height?: number } };
};

/** Protobuf Duration string ("5s", "3.5s") → milliseconds. */
export function parseDuration(s: string | undefined, fallbackMs: number): number {
  const m = /^(\d+(?:\.\d+)?)s$/.exec(s ?? '');
  return m ? Math.round(Number(m[1]) * 1000) : fallbackMs;
}

async function gfetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${googleConfig().pickerBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (res.ok) return res;
  let status = '';
  try {
    status = ((await res.json()) as { error?: { status?: string } }).error?.status ?? '';
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 401) throw new ApiError(401, 'google_reauth', 'Please reconnect Google Photos');
  if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') throw new ApiError(429, 'google_rate_limited', 'Google is rate limiting requests');
  if (status === 'FAILED_PRECONDITION') throw new ApiError(409, 'google_precondition', 'No active Google Photos account, or selection not finished');
  if (res.status === 403 || status === 'PERMISSION_DENIED') throw new ApiError(403, 'google_forbidden', 'Google denied access (the session may have expired)');
  if (res.status === 404) throw new ApiError(404, 'google_not_found', 'Picker session not found');
  throw new ApiError(502, 'google_error', `Google Photos error (${res.status})`);
}

function toSession(j: Record<string, unknown>): PickerSession {
  const polling = (j.pollingConfig ?? {}) as { pollInterval?: string; timeoutIn?: string };
  return {
    id: String(j.id),
    pickerUri: String(j.pickerUri ?? ''),
    pollIntervalMs: Math.max(1000, parseDuration(polling.pollInterval, 5000)),
    timeoutMs: parseDuration(polling.timeoutIn, 300_000),
    expireTimeMs: j.expireTime ? Date.parse(String(j.expireTime)) : Date.now() + 3_600_000,
    mediaItemsSet: j.mediaItemsSet === true,
  };
}

/** maxItemCount is an int64 *string* in the API. */
export async function createSession(token: string, maxItemCount: number): Promise<PickerSession> {
  const res = await gfetch('/v1/sessions', token, { method: 'POST', body: JSON.stringify({ pickingConfig: { maxItemCount: String(maxItemCount) } }) });
  return toSession((await res.json()) as Record<string, unknown>);
}

export async function getSession(token: string, id: string): Promise<PickerSession> {
  const res = await gfetch(`/v1/sessions/${encodeURIComponent(id)}`, token);
  return toSession((await res.json()) as Record<string, unknown>);
}

export async function deleteSession(token: string, id: string): Promise<void> {
  await gfetch(`/v1/sessions/${encodeURIComponent(id)}`, token, { method: 'DELETE' });
}

/** Lists every picked item. Only call after mediaItemsSet === true. Pagination relies on nextPageToken, never on counts. */
export async function listMediaItems(token: string, sessionId: string, maxPages = 20): Promise<PickedMediaItem[]> {
  const out: PickedMediaItem[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const q = new URLSearchParams({ sessionId, pageSize: '100' });
    if (pageToken) q.set('pageToken', pageToken);
    const j = (await (await gfetch(`/v1/mediaItems?${q}`, token)).json()) as { mediaItems?: PickedMediaItem[]; nextPageToken?: string };
    out.push(...(j.mediaItems ?? []));
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

/** SSRF guard: media URLs must be https on a Google host (or the configured mock origin in tests). */
export function assertMediaUrl(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new ApiError(502, 'google_error', 'Bad media URL');
  }
  const cfg = googleConfig();
  const okGoogle = u.protocol === 'https:' && /(^|\.)(googleusercontent\.com|google\.com|googleapis\.com)$/.test(u.hostname);
  const okMock = cfg.mock && u.origin === new URL(cfg.pickerBase).origin;
  if (!okGoogle && !okMock) throw new ApiError(502, 'google_error', 'Unexpected media host');
}

const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

/** Authorized, size-capped server-side download. `=w2048-h2048` requests a resized JPEG (a size param is required). */
export async function downloadImage(token: string, baseUrl: string): Promise<Buffer> {
  assertMediaUrl(baseUrl);
  const res = await fetch(`${baseUrl}=w2048-h2048`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000), redirect: 'follow' });
  if (res.status === 401 || res.status === 403) throw new ApiError(401, 'google_reauth');
  if (!res.ok) throw new ApiError(502, 'google_download_failed', `Download failed (${res.status})`);
  if (!(res.headers.get('content-type') ?? '').startsWith('image/')) throw new ApiError(502, 'google_download_failed', 'Not an image');
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > MAX_DOWNLOAD_BYTES) throw new ApiError(413, 'file_too_large');
  const reader = res.body?.getReader();
  if (!reader) throw new ApiError(502, 'google_download_failed');
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new ApiError(413, 'file_too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
