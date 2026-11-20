import { db } from '../db';
import { ApiError } from '../errors';
import { decrypt, encrypt, pkceChallenge, randomToken } from '../crypto';
import { googleConfig, isGoogleConfigured, SCOPE } from './config';

const STATE_TTL_MS = 10 * 60_000;

/**
 * Begins OAuth 2.0 Authorization Code + PKCE. `state` is single-use and bound to this browser's
 * session cookie (CSRF / session-fixation protection). The code verifier never leaves the server.
 * Only the narrow Picker scope is requested, with no offline access: the token is short-lived and
 * discarded once the import finishes.
 */
export function buildAuthUrl(sid: string, gameId: string | null): string {
  if (!isGoogleConfigured()) throw new ApiError(503, 'google_not_configured', 'Google Photos is not configured in this development environment.');
  const cfg = googleConfig();
  const state = randomToken(24);
  const verifier = randomToken(48);
  db()
    .prepare('INSERT INTO oauth_states (state, sid, game_id, enc_code_verifier, expires_at) VALUES (?,?,?,?,?)')
    .run(state, sid, gameId, encrypt(verifier), Date.now() + STATE_TTL_MS);
  const u = new URL(cfg.authUrl);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', pkceChallenge(verifier));
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

export async function handleCallback(sid: string, code: string, state: string): Promise<{ gameId: string | null }> {
  const d = db();
  const row = d.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state) as
    | { state: string; sid: string; game_id: string | null; enc_code_verifier: string; expires_at: number }
    | undefined;
  // Single use: consume before anything else can fail.
  d.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
  if (!row || row.sid !== sid || row.expires_at < Date.now()) throw new ApiError(400, 'oauth_state_invalid', 'Sign-in session expired, please try again');

  const cfg = googleConfig();
  const res = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: 'authorization_code',
      code_verifier: decrypt(row.enc_code_verifier),
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new ApiError(502, 'google_error', 'Google rejected the sign-in');
  const tok = (await res.json()) as { access_token?: string; expires_in?: number; scope?: string };
  if (!tok.access_token) throw new ApiError(502, 'google_error');
  if (tok.scope && !tok.scope.split(' ').includes(SCOPE)) throw new ApiError(403, 'google_scope_denied', 'Photo access was not granted');

  const now = Date.now();
  d.prepare(
    `INSERT INTO google_tokens (sid, enc_access, enc_refresh, expires_at, scope, consent_at, created_at) VALUES (?,?,NULL,?,?,?,?)
     ON CONFLICT (sid) DO UPDATE SET enc_access=excluded.enc_access, expires_at=excluded.expires_at, scope=excluded.scope, created_at=excluded.created_at`,
  ).run(sid, encrypt(tok.access_token), now + (tok.expires_in ?? 3600) * 1000 - 30_000, tok.scope ?? SCOPE, now, now);
  return { gameId: row.game_id };
}

export function hasValidToken(sid: string): boolean {
  const r = db().prepare('SELECT expires_at FROM google_tokens WHERE sid = ?').get(sid) as { expires_at: number } | undefined;
  return !!r && r.expires_at > Date.now();
}

export function getAccessToken(sid: string): string {
  const r = db().prepare('SELECT enc_access, expires_at FROM google_tokens WHERE sid = ?').get(sid) as { enc_access: string; expires_at: number } | undefined;
  if (!r || r.expires_at <= Date.now()) throw new ApiError(401, 'google_reauth', 'Please reconnect Google Photos');
  return decrypt(r.enc_access);
}

export function discardToken(sid: string) {
  db().prepare('DELETE FROM google_tokens WHERE sid = ?').run(sid);
}
