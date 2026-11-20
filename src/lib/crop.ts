import { ZOOM_FACTORS } from './config';

export type CropWindow = { left: number; top: number; width: number; height: number };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The pixel window shown at a given zoom, centred on (cx, cy) in 0..1 and clamped to the image
 * so there is never empty space. Aspect ratio of the source is preserved (no distortion).
 */
export function cropWindow(imgW: number, imgH: number, cx: number, cy: number, zoom: number): CropWindow {
  const width = Math.max(1, Math.round(imgW / zoom));
  const height = Math.max(1, Math.round(imgH / zoom));
  const left = Math.round(clamp(cx * imgW - width / 2, 0, imgW - width));
  const top = Math.round(clamp(cy * imgH - height / 2, 0, imgH - height));
  return { left, top, width, height };
}

export function stageWindow(imgW: number, imgH: number, cx: number, cy: number, stage: 1 | 2 | 3 | 4): CropWindow {
  return cropWindow(imgW, imgH, cx, cy, ZOOM_FACTORS[stage - 1]);
}

/** CSS percentages to show a crop window by positioning the full image inside an overflow-hidden box. */
export function windowToCss(w: CropWindow, imgW: number, imgH: number) {
  return {
    width: `${(imgW / w.width) * 100}%`,
    height: `${(imgH / w.height) * 100}%`,
    left: `${(-w.left / w.width) * 100}%`,
    top: `${(-w.top / w.height) * 100}%`,
  };
}
