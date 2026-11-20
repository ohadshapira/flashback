import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import '@fontsource-variable/inter';
import '@fontsource-variable/outfit'; // the flashback wordmark
import '@fontsource-variable/bricolage-grotesque/opsz.css'; // English headings
// Hebrew: Heebo (UI text) and Frank Ruhl Libre (display headings). Unicode-range subsets, so they only load when Hebrew is on screen.
import '@fontsource-variable/heebo';
import '@fontsource-variable/frank-ruhl-libre';
import './globals.css';
import { I18nProvider } from '@/components/I18nProvider';
import { dirOf, LOCALE_COOKIE, resolveLocale, translate } from '@/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  const description = translate(locale, 'meta.description');
  // The tagline is localized: "Guess the moment. Relive the memory." in English, its Hebrew version in the Hebrew UI.
  const TITLE = `flashback — ${translate(locale, 'brand.tagline')}`;
  const base = process.env.APP_BASE_URL || 'http://localhost:3000';
  return {
    metadataBase: new URL(base),
    title: { default: TITLE, template: '%s · flashback' },
    description,
    applicationName: 'flashback',
    openGraph: { title: TITLE, description, siteName: 'flashback', type: 'website', locale: locale === 'he' ? 'he_IL' : 'en_US' },
    twitter: { card: 'summary', title: TITLE, description },
    robots: { index: false, follow: false }, // private photo game: never index game pages
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#fbf3e8',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  return (
    <html lang={locale} dir={dirOf(locale)}>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
