'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Crosshair, RotateCcw } from 'lucide-react';
import { BackLink, ErrorBox, PageHeading, PageShell, Spinner, Stepper } from '@/components/Shell';
import { useI18n } from '@/components/I18nProvider';
import { api } from '@/lib/client/api';
import { useLoad } from '@/lib/client/hooks';
import { stageWindow, windowToCss } from '@/lib/crop';
import type { PhotoInfo } from '@/lib/client/types';

export function CropClient({ id }: { id: string }) {
  const { errText } = useI18n();
  const { data, error, reload } = useLoad(() => api<PhotoInfo>(`/api/photos/${id}`), [id]);
  return (
    <PageShell size="huge">
      {error ? <ErrorBox message={errText(error)} onRetry={reload} /> : !data ? <Spinner /> : <CropForm key={id} info={data} />}
    </PageShell>
  );
}

function CropForm({ info }: { info: PhotoInfo }) {
  const { t, errText } = useI18n();
  const router = useRouter();
  const p = info.puzzle;
  const [c, setC] = useState({ x: p.cropCenterX, y: p.cropCenterY });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const move = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    setC({ x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/api/photos/${p.id}`, { method: 'PATCH', body: { cropCenterX: c.x, cropCenterY: c.y } });
      router.push(info.nextId ? `/new/photo/${info.nextId}/details` : `/new/review?game=${info.gameId}`);
    } catch (e) {
      setErr(errText(e));
      setBusy(false);
    }
  }

  const first = stageWindow(p.width, p.height, c.x, c.y, 1);
  const stages = ([1, 2, 3, 4] as const).map((s) => ({ s, w: stageWindow(p.width, p.height, c.x, c.y, s) }));

  return (
    <div>
      <BackLink href={`/new/photo/${p.id}/details`} />
      <Stepper current={3} />
      <PageHeading title={t('crop.heading')} subtitle={t('crop.hint')} testId="crop-heading" />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
      <div className="polaroid !pb-2.5">
      <div
        ref={box}
        className="relative w-full cursor-crosshair touch-none select-none overflow-hidden rounded-[3px] bg-ink/5"
        style={{ aspectRatio: `${p.width} / ${p.height}` }}
        data-testid="crop-box"
        role="slider"
        tabIndex={0}
        aria-label={t('crop.target')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(c.x * 100)}
        aria-valuetext={`${Math.round(c.x * 100)}%, ${Math.round(c.y * 100)}%`}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); move(e); }}
        onPointerMove={(e) => dragging.current && move(e)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
        onKeyDown={(e) => {
          const d = { ArrowLeft: [-0.02, 0], ArrowRight: [0.02, 0], ArrowUp: [0, -0.02], ArrowDown: [0, 0.02] }[e.key];
          if (!d) return;
          e.preventDefault();
          setC((v) => ({ x: Math.min(1, Math.max(0, v.x + d[0])), y: Math.min(1, Math.max(0, v.y + d[1])) }));
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.urls.original} alt="" className="absolute inset-0 h-full w-full object-fill" draggable={false} />
        <div className="absolute rounded-md border-2 border-white shadow-[0_0_0_9999px_rgba(43,38,34,0.45)]" style={{ left: `${(first.left / p.width) * 100}%`, top: `${(first.top / p.height) * 100}%`, width: `${(first.width / p.width) * 100}%`, height: `${(first.height / p.height) * 100}%` }} />
        <div className="pointer-events-none absolute grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-gradient-to-br from-rose to-[#e0566f] text-white shadow-lg ring-4 ring-white" style={{ left: `${c.x * 100}%`, top: `${c.y * 100}%` }} data-testid="crop-target" data-cx={c.x.toFixed(3)} data-cy={c.y.toFixed(3)}>
          <Crosshair size={20} aria-hidden />
        </div>
      </div>
      </div>

      <div className="space-y-4">
      <section aria-label={t('crop.live')} className="card !p-4">
        <p className="eyebrow mb-3">{t('crop.live')}</p>
        <div className="grid grid-cols-2 gap-3" data-testid="crop-previews">
          {stages.map(({ s, w }) => (
            <figure key={s} className="space-y-1.5">
              <div className="relative w-full overflow-hidden rounded-2xl bg-ink/5 ring-1 ring-line" style={{ aspectRatio: `${w.width} / ${w.height}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.urls.original} alt="" className="absolute max-w-none" style={windowToCss(w, p.width, p.height)} draggable={false} />
              </div>
              <figcaption className="text-center text-xs font-semibold text-muted">{t('crop.stage', { n: s })}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {err && <ErrorBox message={err} />}
      <div className="grid grid-cols-[auto_1fr] gap-3">
        <button type="button" className="btn-secondary" onClick={() => setC({ x: 0.5, y: 0.5 })} data-testid="crop-reset"><RotateCcw size={18} aria-hidden /> {t('crop.reset')}</button>
        <button type="button" className="btn-primary" onClick={save} disabled={busy} data-testid="crop-save">{t('crop.save')}</button>
      </div>
      </div>
      </div>
    </div>
  );
}
