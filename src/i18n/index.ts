import { en, type MessageKey, type Messages } from './en';
import { he } from './he';

export type Locale = 'he' | 'en';
export type { MessageKey };

export const LOCALE_COOKIE = 'fb_locale';
export const messages: Record<Locale, Messages> = { he, en };

export function resolveLocale(v: string | undefined | null): Locale {
  if (v === 'he' || v === 'en') return v;
  return process.env.NEXT_PUBLIC_DEFAULT_LOCALE === 'he' ? 'he' : 'en';
}

export const dirOf = (l: Locale): 'rtl' | 'ltr' => (l === 'he' ? 'rtl' : 'ltr');
export const intlLocale = (l: Locale) => (l === 'he' ? 'he-IL' : 'en-US');

export function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const raw = messages[locale][key] ?? en[key];
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : raw;
}
