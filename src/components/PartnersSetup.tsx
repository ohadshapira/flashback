'use client';

import { useId, useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { WorldMap } from './WorldMap';
import { DateWheels } from './DateWheels';
import { useI18n } from './I18nProvider';
import { currentMonthYear, type MonthYear } from '@/lib/date';
import { PARTNERS_LIMITS, PLACE_ICONS, type PartnersProfile, type PlaceIcon } from '@/lib/partners';

type TFn = ReturnType<typeof useI18n>['t'];

/** A place while it is being set up: it may not be on the map yet. */
export type DraftPlace = { icon: PlaceIcon; label: string; lat: number | null; lng: number | null };

export type PartnersDraft = {
  childName: string;
  parentName: string;
  useBirth: boolean;
  birth: MonthYear;
  places: DraftPlace[];
};

/** Remembered on this device (not per session), so the next Partners game starts filled in. */
const STORAGE_KEY = 'fb:partners';

/** What a first-time user sees: three unplaced places, and a child about five years old. */
export function defaultPartnersDraft(t: TFn): PartnersDraft {
  const now = currentMonthYear();
  return {
    childName: '',
    parentName: '',
    useBirth: true,
    birth: { month: now.month, year: now.year - 5 },
    places: [
      { icon: '🏠', label: t('partners.default.home'), lat: null, lng: null },
      { icon: '👵', label: t('partners.default.grandma'), lat: null, lng: null },
      { icon: '🎒', label: t('partners.default.school'), lat: null, lng: null },
    ],
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Validates what came out of localStorage; anything unexpected means "no saved draft". */
function parseDraft(raw: unknown): PartnersDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const b = r.birth as Record<string, unknown> | undefined;
  if (typeof r.childName !== 'string' || typeof r.parentName !== 'string' || typeof r.useBirth !== 'boolean') return null;
  if (!b || !Number.isInteger(b.month) || !Number.isInteger(b.year)) return null;
  if (!Array.isArray(r.places) || r.places.length > PARTNERS_LIMITS.maxPlaces) return null;
  const places: DraftPlace[] = [];
  for (const p of r.places as Record<string, unknown>[]) {
    if (!p || typeof p.label !== 'string' || !(PLACE_ICONS as readonly unknown[]).includes(p.icon)) return null;
    const placed = isNum(p.lat) && isNum(p.lng);
    places.push({ icon: p.icon as PlaceIcon, label: p.label.slice(0, PARTNERS_LIMITS.labelMax), lat: placed ? (p.lat as number) : null, lng: placed ? (p.lng as number) : null });
  }
  return {
    childName: r.childName.slice(0, PARTNERS_LIMITS.nameMax),
    parentName: r.parentName.slice(0, PARTNERS_LIMITS.nameMax),
    useBirth: r.useBirth,
    birth: { month: b.month as number, year: b.year as number },
    places,
  };
}

/** The saved draft, or the defaults. Browser only: call it from an effect, never during server rendering. */
export function loadPartnersDraft(t: TFn): PartnersDraft {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return (raw ? parseDraft(JSON.parse(raw)) : null) ?? defaultPartnersDraft(t);
  } catch {
    return defaultPartnersDraft(t);
  }
}

export function savePartnersDraft(draft: PartnersDraft) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* private mode / quota: remembering is a convenience only */
  }
}

/** The profile the server takes, or null while a name is missing. Only places that are on the map are sent; an empty name falls back to the icon. */
export function draftToProfile(draft: PartnersDraft): PartnersProfile | null {
  const childName = draft.childName.trim();
  const parentName = draft.parentName.trim();
  if (!childName || !parentName) return null;
  const places = draft.places
    .filter((p): p is DraftPlace & { lat: number; lng: number } => p.lat !== null && p.lng !== null)
    .slice(0, PARTNERS_LIMITS.maxPlaces)
    .map((p) => ({ icon: p.icon, label: p.label.trim() || p.icon, lat: p.lat, lng: p.lng }));
  return { childName, parentName, birth: draft.useBirth ? draft.birth : null, places };
}

export function PartnersSetup({ draft, onChange }: { draft: PartnersDraft; onChange: (d: PartnersDraft) => void }) {
  const { t } = useI18n();
  const ids = useId();
  const [active, setActive] = useState(0);
  const current = draft.places[active] as DraftPlace | undefined;

  const setPlace = (i: number, patch: Partial<DraftPlace>) => onChange({ ...draft, places: draft.places.map((p, k) => (k === i ? { ...p, ...patch } : p)) });

  function addPlace() {
    if (draft.places.length >= PARTNERS_LIMITS.maxPlaces) return;
    const icon = PLACE_ICONS.find((ic) => !draft.places.some((p) => p.icon === ic)) ?? PLACE_ICONS[0];
    onChange({ ...draft, places: [...draft.places, { icon, label: '', lat: null, lng: null }] });
    setActive(draft.places.length);
  }

  function removeActive() {
    if (!current) return;
    onChange({ ...draft, places: draft.places.filter((_, k) => k !== active) });
    setActive(Math.max(0, Math.min(active, draft.places.length - 2)));
  }

  return (
    <div className="space-y-6" data-testid="partners-setup">
      <section className="card space-y-4" aria-labelledby={`${ids}-who`}>
        <h2 id={`${ids}-who`} className="eyebrow">{t('partners.setup.who')}</h2>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-muted">{t('partners.childName')}</span>
          <input className="field" value={draft.childName} maxLength={PARTNERS_LIMITS.nameMax} placeholder={t('partners.childPlaceholder')} onChange={(e) => onChange({ ...draft, childName: e.target.value })} data-testid="partners-child" autoComplete="off" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-semibold text-muted">{t('partners.parentName')}</span>
          <input className="field" value={draft.parentName} maxLength={PARTNERS_LIMITS.nameMax} placeholder={t('partners.parentPlaceholder')} onChange={(e) => onChange({ ...draft, parentName: e.target.value })} data-testid="partners-parent" autoComplete="off" />
        </label>

        <div className="space-y-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-[#d24b62]" checked={draft.useBirth} onChange={(e) => onChange({ ...draft, useBirth: e.target.checked })} data-testid="partners-use-birth" />
            <span className="font-medium">{t('partners.useBirth')}</span>
          </label>
          {draft.useBirth && (
            <div className="space-y-2">
              <p className="text-sm leading-snug text-muted">{t('partners.birthHint')}</p>
              <DateWheels value={draft.birth} onChange={(birth) => onChange({ ...draft, birth })} rows={3} />
            </div>
          )}
        </div>
        <p className="text-xs text-muted">{t('partners.setup.saved')}</p>
      </section>

      <section className="card space-y-4" aria-labelledby={`${ids}-places`}>
        <h2 id={`${ids}-places`} className="eyebrow">{t('partners.places')}</h2>
        <p className="text-sm leading-snug text-muted">{t('partners.placesHint')}</p>

        <div className="flex flex-wrap gap-2">
          {draft.places.map((p, i) => {
            const placed = p.lat !== null && p.lng !== null;
            return (
              <button
                key={i}
                type="button"
                aria-pressed={i === active}
                onClick={() => setActive(i)}
                data-testid={`place-chip-${i}`}
                className={`inline-flex min-h-11 items-center gap-2 rounded-full border-2 bg-white px-3.5 text-sm font-semibold transition ${i === active ? 'border-rose ring-2 ring-rose/25' : 'border-line'}`}
              >
                <span className="text-xl" aria-hidden>{p.icon}</span>
                <span className="max-w-[9rem] truncate" dir="auto">{p.label || p.icon}</span>
                {placed ? (
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-good text-white" title={t('partners.placed')}><Check size={12} strokeWidth={3} aria-hidden /><span className="sr-only">{t('partners.placed')}</span></span>
                ) : (
                  <span className="h-5 w-5 rounded-full border-2 border-dashed border-muted/60" title={t('partners.notPlaced')}><span className="sr-only">{t('partners.notPlaced')}</span></span>
                )}
              </button>
            );
          })}
          {draft.places.length < PARTNERS_LIMITS.maxPlaces && (
            <button type="button" className="btn-secondary !min-h-11 !px-4 text-sm" onClick={addPlace} data-testid="partners-add-place">
              <Plus size={16} aria-hidden /> {t('partners.addPlace')}
            </button>
          )}
        </div>

        {current && (
          <div className="space-y-3 rounded-2xl bg-white/70 p-3.5 ring-1 ring-line" data-testid="place-editor">
            <div className="flex items-end gap-2">
              <label className="block min-w-0 flex-1 space-y-1">
                <span className="text-sm font-semibold text-muted">{t('partners.placeName')}</span>
                <input className="field" value={current.label} maxLength={PARTNERS_LIMITS.labelMax} onChange={(e) => setPlace(active, { label: e.target.value })} data-testid="place-label" autoComplete="off" />
              </label>
              <button type="button" className="btn-ghost !min-h-11 shrink-0 text-rose-deep" onClick={removeActive} aria-label={t('partners.removePlace')} title={t('partners.removePlace')} data-testid="place-remove">
                <Trash2 size={18} aria-hidden />
              </button>
            </div>
            <div role="radiogroup" aria-label={t('partners.placeIcon')} className="grid grid-cols-6 gap-1.5">
              {PLACE_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  role="radio"
                  aria-checked={current.icon === ic}
                  aria-label={ic}
                  onClick={() => setPlace(active, { icon: ic })}
                  className={`grid h-11 place-items-center rounded-xl border-2 bg-white text-2xl transition ${current.icon === ic ? 'border-rose ring-2 ring-rose/25' : 'border-line'}`}
                >
                  <span aria-hidden>{ic}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="relative h-[22rem] overflow-hidden rounded-[22px] border border-line">
          <WorldMap
            className="absolute inset-0"
            pin={null}
            onPinChange={(p) => current && setPlace(active, { lat: p.lat, lng: p.lng })}
            onPlaceTap={setActive}
            places={draft.places.map((p, i) => ({ lat: p.lat, lng: p.lng, icon: p.icon, label: p.label || p.icon, active: i === active }))}
            ariaLabel={t('partners.mapLabel')}
          />
          {current && (
            <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center px-12">
              <div className="max-w-full rounded-2xl bg-ink/85 px-4 py-2 text-center text-sm font-medium text-white shadow-lg backdrop-blur" data-testid="place-map-hint" aria-live="polite">
                {t('partners.tapToPlace', { place: `${current.icon} ${current.label || current.icon}` })}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
