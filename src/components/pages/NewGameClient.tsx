'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { Check, Heart, HeartHandshake, PartyPopper, Users } from 'lucide-react';
import { BackLink, ErrorBox, PageHeading, PageShell, Stepper } from '@/components/Shell';
import { useI18n } from '@/components/I18nProvider';
import { api } from '@/lib/client/api';
import { LIMITS } from '@/lib/config';
import { PartnersSetup, defaultPartnersDraft, draftToProfile, loadPartnersDraft, savePartnersDraft, type PartnersDraft } from '@/components/PartnersSetup';
import type { GameMeta } from '@/lib/client/types';

/** `partners` is a pseudo-mode: the server stores it as a family_shared game plus a profile. */
type Mode = 'couple' | 'family_shared' | 'party' | 'partners';

export function NewGameClient({ initialMode, swap }: { initialMode: Mode; swap: boolean }) {
  const { t, errText } = useI18n();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [title, setTitle] = useState('');
  const [style, setStyle] = useState<'classic' | 'scratch'>('classic');
  const [count, setCount] = useState<number>(LIMITS.defaultPhotos);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partners, setPartners] = useState<PartnersDraft>(() => defaultPartnersDraft(t));

  // The saved Partners profile is read after mount (no storage access while rendering on the server).
  useEffect(() => {
    setPartners(loadPartnersDraft(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  const options: { id: Mode; label: string; desc: string; icon: typeof Heart; tint: string }[] = [
    { id: 'couple', label: t('new.mode.couple'), desc: t('home.couple.desc'), icon: Heart, tint: 'from-rose to-apricot' },
    { id: 'family_shared', label: t('new.mode.family'), desc: t('home.family.desc'), icon: Users, tint: 'from-blue to-blue-deep' },
    { id: 'party', label: t('new.mode.party'), desc: t('home.party.desc'), icon: PartyPopper, tint: 'from-apricot to-[#e3a23a]' },
    { id: 'partners', label: t('new.mode.partners'), desc: t('home.partners.desc'), icon: HeartHandshake, tint: 'from-good to-[#5fae86]' },
  ];

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    const profile = mode === 'partners' ? draftToProfile(partners) : null;
    if (mode === 'partners' && !profile) return void setError(t('partners.needNames'));
    setBusy(true);
    try {
      if (profile) savePartnersDraft(partners);
      const g = await api<GameMeta>('/api/games', {
        body: profile
          ? { mode: 'family_shared', partners: profile, title: title || undefined, targetCount: count }
          : { mode, title: title || undefined, targetCount: count, style: mode === 'party' ? style : undefined },
      });
      router.push(`/new/photos?game=${g.id}`);
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  }

  return (
    <PageShell>
      <BackLink href="/" />
      <Stepper current={1} />
      <PageHeading title={t('new.title')} subtitle={t('new.subtitle')} />
      {swap && <p className="mb-4 rounded-2xl bg-rose-soft p-4 font-medium text-rose-deep" data-testid="swap-banner">{t('new.swapBanner')}</p>}
      <form onSubmit={create} className="space-y-6">
        <fieldset className="space-y-2.5">
          <legend className="eyebrow mb-2">{t('new.mode')}</legend>
          {options.map((o) => (
            <label
              key={o.id}
              className={`card relative flex cursor-pointer items-center gap-4 !p-4 transition duration-200 hover:-translate-y-0.5 ${mode === o.id ? '!border-rose/60 !bg-white shadow-(--shadow-lift) ring-2 ring-rose/25' : ''}`}
            >
              <input type="radio" name="mode" value={o.id} checked={mode === o.id} onChange={() => setMode(o.id)} className="peer sr-only" data-testid={`mode-radio-${o.id}`} />
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br ${o.tint} text-white shadow-md`}><o.icon size={22} aria-hidden /></span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-semibold leading-tight">{o.label}</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted">{o.desc}</span>
              </span>
              <span aria-hidden className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${mode === o.id ? 'border-rose bg-rose text-white' : 'border-line bg-white'}`}>
                {mode === o.id && <Check size={14} strokeWidth={3} />}
              </span>
              <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[28px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue" />
            </label>
          ))}
        </fieldset>

        {mode === 'partners' && <PartnersSetup draft={partners} onChange={setPartners} />}

        {mode === 'party' && (
          <fieldset className="space-y-2.5" data-testid="style-picker">
            <legend className="eyebrow mb-2">{t('new.style')}</legend>
            {(['classic', 'scratch'] as const).map((s) => (
              <label key={s} className={`card relative flex cursor-pointer items-start gap-3 !p-4 transition duration-200 hover:-translate-y-0.5 ${style === s ? '!border-rose/60 !bg-white shadow-(--shadow-lift) ring-2 ring-rose/25' : ''}`}>
                <input type="radio" name="style" value={s} checked={style === s} onChange={() => setStyle(s)} className="peer sr-only" data-testid={`style-radio-${s}`} />
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg font-semibold leading-tight">{t(`new.style.${s}` as 'new.style.classic')}</span>
                  <span className="mt-0.5 block text-sm leading-snug text-muted">{t(`new.style.${s}.desc` as 'new.style.classic.desc')}</span>
                </span>
                <span aria-hidden className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 transition ${style === s ? 'border-rose bg-rose text-white' : 'border-line bg-white'}`}>
                  {style === s && <Check size={14} strokeWidth={3} />}
                </span>
                <span aria-hidden className="pointer-events-none absolute inset-0 rounded-[28px] peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue" />
              </label>
            ))}
          </fieldset>
        )}

        <label className="block space-y-1">
          <span className="text-sm font-semibold text-muted">{t('new.gameName')} <span className="font-normal">({t('common.optional')})</span></span>
          <input className="field" value={title} maxLength={LIMITS.titleMax} placeholder={t('new.gameNamePlaceholder')} onChange={(e) => setTitle(e.target.value)} data-testid="game-title" />
        </label>

        <label className="block space-y-1">
          <span className="text-sm font-semibold text-muted">{t('new.photoCount')}</span>
          <select className="field" value={count} onChange={(e) => setCount(Number(e.target.value))} data-testid="photo-count">
            {Array.from({ length: LIMITS.maxPhotos - LIMITS.minPhotos + 1 }, (_, i) => LIMITS.minPhotos + i).map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
          <span className="text-sm text-muted">{t('new.photoCountHint', { min: LIMITS.minPhotos, max: LIMITS.maxPhotos })}</span>
        </label>

        {error && <ErrorBox message={error} />}
        <button className="btn-primary w-full !py-3.5 text-lg" type="submit" disabled={busy} data-testid="create-game">
          {t('new.create')}
        </button>
      </form>
    </PageShell>
  );
}
