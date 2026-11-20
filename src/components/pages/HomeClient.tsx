'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, ArrowLeft, Heart, HeartHandshake, KeyRound, MapPin, PartyPopper, Sparkles, Users, Image as ImageIcon, CalendarClock, Gift } from 'lucide-react';
import { AppHeader, ErrorBox } from '@/components/Shell';
import { Hero } from '@/components/Hero';
import { useI18n } from '@/components/I18nProvider';
import { api } from '@/lib/client/api';
import type { GameMeta } from '@/lib/client/types';

type Mode = 'couple' | 'family_shared' | 'party';
/** Partners is a family_shared game with a profile, so the demo button sends the same mode plus a flag. */
type DemoKind = Mode | 'partners';

export function HomeClient({ demo, google }: { demo: boolean; google?: string }) {
  const { t, errText, dir } = useI18n();
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [pickParty, setPickParty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Arrow = dir === 'rtl' ? ArrowLeft : ArrowRight;

  const modes = [
    { mode: 'couple', href: '/new?mode=couple', icon: Heart, title: t('home.couple.title'), desc: t('home.couple.desc'), accent: 'from-rose to-apricot', id: 'couple' },
    { mode: 'family_shared', href: '/new?mode=family-shared', icon: Users, title: t('home.family.title'), desc: t('home.family.desc'), accent: 'from-blue to-[#7aa5d4]', id: 'family' },
    { mode: 'party', href: '/new?mode=party', icon: PartyPopper, title: t('home.party.title'), desc: t('home.party.desc'), accent: 'from-[#e0a03a] to-[#f2c76b]', id: 'party' },
    { mode: 'partners', href: '/new?mode=partners', icon: HeartHandshake, title: t('home.partners.title'), desc: t('home.partners.desc'), accent: 'from-good to-[#5fae86]', id: 'partners' },
  ] as const;

  const steps = [
    { icon: ImageIcon, title: t('home.how.1.title'), desc: t('home.how.1.desc') },
    { icon: Sparkles, title: t('home.how.2.title'), desc: t('home.how.2.desc') },
    { icon: MapPin, title: t('home.how.3.title'), desc: t('home.how.3.desc') },
    { icon: Gift, title: t('home.how.4.title'), desc: t('home.how.4.desc') },
  ];

  /** The party demo is always the one you can play on your own (with simulated players); the style is chosen first. */
  async function startDemo(mode: DemoKind, style?: 'classic' | 'scratch') {
    setBusy(mode === 'party' ? `party-${style ?? 'classic'}` : mode);
    setError(null);
    try {
      const body = mode === 'party' ? { mode, solo: true, style: style ?? 'classic' } : mode === 'partners' ? { mode: 'family_shared', partners: true } : { mode };
      const g = await api<GameMeta>('/api/demo', { body });
      router.push(mode === 'party' ? `/room/${g.joinCode}/lobby` : `/play/${g.id}/handoff`);
    } catch (e) {
      setError(errText(e));
      setBusy(null);
    }
  }

  const tagline = t('brand.tagline');
  const cut = tagline.indexOf('. ') + 1;

  return (
    <>
      <AppHeader large wide />
      <main className="mx-auto w-full max-w-5xl px-4 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-2">
        <div className="grid items-center gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10">
          <section className="space-y-4 pt-2 lg:pt-8">
            <span className="chip border border-rose/20 bg-white/70 px-3 py-1.5 text-rose-deep shadow-sm backdrop-blur">
              <Sparkles size={14} aria-hidden /> {t('brand.sub')}
            </span>
            <h1 className="text-[2.6rem] font-semibold leading-[1.02] tracking-tight sm:text-6xl" data-testid="home-tagline">
              {cut > 0 ? (
                <>
                  <span>{tagline.slice(0, cut)}</span> <span className="text-gradient block">{tagline.slice(cut + 1)}</span>
                </>
              ) : (
                tagline
              )}
            </h1>
          </section>
          <Hero />
        </div>

        {(google === 'denied' || google === 'error') && <div className="mt-4"><ErrorBox message={google === 'denied' ? t('home.googleDenied') : t('home.googleError')} /></div>}
        {error && <div className="mt-4"><ErrorBox message={error} /></div>}

        <section className="fb-stagger mt-6 grid gap-3 md:grid-cols-2 lg:grid-cols-4" aria-label="game modes">
          {modes.map((m) => (
            <Link
              key={m.id}
              href={m.href}
              className="card group relative flex items-center gap-4 overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-(--shadow-lift) md:flex-col md:items-start md:gap-5 md:p-6"
              data-testid={`mode-${m.id}`}
            >
              <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br text-white shadow-lg ${m.accent}`}>
                <m.icon size={26} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-2xl font-semibold">{m.title}</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted">{m.desc}</span>
              </span>
              <Arrow className="shrink-0 text-muted transition group-hover:translate-x-1 group-hover:text-rose md:absolute md:end-5 md:top-6" size={20} aria-hidden />
            </Link>
          ))}
        </section>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <section className="card space-y-3">
            <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
              <KeyRound size={20} className="text-rose" aria-hidden /> {t('home.join.title')}
            </h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (code.length >= 4) router.push(`/room/${code}`);
              }}
            >
              <input
                className="field text-center font-mono text-xl font-bold uppercase tracking-[0.3em]"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={6}
                value={code}
                placeholder={t('home.join.placeholder')}
                aria-label={t('home.join.placeholder')}
                data-testid="join-code-input"
                dir="ltr"
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              />
              <button className="btn-primary" type="submit" disabled={code.length < 4} data-testid="join-submit">
                {t('home.join.cta')}
              </button>
            </form>
          </section>

          {demo && (
            <section className="card space-y-3 border-dashed !border-rose/30" data-testid="demo-card">
              <div className="flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
                  <Sparkles size={20} className="text-rose" aria-hidden /> {t('home.demo.title')}
                </h2>
                <span className="chip bg-warn-soft text-warn">{t('home.demo.badge')}</span>
              </div>
              <p className="text-sm text-muted">{t('home.demo.desc')}</p>
              <div className="flex flex-wrap gap-2">
                {modes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`btn-secondary !px-4 text-sm ${m.mode === 'party' && pickParty ? '!border-rose/50 !bg-rose-soft/60' : ''}`}
                    disabled={busy !== null}
                    onClick={() => (m.mode === 'party' ? setPickParty((v) => !v) : startDemo(m.mode))}
                    aria-expanded={m.mode === 'party' ? pickParty : undefined}
                    data-testid={`demo-${m.id}`}
                  >
                    <m.icon size={16} aria-hidden /> {busy === m.mode ? t('home.demo.starting') : m.title}
                  </button>
                ))}
              </div>
              {pickParty && (
                <div className="fb-pop space-y-3 rounded-2xl bg-white/70 p-3.5 ring-1 ring-line" data-testid="demo-party-pick">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold">{t('home.demo.partyHow')}</p>
                    <p className="text-xs leading-relaxed text-muted">{t('home.demo.soloHint')}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(['classic', 'scratch'] as const).map((s) => (
                      <button
                        key={s}
                        type="button"
                        className="btn-secondary !h-auto !items-start !justify-start !rounded-2xl !px-4 !py-3 text-start"
                        disabled={busy !== null}
                        onClick={() => startDemo('party', s)}
                        data-testid={`demo-party-${s}`}
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{busy === `party-${s}` ? t('home.demo.starting') : t(`new.style.${s}` as 'new.style.classic')}</span>
                          <span className="mt-0.5 block text-xs font-normal leading-snug text-muted">{t(`new.style.${s}.desc` as 'new.style.classic.desc')}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>

        <section className="mt-10" aria-labelledby="how-title">
          <h2 id="how-title" className="mb-4 flex items-center gap-2 font-display text-2xl font-semibold">
            <CalendarClock size={22} className="text-rose" aria-hidden /> {t('home.how.title')}
          </h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={i} className="card relative !p-5">
                <span className="absolute end-4 top-3 font-display text-5xl font-semibold text-rose/10">{i + 1}</span>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-soft text-rose-deep">
                  <s.icon size={20} aria-hidden />
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold">{s.title}</h3>
                <p className="mt-1 text-sm leading-snug text-muted">{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-10 space-y-1 text-center text-sm text-muted">
          <p>{t('home.footer')}</p>
          <p>
            <Link href="/privacy" className="underline underline-offset-4">{t('common.privacy')}</Link> · <Link href="/help/delete-data" className="underline underline-offset-4">{t('privacy.delete')}</Link>
          </p>
        </footer>
      </main>
    </>
  );
}
