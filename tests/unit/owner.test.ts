import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OWNER_COOKIE, isOwnerRequest, ownerCookieHeader, ownerToken, passcodeMatches, requireOwner, tokenIsOwner } from '@/lib/owner';
import { resetRateLimits } from '@/lib/ratelimit';

/** The optional "only the owner creates games" lock for a personal server. */
const KEEP = { code: process.env.OWNER_PASSCODE, dir: process.env.FLASHBACK_DATA_DIR };
let tmp: string;

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'flashback-owner-'));
  process.env.FLASHBACK_DATA_DIR = tmp;
  resetRateLimits();
});
afterEach(() => {
  if (KEEP.code === undefined) delete process.env.OWNER_PASSCODE;
  else process.env.OWNER_PASSCODE = KEEP.code;
  if (KEEP.dir === undefined) delete process.env.FLASHBACK_DATA_DIR;
  else process.env.FLASHBACK_DATA_DIR = KEEP.dir;
});

const req = (cookie?: string, init: RequestInit = {}) => new Request('http://localhost/x', { ...init, headers: { ...(cookie ? { cookie } : {}), ...(init.headers as Record<string, string>) } });

describe('owner lock', () => {
  it('is off by default: everyone may create', () => {
    delete process.env.OWNER_PASSCODE;
    expect(tokenIsOwner(undefined)).toBe(true);
    expect(() => requireOwner(req())).not.toThrow();
  });

  it('when on, creating needs the cookie issued by the right passcode', () => {
    process.env.OWNER_PASSCODE = 'correct horse';
    expect(isOwnerRequest(req())).toBe(false);
    expect(() => requireOwner(req())).toThrow(expect.objectContaining({ status: 401, code: 'owner_only' }));
    expect(() => requireOwner(req(`${OWNER_COOKIE}=nonsense`))).toThrow();
    expect(() => requireOwner(req(`${OWNER_COOKIE}=${ownerToken('another passcode')}`))).toThrow();
    expect(() => requireOwner(req(`${OWNER_COOKIE}=${ownerToken()}`))).not.toThrow();
  });

  it('the cookie never contains the passcode and is HttpOnly', () => {
    process.env.OWNER_PASSCODE = 'correct horse';
    const header = ownerCookieHeader();
    expect(header).not.toContain('correct');
    expect(header).toContain('HttpOnly');
    expect(header).toContain('SameSite=Lax');
  });

  it('passcodeMatches compares exactly', () => {
    process.env.OWNER_PASSCODE = 'correct horse';
    expect(passcodeMatches('correct horse')).toBe(true);
    expect(passcodeMatches('correct hors')).toBe(false);
    expect(passcodeMatches('')).toBe(false);
    delete process.env.OWNER_PASSCODE;
    expect(passcodeMatches('')).toBe(false);
  });

  it('the creating endpoints refuse a locked browser, and unlocking opens them', async () => {
    process.env.OWNER_PASSCODE = 'correct horse';
    const games = await import('@/app/api/games/route');
    const unlock = await import('@/app/api/owner/unlock/route');
    const ctx = { params: Promise.resolve({}) };
    const post = (cookie?: string) => games.POST(req(cookie, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'couple', photoCount: 3 }) }), ctx);

    expect((await post()).status).toBe(401);

    const wrong = await unlock.POST(req(undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'nope' }) }), ctx);
    expect(wrong.status).toBe(401);
    expect(wrong.headers.get('set-cookie') ?? '').not.toContain(OWNER_COOKIE);

    const right = await unlock.POST(req(undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'correct horse' }) }), ctx);
    expect(right.status).toBe(200);
    const cookie = (right.headers.get('set-cookie') ?? '').split(';')[0];
    expect(cookie.startsWith(`${OWNER_COOKIE}=`)).toBe(true);
    expect((await post(cookie)).status).not.toBe(401); // allowed through to normal validation/creation
  });

  it('guessing the passcode is rate limited', async () => {
    process.env.OWNER_PASSCODE = 'correct horse';
    const unlock = await import('@/app/api/owner/unlock/route');
    const ctx = { params: Promise.resolve({}) };
    const bad = () => unlock.POST(req(undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: 'x' }) }), ctx);
    const codes: number[] = [];
    for (let i = 0; i < 10; i++) codes.push((await bad()).status);
    expect(codes.slice(0, 8).every((c) => c === 401)).toBe(true);
    expect(codes[9]).toBe(429);
  });
});
