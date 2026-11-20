// A local TEST double for Google OAuth + the Photos Picker REST API (v1). It enforces the same contract the
// real services do (Bearer auth, PKCE S256, string maxItemCount, Duration strings, FAILED_PRECONDITION
// before selection, nextPageToken pagination) so the app's integration code is exercised for real.
// It is NOT Google. Never point production at it.
import http from 'node:http';
import crypto from 'node:crypto';
import sharp from 'sharp';

const PORT = Number(process.env.MOCK_GOOGLE_PORT || 4010);
const BASE = `http://localhost:${PORT}`;
const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const TOKEN = 'mock-access-token';

const state = { codes: new Map(), sessions: new Map(), log: [], pkceVerified: 0, tokenRequests: 0, deleted: [], mediaDownloads: 0, badAuth: 0 };
const json = (res, code, body) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
};
const err = (res, code, status, message) => json(res, code, { error: { code, status, message } });
const readBody = (req) => new Promise((r) => { let d = ''; req.on('data', (c) => (d += c)); req.on('end', () => r(d)); });
const authed = (req) => req.headers.authorization === `Bearer ${TOKEN}`;

const ITEMS = [
  { id: 'item-1', type: 'PHOTO', filename: 'beach.jpg', color: '#d9822b', createTime: '2021-07-04T10:00:00Z' },
  { id: 'item-2', type: 'PHOTO', filename: 'forest.jpg', color: '#2b8a5a', createTime: '2019-03-15T08:30:00Z' },
  { id: 'item-3', type: 'VIDEO', filename: 'clip.mp4', color: '#000000', createTime: '2020-01-01T00:00:00Z' },
  { id: 'item-4', type: 'PHOTO', filename: 'city.jpg', color: '#3a5fb0', createTime: '2023-11-20T18:45:00Z' },
];

async function jpeg(color, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${color}"/><circle cx="${400 + (label.length % 5) * 90}" cy="380" r="150" fill="#fff" opacity=".85"/><text x="60" y="720" font-size="64" fill="#fff">${label}</text></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;
  state.log.push(`${req.method} ${path}`);

  // ---- test control ----
  if (path === '/__state') return json(res, 200, { ...state, codes: undefined, sessions: [...state.sessions.keys()] });
  if (path === '/__reset') { state.codes.clear(); state.sessions.clear(); Object.assign(state, { log: [], pkceVerified: 0, tokenRequests: 0, deleted: [], mediaDownloads: 0, badAuth: 0 }); return json(res, 200, { ok: true }); }
  if (path === '/__select') {
    const s = [...state.sessions.values()].at(-1);
    if (!s) return json(res, 404, { error: 'no session' });
    s.mediaItemsSet = true;
    return json(res, 200, { ok: true, id: s.id });
  }

  // ---- OAuth ----
  if (path === '/auth') {
    const q = url.searchParams;
    if (q.get('response_type') !== 'code' || q.get('scope') !== SCOPE || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge') || !q.get('state')) {
      res.writeHead(400); return res.end('bad oauth request');
    }
    const code = crypto.randomBytes(8).toString('hex');
    state.codes.set(code, { challenge: q.get('code_challenge'), redirect: q.get('redirect_uri') });
    const back = new URL(q.get('redirect_uri'));
    back.searchParams.set('code', code);
    back.searchParams.set('state', q.get('state'));
    res.writeHead(302, { Location: back.toString() });
    return res.end();
  }
  if (path === '/token' && req.method === 'POST') {
    state.tokenRequests++;
    const f = new URLSearchParams(await readBody(req));
    const entry = state.codes.get(f.get('code'));
    const ok = entry && f.get('grant_type') === 'authorization_code' && f.get('client_secret') && crypto.createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') === entry.challenge;
    if (!ok) return json(res, 400, { error: 'invalid_grant' });
    state.codes.delete(f.get('code'));
    state.pkceVerified++;
    return json(res, 200, { access_token: TOKEN, expires_in: 3600, scope: SCOPE, token_type: 'Bearer' });
  }

  // ---- Picker API ----
  if (path.startsWith('/v1/')) {
    if (!authed(req)) { state.badAuth++; return err(res, 401, 'UNAUTHENTICATED', 'bad token'); }
    if (path === '/v1/sessions' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}');
      if (typeof body.pickingConfig?.maxItemCount !== 'string') return err(res, 400, 'INVALID_ARGUMENT', 'maxItemCount must be an int64 string');
      const id = `sess-${crypto.randomBytes(4).toString('hex')}`;
      const s = { id, pickerUri: `${BASE}/picker/${id}`, mediaItemsSet: false, max: Number(body.pickingConfig.maxItemCount) };
      state.sessions.set(id, s);
      return json(res, 200, { id, pickerUri: s.pickerUri, pollingConfig: { pollInterval: '1s', timeoutIn: '120s' }, expireTime: new Date(Date.now() + 3600e3).toISOString(), pickingConfig: { maxItemCount: String(s.max) }, mediaItemsSet: false });
    }
    const m = /^\/v1\/sessions\/([^/]+)$/.exec(path);
    if (m) {
      const s = state.sessions.get(m[1]);
      if (!s) return err(res, 404, 'NOT_FOUND', 'no such session');
      if (req.method === 'DELETE') { state.sessions.delete(m[1]); state.deleted.push(m[1]); return json(res, 200, {}); }
      return json(res, 200, { id: s.id, pickerUri: s.pickerUri, expireTime: new Date(Date.now() + 3000e3).toISOString(), mediaItemsSet: s.mediaItemsSet, ...(s.mediaItemsSet ? {} : { pollingConfig: { pollInterval: '1s', timeoutIn: '110s' } }) });
    }
    if (path === '/v1/mediaItems') {
      const s = state.sessions.get(url.searchParams.get('sessionId'));
      if (!s) return err(res, 404, 'NOT_FOUND', 'no such session');
      if (!s.mediaItemsSet) return err(res, 400, 'FAILED_PRECONDITION', 'user has not finished picking');
      const page = url.searchParams.get('pageToken') === 'p2' ? 2 : 1;
      const slice = page === 1 ? ITEMS.slice(0, 3) : ITEMS.slice(3);
      const mediaItems = slice.map((i) => ({
        id: i.id,
        createTime: i.createTime,
        type: i.type,
        mediaFile: { baseUrl: `${BASE}/media/${i.id}`, mimeType: i.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg', filename: i.filename, mediaFileMetadata: { width: 1200, height: 800 } },
      }));
      return json(res, 200, page === 1 ? { mediaItems, nextPageToken: 'p2' } : { mediaItems });
    }
    return err(res, 404, 'NOT_FOUND', 'unknown');
  }

  // ---- media bytes (baseUrl + "=w2048-h2048"; requires bearer + size param) ----
  if (path.startsWith('/media/')) {
    if (!authed(req)) { state.badAuth++; res.writeHead(401); return res.end(); }
    const id = path.slice('/media/'.length).split('=')[0];
    const size = path.split('=')[1];
    const item = ITEMS.find((i) => i.id === id);
    if (!item || !/^w\d+-h\d+$/.test(size || '')) { res.writeHead(400); return res.end(); }
    state.mediaDownloads++;
    const buf = await jpeg(item.color, item.filename);
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': buf.length });
    return res.end(buf);
  }

  if (path.startsWith('/picker/')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end('<!doctype html><title>Mock Google Photos Picker</title><h1>Mock Google Photos Picker (TEST DOUBLE)</h1>');
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`[mock-google] listening on ${BASE}`));
