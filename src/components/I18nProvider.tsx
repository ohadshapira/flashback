'use client';

import { createContext, useCallback, useContext, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { dirOf, intlLocale, LOCALE_COOKIE, messages, translate, type Locale, type MessageKey } from '@/i18n';

type TFn = (key: MessageKey, vars?: Record<string, string | number>) => string;
type Ctx = { locale: Locale; dir: 'rtl' | 'ltr'; intl: string; t: TFn; setLocale: (l: Locale) => void; errText: (e: unknown) => string };

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const t = useCallback<TFn>((key, vars) => translate(locale, key, vars), [locale]);
  const setLocale = useCallback(
    (l: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      router.refresh();
    },
    [router],
  );
  const errText = useCallback(
    (e: unknown) => {
      const code = e instanceof Error && 'code' in e ? String((e as { code: unknown }).code) : 'generic';
      const key = (code === 'network' ? 'err.network' : `err.${code}`) as MessageKey;
      return key in messages[locale] ? translate(locale, key) : translate(locale, 'err.generic');
    },
    [locale],
  );
  const value = useMemo(() => ({ locale, dir: dirOf(locale), intl: intlLocale(locale), t, setLocale, errText }), [locale, t, setLocale, errText]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const c = useContext(I18nContext);
  if (!c) throw new Error('useI18n outside provider');
  return c;
}

export const useT = () => useI18n().t;
