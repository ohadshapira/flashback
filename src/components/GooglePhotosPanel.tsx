'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, ImagePlus, Loader2, ShieldCheck, X } from 'lucide-react';
import { useI18n } from './I18nProvider';
import { ErrorBox } from './Shell';
import { api } from '@/lib/client/api';
import type { MessageKey } from '@/i18n';

type Cfg = { configured: boolean; mock: boolean; connected: boolean };
type Issue = { code: string; name?: string };
type Sess = {
  id: string;
  pickerUri: string;
  state: 'waiting' | 'ready' | 'importing' | 'done' | 'failed' | 'expired' | 'cancelled';
  pollIntervalMs: number;
  progress: { total: number; done: number };
  issues: Issue[];
  mock: boolean;
};

/**
 * Google Photos Picker UI: disclosure + consent → OAuth (PKCE, server-side) → Picker session opened in its
 * own tab (never an iframe) → server-side polling → server-side import → cleanup. No fake states: if Google
 * is not configured it says so and local upload stays available.
 */
export function GooglePhotosPanel({ gameId, onImported, flag, room, days }: { gameId: string; onImported: () => void; flag?: string | null; room: number; days: number }) {
  const { t, errText } = useI18n();
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [session, setSession] = useState<Sess | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [busy, setBusy] = useState(false);
  /** The browser refused to open the Google Photos tab (pop-up blocked). */
  const [blocked, setBlocked] = useState(false);
  const importing = useRef(false);
  const notified = useRef(false);

  const loadConfig = useCallback(async () => {
    try {
      setCfg(await api<Cfg>('/api/google-photos/config'));
    } catch (e) {
      setError(errText(e));
    }
  }, [errText]);

  // Resume an in-flight session after a reload / returning from the Google Photos tab.
  useEffect(() => {
    void loadConfig();
    api<{ session: Sess | null }>(`/api/google-photos/sessions?gameId=${gameId}`)
      .then((r) => {
        if (r.session && ['waiting', 'ready', 'importing'].includes(r.session.state)) setSession(r.session);
      })
      .catch(() => undefined);
  }, [gameId, loadConfig]);

  // Poll status at (at least) the server-provided interval; the server itself enforces pollInterval toward Google.
  // Also check right away when the user comes back to this tab (background tabs throttle timers heavily).
  const errTextRef = useRef(errText);
  errTextRef.current = errText;
  const sessionId = session?.id;
  const sessionActive = !!session && ['waiting', 'ready', 'importing'].includes(session.state);
  const pollMs = Math.max(2000, session?.pollIntervalMs ?? 5000);
  useEffect(() => {
    if (!sessionId || !sessionActive) return;
    let stopped = false;
    let inFlight = false;
    const check = async () => {
      if (inFlight || stopped) return;
      inFlight = true;
      try {
        const s = await api<Sess>(`/api/google-photos/sessions/${sessionId}/status`);
        if (!stopped) setSession(s);
      } catch (e) {
        if (!stopped) {
          setError(errTextRef.current(e));
          setSession(null);
        }
      } finally {
        inFlight = false;
      }
    };
    const id = setInterval(check, pollMs);
    const onBack = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, [sessionId, sessionActive, pollMs]);

  const startImport = useCallback(async () => {
    if (!session || importing.current) return;
    importing.current = true;
    try {
      setSession(await api<Sess>(`/api/google-photos/sessions/${session.id}/import`, { method: 'POST' }));
    } catch (e) {
      setError(errText(e));
      importing.current = false;
    }
  }, [session, errText]);

  // Selection finished → import automatically (once).
  useEffect(() => {
    if (session?.state === 'ready') void startImport();
  }, [session?.state, startImport]);

  // Refresh the photo list as the import progresses and when it ends.
  useEffect(() => {
    if (session?.state === 'importing' || session?.state === 'done' || session?.state === 'failed') onImported();
    if (session?.state === 'done' || session?.state === 'failed') {
      importing.current = false;
      notified.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.state, session?.progress.done]);

  async function pick() {
    setBusy(true);
    setError(null);
    // Open synchronously inside the click so popup blockers allow it; navigate once the session exists.
    const tab = window.open('about:blank', '_blank');
    setBlocked(!tab);
    try {
      const s = await api<Sess>('/api/google-photos/sessions', { body: { gameId } });
      setSession(s);
      importing.current = false;
      if (tab) {
        tab.opener = null;
        tab.location.href = s.pickerUri; // a separate tab, never an iframe
      }
    } catch (e) {
      tab?.close();
      setError(errText(e));
      await loadConfig();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!session) return;
    await api(`/api/google-photos/sessions/${session.id}`, { method: 'DELETE' }).catch(() => undefined);
    setSession(null);
  }

  const issueText = (i: Issue) => {
    const key = `google.issue.${i.code}` as MessageKey;
    return t(['video_skipped', 'item_limit', 'duplicate_photo'].includes(i.code) ? key : 'google.issue.generic', { name: i.name ?? '' });
  };

  const disabled = !cfg?.configured || room < 1;

  return (
    <div className="card space-y-3" data-testid="google-panel">
      <div className="flex items-start gap-3">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-blue to-blue-deep text-white shadow-md"><ImagePlus size={22} aria-hidden /></span>
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-tight">{t('photos.google')}</p>
          <p className="text-sm text-muted">{t('photos.googleHint')}</p>
        </div>
      </div>

      {cfg && !cfg.configured && (
        <div className="rounded-2xl bg-warn-soft p-3 text-sm text-warn" data-testid="google-not-configured">
          <p className="font-semibold" lang="en" dir="ltr">{t('google.notConfigured')}</p>
          <p>{t('google.notConfiguredHelp')}</p>
        </div>
      )}
      {cfg?.mock && <p className="rounded-xl bg-warn-soft p-2 text-xs font-semibold text-warn" data-testid="google-mock-banner">{t('google.mock')}</p>}
      {flag === 'denied' && <ErrorBox message={t('google.denied')} />}
      {flag === 'error' && <ErrorBox message={t('google.error')} />}
      {error && <ErrorBox message={error} />}

      {!session && cfg?.configured && (
        cfg.connected ? (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-good"><span aria-hidden className="h-2 w-2 rounded-full bg-good" /> {t('google.connected')}</p>
            <button type="button" className="btn-secondary w-full" onClick={pick} disabled={busy || room < 1} data-testid="google-pick">
              {busy ? <Loader2 className="animate-spin" size={18} /> : <ExternalLink size={18} aria-hidden />} {t('google.pick')}
            </button>
          </div>
        ) : (
          <button type="button" className="btn-secondary w-full" onClick={() => setShowDisclosure(true)} disabled={disabled} data-testid="google-connect">
            {t('photos.google')}
          </button>
        )
      )}
      {!cfg?.configured && (
        <button type="button" className="btn-secondary w-full" disabled data-testid="google-connect-disabled">{t('photos.google')}</button>
      )}

      {session && (
        <div className="space-y-2 rounded-2xl bg-blue-soft/60 p-3" data-testid="google-session" data-state={session.state} aria-live="polite">
          {session.state === 'waiting' && (
            <>
              {blocked && <p className="rounded-xl bg-warn-soft p-2 text-sm font-medium text-warn" data-testid="google-popup-blocked">{t('google.popupBlocked')}</p>}
              <p className="flex items-center gap-2 font-medium"><Loader2 className="animate-spin" size={18} aria-hidden /> {blocked ? t('google.waitingBlocked') : t('google.waiting')}</p>
              <div className="flex flex-wrap gap-2">
                <a href={session.pickerUri} target="_blank" rel="noopener noreferrer" className="btn-secondary !min-h-10 text-sm" data-testid="google-open-again">
                  <ExternalLink size={16} aria-hidden /> {t('google.openAgain')}
                </a>
                {/* Same-tab fallback for browsers that block pop-ups: the session is kept and resumes when the user comes back. */}
                <a href={session.pickerUri} className="btn-secondary !min-h-10 text-sm" data-testid="google-open-here">
                  {t('google.openHere')}
                </a>
                <button type="button" className="btn-ghost text-sm" onClick={cancel}>{t('google.cancel')}</button>
              </div>
              <p className="text-xs text-muted">{t('google.backHint')}</p>
            </>
          )}
          {(session.state === 'ready' || session.state === 'importing') && (
            <p className="flex items-center gap-2 font-medium" data-testid="google-progress">
              <Loader2 className="animate-spin" size={18} aria-hidden /> {t('google.importing', { done: session.progress.done, total: session.progress.total })}
            </p>
          )}
          {session.state === 'done' && <p className="font-medium text-good" data-testid="google-done">{t('google.done')}</p>}
          {session.state === 'failed' && <p className="font-medium text-rose-deep">{t('google.failed')}</p>}
          {session.state === 'expired' && <p className="font-medium text-warn">{t('google.expired')}</p>}
          {session.issues.length > 0 && (
            <ul className="list-disc ps-5 text-sm text-muted" data-testid="google-issues">
              {session.issues.map((i, n) => <li key={n}>{issueText(i)}</li>)}
            </ul>
          )}
          {['done', 'failed', 'expired'].includes(session.state) && (
            <button type="button" className="btn-ghost text-sm" onClick={() => setSession(null)}>{t('common.close')}</button>
          )}
        </div>
      )}

      {cfg?.connected && !session && (
        <button type="button" className="btn-ghost !min-h-9 text-xs" onClick={async () => { await api('/api/google-photos/config', { method: 'DELETE' }); await loadConfig(); }}>
          {t('google.disconnect')}
        </button>
      )}

      {showDisclosure && (
        <div className="fixed inset-0 z-50 grid place-items-end bg-ink/60 p-3 sm:place-items-center" role="dialog" aria-modal="true" aria-labelledby="gdisc-title" data-testid="google-disclosure">
          <div className="card max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto">
            <div className="flex items-start justify-between gap-2">
              <h2 id="gdisc-title" className="flex items-center gap-2 font-display text-xl font-semibold"><ShieldCheck size={22} aria-hidden /> {t('google.disclosure.title')}</h2>
              <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={() => setShowDisclosure(false)} aria-label={t('common.close')}><X size={18} /></button>
            </div>
            <ul className="list-disc space-y-2 ps-5 text-sm">
              <li>{t('google.disclosure.b1')}</li>
              <li>{t('google.disclosure.b2')}</li>
              <li>{t('google.disclosure.b3', { days })}</li>
              <li>{t('google.disclosure.b4')}</li>
            </ul>
            <Link href="/privacy" target="_blank" className="block text-sm underline underline-offset-4">{t('google.disclosure.privacy')}</Link>
            <button
              type="button"
              className="btn-primary w-full"
              data-testid="google-agree"
              onClick={() => {
                // Explicit, affirmative consent → server-side OAuth start.
                window.location.href = `/api/auth/google/start?gameId=${encodeURIComponent(gameId)}&consent=1`;
              }}
            >
              {t('google.disclosure.agree')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
