import crypto from 'node:crypto';
import { ApiError } from './errors';
import { parseCookies } from './http';

/**
 * Optional "only I can create games" lock for a personal server.
 *
 * With `OWNER_PASSCODE` set, creating anything (games, uploads, Google Photos imports, the demo) needs a cookie that is
 * only issued after typing the passcode on /unlock. Playing and joining a room never needs it, so friends and family
 * can still join with a code. Without `OWNER_PASSCODE` nothing changes.
 */
export const OWNER_COOKIE = 'fb_owner';

export function ownerLockEnabled(): boolean {
  return !!process.env.OWNER_PASSCODE;
}

/** The cookie value: an HMAC of a fixed label keyed with the passcode, so the passcode itself never sits in a cookie. */
export function ownerToken(passcode = process.env.OWNER_PASSCODE ?? ''): string {
  return crypto.createHmac('sha256', passcode).update('flashback-owner-v1').digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function passcodeMatches(candidate: string): boolean {
  const real = process.env.OWNER_PASSCODE ?? '';
  return !!real && safeEqual(ownerToken(candidate), ownerToken(real));
}

export function tokenIsOwner(token: string | undefined | null): boolean {
  if (!ownerLockEnabled()) return true;
  return !!token && safeEqual(token, ownerToken());
}

export function isOwnerRequest(req: Request): boolean {
  return tokenIsOwner(parseCookies(req.headers.get('cookie'))[OWNER_COOKIE]);
}

/** Throws 401 when the lock is on and this browser has not been unlocked. */
export function requireOwner(req: Request): void {
  if (!isOwnerRequest(req)) throw new ApiError(401, 'owner_only', 'This server only lets its owner create games');
}

export function ownerCookieHeader(): string {
  const secure = (process.env.APP_BASE_URL ?? '').startsWith('https://') ? '; Secure' : '';
  return `${OWNER_COOKIE}=${ownerToken()}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 90}${secure}`;
}
