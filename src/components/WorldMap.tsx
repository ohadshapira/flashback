'use client';

import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Map as MLMap, MapOptions, Marker as MLMarker } from 'maplibre-gl';
import { clampLat, normalizeLng, unwrapLng } from '@/lib/geo';
import { resolveMapStart, WORLD_START } from '@/lib/mapStart';
import { PARTNERS_LIMITS } from '@/lib/partners';
import { useI18n } from './I18nProvider';
import type { Pin } from '@/lib/client/types';

/** A family place drawn as a big emoji icon with its name (Partners games). Places without coordinates are skipped. */
export type MapPlace = { lat: number | null; lng: number | null; icon: string; label: string; active?: boolean };

type Props = {
  pin: Pin | null;
  onPinChange?: (p: Pin) => void;
  /** Display-only: no placing, no dragging (reveal screen). */
  readOnly?: boolean;
  /** Correct location, drawn as a second pin with a line to `pin` (reveal screen). */
  truth?: Pin | null;
  /** Fit the viewport to the pin(s) instead of showing the neutral world view. */
  fit?: boolean;
  /** Space covered by overlays at the bottom (px), so controls/fit stay visible. */
  bottomInset?: number;
  /** Fly to this location (e.g. when the host applies a suggestion). Change `nonce` to re-trigger. */
  focus?: (Pin & { nonce: number }) | null;
  /** Family places drawn as tappable icons. */
  places?: MapPlace[];
  /** A tap on a place icon (or a tap / drop within a few px of one with `snapToPlaces`). */
  onPlaceTap?: (index: number) => void;
  /** Taps and drops near a place go to `onPlaceTap` instead of placing a free pin. */
  snapToPlaces?: boolean;
  ariaLabel: string;
  className?: string;
};

/** Free, key-less vector tiles (OpenStreetMap data, https://openfreemap.org). Attribution is added automatically by the style. */
const DEFAULT_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/** Offline fallback: bundled Natural Earth country outlines (public domain). */
function localStyle(): NonNullable<MapOptions['style']> {
  return {
    version: 8,
    sources: { world: { type: 'geojson', data: `${window.location.origin}/world-110m.json`, attribution: 'Natural Earth' } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#d6e4ec' } },
      { id: 'land', type: 'fill', source: 'world', paint: { 'fill-color': '#f6eee0' } },
      { id: 'borders', type: 'line', source: 'world', paint: { 'line-color': '#c2b49b', 'line-width': 0.7 } },
    ],
  } as NonNullable<MapOptions['style']>;
}

/** NEXT_PUBLIC_MAP_STYLE_URL > MapTiler key > OpenFreeMap (default) with automatic offline fallback. "local" forces the bundled style. */
function resolveStyle(): { style: NonNullable<MapOptions['style']>; remote: boolean } {
  const url = process.env.NEXT_PUBLIC_MAP_STYLE_URL;
  const key = process.env.NEXT_PUBLIC_MAPTILER_KEY;
  if (url === 'local') return { style: localStyle(), remote: false };
  if (url) return { style: url, remote: true };
  if (key) return { style: `https://api.maptiler.com/maps/streets-v2/style.json?key=${key}`, remote: true };
  return { style: DEFAULT_STYLE_URL, remote: true };
}

function placeElement(p: MapPlace, i: number, onTap: (i: number) => void): HTMLElement {
  // The label is user text: DOM APIs and textContent only, never innerHTML.
  const el = document.createElement('button');
  el.type = 'button';
  el.className = `fb-place${p.active ? ' is-active' : ''}`;
  el.dataset.testid = `place-marker-${i}`;
  el.setAttribute('aria-label', p.label);
  const icon = document.createElement('span');
  icon.className = 'fb-place-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = p.icon;
  const label = document.createElement('span');
  label.className = 'fb-place-label';
  label.dir = 'auto';
  label.textContent = p.label;
  el.append(icon, label);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onTap(i);
  });
  return el;
}

function pinElement(kind: 'guess' | 'truth', testId: string): HTMLElement {
  const [from, to] = kind === 'truth' ? ['#3f9a6f', '#2a6f4f'] : ['#ee6a7d', '#c13a55'];
  const gid = `pg-${kind}`;
  const el = document.createElement('div');
  el.dataset.testid = testId;
  el.className = 'fb-pin';
  // position:absolute (not relative): an inline `relative` overrides MapLibre's `.maplibregl-marker { position:absolute }`,
  // so every marker added after another one joins the normal flow and is drawn lower by the previous marker's height
  // (the reveal's truth pin sat 60 px below its real spot). z-index keeps the pin above the place icons.
  el.style.cssText = `width:48px;height:60px;position:absolute;z-index:2;display:flex;align-items:flex-end;justify-content:center;cursor:grab;touch-action:none;color:${to};`;
  el.innerHTML = `<span class="fb-pin-pulse"></span><svg width="42" height="54" viewBox="0 0 38 50" aria-hidden="true" style="position:relative;filter:drop-shadow(0 5px 4px rgba(40,10,20,.35))"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><path d="M19 49C19 49 3 30 3 18a16 16 0 0 1 32 0c0 12-16 31-16 31z" fill="url(#${gid})" stroke="#fff" stroke-width="2.5"/><circle cx="19" cy="18" r="6.2" fill="#fff"/></svg>`;
  return el;
}

const wrapPin = (p: { lat: number; lng: number }): Pin => ({ lat: clampLat(p.lat), lng: normalizeLng(p.lng) });

export function WorldMap({ pin, onPinChange, readOnly, truth, fit, bottomInset = 0, focus, places, onPlaceTap, snapToPlaces, ariaLabel, className }: Props) {
  const { dir, t } = useI18n();
  const wrapper = useRef<HTMLDivElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null);
  const guessMarker = useRef<MLMarker | null>(null);
  const truthMarker = useRef<MLMarker | null>(null);
  const placeMarkers = useRef<MLMarker[]>([]);
  const [ready, setReady] = useState(false);

  // Always-fresh callbacks/flags for event handlers registered once.
  const cb = useRef({ onPinChange, readOnly: !!readOnly, places, onPlaceTap, snapToPlaces: !!snapToPlaces, bottomInset, fit: !!fit });
  cb.current = { onPinChange, readOnly: !!readOnly, places, onPlaceTap, snapToPlaces: !!snapToPlaces, bottomInset, fit: !!fit };

  /** The place whose icon is within snapPx of a screen point (nearest wins), if snapping is on. */
  const placeNear = (map: MLMap, pt: { x: number; y: number }): number => {
    const { places: ps, snapToPlaces: snap } = cb.current;
    if (!snap || !ps) return -1;
    let best = -1;
    let bestD: number = PARTNERS_LIMITS.snapPx;
    ps.forEach((p, i) => {
      if (p.lat === null || p.lng === null) return;
      const q = map.project([p.lng, p.lat]);
      const d = Math.hypot(q.x - pt.x, q.y - pt.y);
      if (d <= bestD) {
        best = i;
        bestD = d;
      }
    });
    return best;
  };

  /* ---- create the map once ---- */
  useEffect(() => {
    let cancelled = false;
    let map: MLMap | undefined;
    (async () => {
      const ml = await import('maplibre-gl');
      if (cancelled || !container.current) return;
      mlRef.current = ml;
      ml.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
      const { style, remote } = resolveStyle();
      const width = container.current.clientWidth || 360;
      // Neutral world-scale start (used by the reveal map, which fits to the pins, and as the NEXT_PUBLIC_MAP_START=world mode).
      const worldZoom = Math.max(-0.3, Math.log2(width / 512) + 0.35);
      // Otherwise open on the player's own region (device-local; see lib/mapStart). The reveal screen fits to its pins anyway.
      const start = fit ? WORLD_START : await resolveMapStart();
      if (cancelled || !container.current) return;
      const regional = start.source !== 'world';
      // wider maps (desktop) show a bigger area at the same zoom, so tighten slightly to keep a similar ground extent
      const zoom = regional ? start.zoom + 0.5 * Math.log2(Math.max(1, width / 375)) : worldZoom;
      map = new ml.Map({
        container: container.current,
        style,
        center: regional ? [start.lng, start.lat] : [10, 22],
        zoom,
        minZoom: -0.5,
        maxZoom: 18,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        keyboard: false, // we provide a pin-aware keyboard handler below
        renderWorldCopies: true,
        locale: { 'NavigationControl.ZoomIn': t('map.zoomIn'), 'NavigationControl.ZoomOut': t('map.zoomOut') },
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new ml.AttributionControl({ compact: true }), dir === 'rtl' ? 'bottom-left' : 'bottom-right');
      map.addControl(new ml.NavigationControl({ showCompass: false, showZoom: true }), dir === 'rtl' ? 'top-left' : 'top-right');

      let fellBack = false;
      map.on('error', () => {
        // Remote style unreachable (offline / blocked): fall back to the bundled outline map once.
        if (remote && !fellBack && !map!.isStyleLoaded()) {
          fellBack = true;
          map!.setStyle(localStyle());
        }
      });
      map.on('click', (e) => {
        if (cb.current.readOnly) return;
        if ((e.originalEvent?.target as HTMLElement | null)?.closest?.('.fb-pin, .fb-place')) return;
        const near = placeNear(map!, e.point);
        if (near >= 0) return void cb.current.onPlaceTap?.(near);
        cb.current.onPinChange?.(wrapPin(e.lngLat.wrap()));
      });
      map.on('load', () => {
        // The compact credit starts expanded and only collapses after the first interaction; on read-only maps that never
        // happens and it covers the map. Collapse it to the "i" button (the credit stays one tap away).
        const attrib = container.current?.querySelector('.maplibregl-ctrl-attrib');
        attrib?.removeAttribute('open');
        attrib?.classList.remove('maplibregl-compact-show');
        // Partners: open fitted to the family's places (clear of the hint bubble), unless the caller fits to pins itself.
        const { places: ps, fit: fitPins, bottomInset: inset } = cb.current;
        const placed = (ps ?? []).filter((p): p is MapPlace & { lat: number; lng: number } => p.lat !== null && p.lng !== null);
        if (!fitPins && placed.length === 1) map!.jumpTo({ center: [placed[0].lng, placed[0].lat], zoom: 11 });
        else if (!fitPins && placed.length > 1) {
          const lngs = placed.map((p) => p.lng);
          const lats = placed.map((p) => p.lat);
          map!.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: { top: 80, left: 50, right: 50, bottom: inset + 100 }, maxZoom: 12, duration: 0 });
        }
        setReady(true);
      });
      mapRef.current = map;
      if (process.env.NEXT_PUBLIC_E2E === '1') (window as unknown as { __fbMap?: MLMap }).__fbMap = map;
    })();
    return () => {
      cancelled = true;
      guessMarker.current?.remove();
      truthMarker.current?.remove();
      guessMarker.current = truthMarker.current = null;
      placeMarkers.current.forEach((m) => m.remove());
      placeMarkers.current = [];
      map?.remove();
      mapRef.current = null;
      setReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---- guess / answer pin ---- */
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    if (!pin) {
      guessMarker.current?.remove();
      guessMarker.current = null;
      return;
    }
    if (!guessMarker.current) {
      const m = new ml.Marker({ element: pinElement('guess', 'pin-marker'), draggable: !readOnly, anchor: 'bottom' }).setLngLat([pin.lng, pin.lat]).addTo(map);
      m.on('dragend', () => {
        const near = placeNear(map, map.project(m.getLngLat()));
        const target = near >= 0 ? cb.current.places?.[near] : undefined;
        if (near >= 0 && target && target.lat !== null && target.lng !== null) {
          m.setLngLat([target.lng, target.lat]);
          return void cb.current.onPlaceTap?.(near);
        }
        const p = wrapPin(m.getLngLat());
        m.setLngLat([p.lng, p.lat]);
        cb.current.onPinChange?.(p);
      });
      guessMarker.current = m;
    } else {
      guessMarker.current.setLngLat([pin.lng, pin.lat]);
      guessMarker.current.setDraggable(!readOnly);
    }
  }, [pin, ready, readOnly]);

  /* ---- family places (Partners): big emoji icons with their names ---- */
  // Keyed on the places' content, so a parent that rebuilds the array every render does not recreate the markers.
  const placesKey = JSON.stringify(places ?? []);
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;
    placeMarkers.current.forEach((m) => m.remove());
    placeMarkers.current = [];
    (JSON.parse(placesKey) as MapPlace[]).forEach((p, i) => {
      if (p.lat === null || p.lng === null) return;
      const el = placeElement(p, i, (idx) => {
        if (!cb.current.readOnly) cb.current.onPlaceTap?.(idx);
      });
      placeMarkers.current.push(new ml.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map));
    });
  }, [placesKey, ready]);

  /* ---- reveal: truth pin, connecting line, fit ---- */
  useEffect(() => {
    const map = mapRef.current;
    const ml = mlRef.current;
    if (!ready || !map || !ml) return;

    if (truth) {
      if (!truthMarker.current) truthMarker.current = new ml.Marker({ element: pinElement('truth', 'truth-marker'), anchor: 'bottom' }).setLngLat([truth.lng, truth.lat]).addTo(map);
      else truthMarker.current.setLngLat([truth.lng, truth.lat]);
    } else {
      truthMarker.current?.remove();
      truthMarker.current = null;
    }

    const drawLine = () => {
      const data = {
        type: 'FeatureCollection' as const,
        features:
          truth && pin
            ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: [[truth.lng, truth.lat], [unwrapLng(truth.lng, pin.lng), pin.lat]] } }]
            : [],
      };
      const src = map.getSource('fb-link') as { setData?: (d: unknown) => void } | undefined;
      if (src?.setData) src.setData(data);
      else if (!map.getSource('fb-link')) {
        map.addSource('fb-link', { type: 'geojson', data });
        map.addLayer({ id: 'fb-link-line', type: 'line', source: 'fb-link', paint: { 'line-color': '#2f4668', 'line-width': 3, 'line-dasharray': [2, 2] } });
      }
    };
    if (map.isStyleLoaded()) drawLine();
    else map.once('idle', drawLine);
    map.on('style.load', drawLine);

    if (fit && pin) {
      const pts = [pin, ...(truth ? [truth] : [])].map((p) => [truth ? unwrapLng(truth.lng, p.lng) : p.lng, p.lat] as [number, number]);
      if (pts.length === 1) map.jumpTo({ center: pts[0], zoom: 4 });
      else {
        const lngs = pts.map((p) => p[0]);
        const lats = pts.map((p) => p[1]);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], {
          padding: { top: 90, left: 60, right: 60, bottom: bottomInset + 70 },
          maxZoom: 7,
          duration: 0,
        });
      }
    }
    return () => {
      map.off('style.load', drawLine);
    };
  }, [truth, pin, fit, ready, bottomInset]);

  /* ---- external focus (e.g. "use location from photo") ---- */
  useEffect(() => {
    // keep the pin in the part of the map the bottom sheet does not cover
    if (ready && focus && mapRef.current) mapRef.current.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(mapRef.current.getZoom(), 4), duration: 700, padding: { top: 60, left: 20, right: 20, bottom: bottomInset + 40 } });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new focus request should move the map
  }, [focus, ready]);

  /* ---- keep the bottom inset in a CSS variable so map controls clear the overlay ---- */
  useEffect(() => {
    wrapper.current?.style.setProperty('--map-bottom-inset', `${bottomInset}px`);
  }, [bottomInset]);

  /* ---- keyboard: Enter/Space drop a pin at the centre; arrows nudge the pin (or pan); + / − zoom ---- */
  const onKeyDown = (e: React.KeyboardEvent) => {
    const map = mapRef.current;
    if (!map) return;
    if (e.key === 'Enter' || e.key === ' ') {
      if (cb.current.readOnly) return;
      e.preventDefault();
      if (!pin) {
        const c = map.getCenter();
        cb.current.onPinChange?.(wrapPin(c));
      }
      return;
    }
    if (e.key === '+' || e.key === '=') return void map.zoomIn();
    if (e.key === '-' || e.key === '_') return void map.zoomOut();
    const d = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    const step = (e.shiftKey ? 5 : 1) * (40 / 2 ** Math.max(0, map.getZoom()));
    if (pin && !cb.current.readOnly) cb.current.onPinChange?.(wrapPin({ lat: pin.lat + d[1] * step, lng: pin.lng + d[0] * step }));
    else map.panBy([d[0] * 80, -d[1] * 80], { duration: 120 });
  };

  return (
    <div
      ref={wrapper}
      className={`fb-map overflow-hidden bg-blue-soft ${className ?? ''}`}
      data-testid="world-map"
      data-ready={ready ? 'true' : 'false'}
      data-pin-lat={pin ? pin.lat.toFixed(5) : undefined}
      data-pin-lng={pin ? pin.lng.toFixed(5) : undefined}
      tabIndex={0}
      role="application"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      dir="ltr"
    >
      <div ref={container} style={{ position: 'absolute', inset: 0 }} />
      {!ready && <div className="absolute inset-0 grid place-items-center text-sm text-muted">{t('common.loading')}</div>}
    </div>
  );
}
