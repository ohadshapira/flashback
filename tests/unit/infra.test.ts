import { beforeEach, describe, expect, it } from 'vitest';
import { decrypt, encrypt, pkceChallenge } from '@/lib/crypto';
import { rateLimit, resetRateLimits } from '@/lib/ratelimit';
import { parseDuration } from '@/lib/google/picker';
import { assertMediaUrl } from '@/lib/google/picker';
import { suggestionFromIso } from '@/lib/services/games';
import { he } from '@/i18n/he';
import { en } from '@/i18n/en';

describe('crypto', () => {
  beforeEach(() => {
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });
  it('round-trips and never repeats ciphertext', () => {
    const a = encrypt('ya29.secret-token');
    expect(a).not.toContain('secret');
    expect(decrypt(a)).toBe('ya29.secret-token');
    expect(encrypt('ya29.secret-token')).not.toBe(a);
  });
  it('detects tampering', () => {
    const parts = encrypt('hello').split('.');
    parts[3] = Buffer.from('tampered!').toString('base64url');
    expect(() => decrypt(parts.join('.'))).toThrow();
  });
  it('matches the RFC 7636 PKCE S256 example', () => {
    expect(pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
});

describe('rateLimit', () => {
  beforeEach(resetRateLimits);
  it('allows up to max then throws 429, and recovers after the window', () => {
    for (let i = 0; i < 3; i++) rateLimit('k', 3, 1000, 0);
    expect(() => rateLimit('k', 3, 1000, 10)).toThrow(/Too many/);
    expect(() => rateLimit('k', 3, 1000, 1500)).not.toThrow();
    expect(() => rateLimit('other', 3, 1000, 10)).not.toThrow();
  });
});

describe('google helpers', () => {
  it('parses protobuf durations', () => {
    expect(parseDuration('5s', 0)).toBe(5000);
    expect(parseDuration('3.5s', 0)).toBe(3500);
    expect(parseDuration(undefined, 7)).toBe(7);
    expect(parseDuration('garbage', 9)).toBe(9);
  });
  it('only downloads from Google hosts (SSRF guard)', () => {
    expect(() => assertMediaUrl('https://lh3.googleusercontent.com/p/abc')).not.toThrow();
    expect(() => assertMediaUrl('http://lh3.googleusercontent.com/p/abc')).toThrow();
    expect(() => assertMediaUrl('https://evil.example.com/x')).toThrow();
    expect(() => assertMediaUrl('https://googleusercontent.com.evil.com/x')).toThrow();
    expect(() => assertMediaUrl('http://169.254.169.254/latest')).toThrow();
  });
  it('derives a month/year suggestion from createTime by string parsing', () => {
    expect(suggestionFromIso('2022-08-14T23:59:59Z')).toEqual({ year: 2022, month: 8 });
    expect(suggestionFromIso('nope')).toEqual({ year: null, month: null });
  });
});

describe('i18n', () => {
  it('has identical keys in he and en, and keeps the exact brand and tagline', () => {
    expect(Object.keys(he).sort()).toEqual(Object.keys(en).sort());
    expect(en['brand.name']).toBe('flashback');
    expect(he['brand.name']).toBe('flashback');
    expect(en['brand.tagline']).toBe('Guess the moment. Relive the memory.');
    expect(he['brand.tagline']).toBe('נחשו את הרגע. חיו את הזיכרון מחדש.'); // the slogan is localized in the Hebrew UI
  });
  it('uses the same {placeholders} in both languages', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(he[k]), k).toBe(ph(en[k]));
  });
});
