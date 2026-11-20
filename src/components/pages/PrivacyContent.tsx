'use client';

import Link from 'next/link';
import { useI18n } from '@/components/I18nProvider';

export function PrivacyContent({ days }: { days: number }) {
  const { t } = useI18n();
  const sections = [
    ['privacy.h.what', t('privacy.p.what')],
    ['privacy.h.google', t('privacy.p.google')],
    ['privacy.h.who', t('privacy.p.who')],
    ['privacy.h.retention', t('privacy.p.retention', { days })],
    ['privacy.h.never', t('privacy.p.never')],
  ] as const;
  return (
    <article className="space-y-5" data-testid="privacy-page">
      <h1 className="font-display text-3xl font-semibold">{t('privacy.title')}</h1>
      <p className="text-lg text-muted">{t('privacy.p1')}</p>
      {sections.map(([h, body]) => (
        <section key={h} className="space-y-1">
          <h2 className="font-display text-xl font-semibold">{t(h)}</h2>
          <p className="leading-relaxed">{body}</p>
        </section>
      ))}
      <p className="rounded-2xl bg-warn-soft p-3 text-sm text-warn">{t('privacy.note')}</p>
      <Link href="/help/delete-data" className="btn-secondary">{t('privacy.delete')}</Link>
    </article>
  );
}
