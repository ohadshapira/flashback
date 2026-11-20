'use client';

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, CheckCircle2, CircleAlert, Image as ImageIcon, Pencil, Trash2, Upload } from 'lucide-react';
import { BackLink, ErrorBox, PageHeading, PageShell, Spinner, Stepper } from '@/components/Shell';
import { GooglePhotosPanel } from '@/components/GooglePhotosPanel';
import { useI18n } from '@/components/I18nProvider';
import { api, ApiClientError } from '@/lib/client/api';
import { useLoad } from '@/lib/client/hooks';
import { LIMITS } from '@/lib/config';
import type { HostSetup } from '@/lib/client/types';
import type { MessageKey } from '@/i18n';

export function PhotosClient({ gameId, googleFlag }: { gameId: string; googleFlag: string | null }) {
  const { t, errText } = useI18n();
  const router = useRouter();
  const { data, error, reload } = useLoad(() => api<HostSetup>(`/api/games/${gameId}/setup`), [gameId]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<{ name: string; code: string }[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const puzzles = data?.puzzles ?? [];
  const room = LIMITS.maxPhotos - puzzles.length;
  const ready = puzzles.length >= LIMITS.minPhotos;
  const firstOpen = puzzles.find((p) => !p.confirmed);

  const upload = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setFailures([]);
      setErr(null);
      setUploading({ done: 0, total: files.length });
      const fails: { name: string; code: string }[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        try {
          const form = new FormData();
          form.append('files', f);
          await api(`/api/games/${gameId}/photos/upload`, { form });
        } catch (e) {
          fails.push({ name: f.name, code: e instanceof ApiClientError ? e.code : 'generic' });
        }
        setUploading({ done: i + 1, total: files.length });
        await reload();
      }
      setFailures(fails);
      setUploading(null);
    },
    [gameId, reload],
  );

  async function mutate(fn: () => Promise<unknown>) {
    setErr(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setErr(errText(e));
    }
  }

  const move = (i: number, d: -1 | 1) => {
    const ids = puzzles.map((p) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    return mutate(() => api(`/api/games/${gameId}/photos/reorder`, { body: { ids } }));
  };

  const reason = (code: string) => {
    const k = `err.${code}` as MessageKey;
    return t(k in { 'err.file_too_large': 1, 'err.unsupported_heic': 1, 'err.unsupported_type': 1, 'err.invalid_image': 1, 'err.duplicate_photo': 1, 'err.too_many_photos': 1, 'err.rate_limited': 1 } ? k : 'err.generic');
  };

  async function deleteGame() {
    if (!window.confirm(t('summary.confirmDelete'))) return;
    await api(`/api/games/${gameId}`, { method: 'DELETE' }).catch(() => undefined);
    router.push('/');
  }

  if (!gameId) return <PageShell><ErrorBox message={t('err.not_found')} /></PageShell>;

  return (
    <PageShell wide>
      <BackLink href={data ? `/new?mode=${data.game.mode === 'family_shared' ? 'family-shared' : data.game.mode}` : '/new'} />
      <Stepper current={2} />
      <PageHeading title={t('photos.title')} subtitle={t('photos.subtitle')} />
      {data && (
        <div className="-mt-2 mb-5 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-gradient-to-r from-rose to-apricot transition-all duration-500" style={{ width: `${Math.min(100, (puzzles.length / LIMITS.maxPhotos) * 100)}%` }} />
          </div>
          <p className="shrink-0 text-sm font-semibold text-muted" data-testid="photo-count-label">{t('photos.count', { n: puzzles.length, max: LIMITS.maxPhotos, min: LIMITS.minPhotos })}</p>
        </div>
      )}

      {error ? (
        error instanceof ApiClientError && error.code === 'answers_locked' ? (
          <ErrorBox message={t('err.answers_locked')} />
        ) : (
          <ErrorBox message={errText(error)} onRetry={reload} />
        )
      ) : !data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className={`card flex flex-col items-start gap-3 !border-2 !border-dashed !border-rose/30 transition ${dragOver ? '!border-rose !bg-rose-soft/60' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); void upload([...e.dataTransfer.files].slice(0, room)); }}
            >
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rose to-apricot text-white shadow-md"><Upload size={22} aria-hidden /></span>
                <div>
                  <p className="font-display text-lg font-semibold leading-tight">{t('photos.upload')}</p>
                  <p className="text-sm text-muted">{t('photos.uploadHint')}</p>
                  <p className="text-xs text-muted/80">{t('photos.dropHere')}</p>
                </div>
              </div>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                data-testid="file-input"
                onChange={(e) => { void upload([...(e.target.files ?? [])].slice(0, Math.max(room, 0))); e.target.value = ''; }}
              />
              <button type="button" className="btn-primary w-full" disabled={!!uploading || room < 1} onClick={() => fileInput.current?.click()} data-testid="upload-button">
                {uploading ? t('photos.uploading') + ` ${uploading.done}/${uploading.total}` : t('photos.upload')}
              </button>
            </div>
            <GooglePhotosPanel gameId={gameId} onImported={reload} flag={googleFlag} room={room} days={data.game.retentionDays} />
          </div>

          {failures.length > 0 && (
            <ul className="space-y-1 rounded-2xl bg-rose-soft p-3 text-sm text-rose-deep" role="alert" data-testid="upload-failures">
              {failures.map((f, i) => <li key={i}>{t('photos.failed', { name: f.name, reason: reason(f.code) })}</li>)}
            </ul>
          )}
          {err && <ErrorBox message={err} />}

          {puzzles.length === 0 ? (
            <div className="card grid place-items-center gap-2 !py-10 text-center text-muted" data-testid="photos-empty">
              <span className="grid h-14 w-14 place-items-center rounded-full bg-rose-soft text-rose-deep"><ImageIcon size={26} aria-hidden /></span>
              <p className="max-w-xs">{t('photos.empty')}</p>
            </div>
          ) : (
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3 fb-stagger" data-testid="photo-list">
              {puzzles.map((p, i) => (
                <li key={p.id} className="group relative overflow-hidden rounded-[22px] bg-white p-1.5 pb-2 shadow-(--shadow-soft) ring-1 ring-line/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-(--shadow-lift)" data-testid="photo-item">
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.urls.thumb} alt="" className="aspect-[4/3] w-full rounded-[16px] object-cover" />
                    <span className="absolute start-2 top-2 grid h-6 min-w-6 place-items-center rounded-full bg-ink/75 px-1.5 text-xs font-bold text-white">{i + 1}</span>
                    <button type="button" className="absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-rose-deep shadow transition hover:bg-white" onClick={() => mutate(() => api(`/api/photos/${p.id}`, { method: 'DELETE' }))} aria-label={t('photos.remove')} data-testid="remove-photo"><Trash2 size={16} /></button>
                  </div>
                  <div className="flex items-center justify-between gap-1 px-1.5 pt-2">
                    <span className={`chip ${p.confirmed ? 'bg-good-soft text-good' : 'bg-warn-soft text-warn'}`}>
                      {p.confirmed ? <CheckCircle2 size={13} aria-hidden /> : <CircleAlert size={13} aria-hidden />} {p.confirmed ? t('photos.ready') : t('photos.needsAnswer')}
                    </span>
                    <div className="flex items-center">
                      <button type="button" className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-blue-soft disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('photos.moveEarlier')}><ArrowUp size={16} /></button>
                      <button type="button" className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:bg-blue-soft disabled:opacity-30" disabled={i === puzzles.length - 1} onClick={() => move(i, 1)} aria-label={t('photos.moveLater')}><ArrowDown size={16} /></button>
                    </div>
                  </div>
                  <Link href={`/new/photo/${p.id}/details`} className="btn-ghost mx-1 mt-1 !min-h-9 w-[calc(100%-0.5rem)] text-sm" data-testid="edit-photo"><Pencil size={14} aria-hidden /> {t('photos.edit')}</Link>
                </li>
              ))}
            </ol>
          )}

          <div className="sticky bottom-3 z-20 space-y-1 rounded-[28px] border border-white/80 bg-paper/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_18px_40px_-14px_rgba(38,26,29,0.4)]">
            {ready ? (
              <Link
                href={firstOpen ? `/new/photo/${firstOpen.id}/details` : `/new/review?game=${gameId}`}
                className="btn-primary w-full !py-3.5 text-lg"
                data-testid="photos-continue"
              >
                {firstOpen ? t('photos.firstUnanswered') : t('photos.review')}
              </Link>
            ) : (
              <button className="btn-primary w-full !py-3.5 text-lg" disabled data-testid="photos-continue">{t('photos.count', { n: puzzles.length, max: LIMITS.maxPhotos, min: LIMITS.minPhotos })}</button>
            )}
            <button type="button" className="btn-ghost w-full !min-h-9 text-sm text-rose-deep" onClick={deleteGame}>{t('photos.deleteGame')}</button>
          </div>
        </div>
      )}
    </PageShell>
  );
}
