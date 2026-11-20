'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { BackLink, ErrorBox, PageShell } from '@/components/Shell';
import { useI18n } from '@/components/I18nProvider';
import { api } from '@/lib/client/api';

export function UnlockClient() {
  const { t, errText } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api('/api/owner/unlock', { body: { code } });
      router.push('/new');
      router.refresh();
    } catch (x) {
      setErr(errText(x));
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <BackLink href="/" />
      <form onSubmit={submit} className="card mx-auto mt-2 max-w-md space-y-4" data-testid="unlock-form">
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-rose-soft text-rose-deep">
          <Lock size={22} aria-hidden />
        </div>
        <div>
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight">{t('unlock.title')}</h1>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{t('unlock.sub')}</p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-muted">{t('unlock.field')}</span>
          <input className="field" type="password" autoComplete="current-password" value={code} onChange={(e) => setCode(e.target.value)} data-testid="unlock-code" />
        </label>
        {err && <ErrorBox message={err} />}
        <button type="submit" className="btn-primary w-full" disabled={!code || busy} data-testid="unlock-submit">
          {t('unlock.submit')}
        </button>
      </form>
    </PageShell>
  );
}
