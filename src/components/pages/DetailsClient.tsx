'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Calendar, MapPin } from 'lucide-react';
import { BackLink, ErrorBox, PageHeading, PageShell, Spinner, Stepper } from '@/components/Shell';
import { MapWheelStage } from '@/components/MapWheelStage';
import { neutralMonthYear } from '@/components/DateWheels';
import { useI18n } from '@/components/I18nProvider';
import { api, safeStore } from '@/lib/client/api';
import { useLoad } from '@/lib/client/hooks';
import { formatMonthYear, type MonthYear } from '@/lib/date';
import { LIMITS } from '@/lib/config';
import type { PhotoInfo, Pin } from '@/lib/client/types';

type Draft = { pin: Pin | null; date: MonthYear; title: string; story: string };

export function DetailsClient({ id }: { id: string }) {
  const { t, errText } = useI18n();
  const { data, error, reload } = useLoad(() => api<PhotoInfo>(`/api/photos/${id}`), [id]);
  return (
    <PageShell size="huge">
      {error ? (
        <ErrorBox message={errText(error)} onRetry={reload} />
      ) : !data ? (
        <Spinner />
      ) : (
        <DetailsForm key={id} info={data} />
      )}
      <span className="sr-only">{t('details.sub')}</span>
    </PageShell>
  );
}

function DetailsForm({ info }: { info: PhotoInfo }) {
  const { t, intl, errText } = useI18n();
  const router = useRouter();
  const p = info.puzzle;
  const key = `fb:draft:${p.id}`;

  const sug = p.suggestion;
  const sugDate = sug && sug.year && sug.month ? { month: sug.month, year: sug.year } : null;
  const sugPin = sug && sug.lat !== null && sug.lng !== null ? { lat: sug.lat, lng: sug.lng } : null;

  // Autosaved draft (sessionStorage) wins over the saved answer so unsaved edits survive reloads.
  const [restored] = useState(() => safeStore.get<Draft>(key));
  // A photo the host has not answered yet starts from what the photo itself says (its date, and its place when the file has one).
  // This is the HOST's own screen; players never see it. The host can change everything and still has to confirm.
  const prefilled = !restored && !p.answer && !!(sugDate || sugPin);
  const [draft, setDraftState] = useState<Draft>(
    () =>
      restored ?? {
        pin: p.answer ? { lat: p.answer.lat, lng: p.answer.lng } : sugPin,
        date: p.answer ? { month: p.answer.month, year: p.answer.year } : (sugDate ?? neutralMonthYear()),
        title: p.title ?? '',
        story: p.story ?? '',
      },
  );
  const setDraft = (d: Draft) => {
    setDraftState(d);
    safeStore.set(key, d);
  };
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [focus, setFocus] = useState<(Pin & { nonce: number }) | null>(() => (prefilled && sugPin ? { ...sugPin, nonce: 1 } : null));

  async function confirm() {
    if (!draft.pin || busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/photos/${p.id}`, {
        method: 'PATCH',
        body: { answer: { lat: draft.pin.lat, lng: draft.pin.lng, month: draft.date.month, year: draft.date.year }, title: draft.title || null, story: draft.story || null },
      });
      safeStore.del(key);
      router.push(`/new/photo/${p.id}/crop`);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  return (
    <div>
      <BackLink href={`/new/photos?game=${info.gameId}`} />
      <Stepper current={3} />
      <PageHeading title={t('details.heading', { n: info.index + 1, total: info.total })} subtitle={t('details.sub')} testId="details-heading" />
      {restored && <p className="chip mb-4 bg-blue-soft text-blue-deep">{t('details.draftRestored')}</p>}
      {prefilled && (
        <p className="chip mb-4 whitespace-normal bg-blue-soft text-blue-deep" data-testid="prefilled-note">
          {sugDate && sugPin ? t('details.prefilledBoth') : sugDate ? t(p.source === 'google_photos' ? 'details.prefilledDateGoogle' : 'details.prefilledDate') : t('details.prefilledPlace')}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="space-y-4">
          <div className="polaroid !pb-3">
            {/* The host sees the full original while setting the answer. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.urls.original} alt={t('details.original')} className="max-h-72 w-full rounded-[3px] bg-ink/5 object-contain lg:max-h-[420px]" data-testid="original-photo" />
          </div>
          <div className="card space-y-3 !p-4">
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-muted">{t('details.titleField')} <span className="font-normal">({t('common.optional')})</span></span>
              <input className="field" value={draft.title} maxLength={LIMITS.titleMax} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-testid="memory-title" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold text-muted">{t('details.storyField')} <span className="font-normal">({t('common.optional')})</span></span>
              <textarea className="field min-h-20" value={draft.story} maxLength={LIMITS.storyMax} placeholder={t('details.storyPlaceholder')} onChange={(e) => setDraft({ ...draft, story: e.target.value })} data-testid="memory-story" />
            </label>
          </div>

          {(sugDate || sugPin) && (
            <div className="card space-y-2 !p-4" data-testid="suggestions">
              <p className="text-sm text-muted">{t('details.suggestNote')}</p>
              <div className="flex flex-wrap gap-2">
                {sugDate && (
                  <button type="button" className="btn-secondary !min-h-10 text-sm" onClick={() => setDraft({ ...draft, date: sugDate })} data-testid="use-suggested-date">
                    <Calendar size={16} aria-hidden /> {t('details.useDate', { date: formatMonthYear(sugDate, intl) })}
                  </button>
                )}
                {sugPin && (
                  <button
                    type="button"
                    className="btn-secondary !min-h-10 text-sm"
                    onClick={() => {
                      setDraft({ ...draft, pin: sugPin });
                      setFocus({ ...sugPin, nonce: Date.now() });
                    }}
                    data-testid="use-suggested-place"
                  >
                    <MapPin size={16} aria-hidden /> {t('details.usePlace')}
                  </button>
                )}
              </div>
            </div>
          )}
          {err && <ErrorBox message={err} />}
        </div>

        <div className="-mx-4 h-[min(88dvh,760px)] overflow-hidden border-y border-line shadow-(--shadow-lift) sm:mx-0 sm:rounded-[28px] sm:border lg:sticky lg:top-4">
          <MapWheelStage
            className="h-full w-full"
            mode="answer"
            pin={draft.pin}
            onPinChange={(pin) => setDraft({ ...draft, pin })}
            date={draft.date}
            onDateChange={(date) => setDraft({ ...draft, date })}
            onConfirm={confirm}
            confirmLabel={t('details.confirm')}
            title={t('stage.whenWhere')}
            busy={busy}
            focus={focus}
            partners={info.partners ? { profile: info.partners } : null}
          />
        </div>
      </div>
    </div>
  );
}
