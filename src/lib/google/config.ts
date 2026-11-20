/** Official endpoints; the *_URL / *_BASE env overrides exist only so tests can point at a local mock server. */
export const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';
const DEFAULT_PICKER_BASE = 'https://photospicker.googleapis.com';

export function googleConfig() {
  const pickerBase = (process.env.GOOGLE_PICKER_API_BASE || DEFAULT_PICKER_BASE).replace(/\/$/, '');
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/auth/google/callback`,
    authUrl: process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
    pickerBase,
    /** True when pointed at a test double instead of the real Google endpoints. */
    mock: pickerBase !== DEFAULT_PICKER_BASE,
  };
}

export function encryptionKeyValid(): boolean {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? '';
  const buf = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  return buf.length === 32;
}

export function isGoogleConfigured(): boolean {
  const c = googleConfig();
  return !!(c.clientId && c.clientSecret && c.redirectUri && encryptionKeyValid());
}
