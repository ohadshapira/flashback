import crypto from 'node:crypto';
import sharp from 'sharp';
import exifr from 'exifr';
import { ZOOM_FACTORS, LIMITS } from './config';
import { cropWindow } from './crop';
import { ApiError } from './errors';

export type PhotoSuggestion = { lat: number | null; lng: number | null; year: number | null; month: number | null };

export type ProcessedImage = {
  original: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
  hash: string;
  suggestion: PhotoSuggestion;
};

const MAX_ORIGINAL_EDGE = 2400;
const CLUE_MAX_EDGE = 960;

function sniff(buf: Buffer): 'jpeg' | 'png' | 'webp' | 'heic' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf.subarray(4, 8).toString('latin1') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('latin1');
    if (['heic', 'heix', 'hevc', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) return 'heic';
  }
  return null;
}

/** Reads host-facing suggestions from EXIF *before* it is stripped. Never trusted: the host must confirm. */
async function readSuggestion(input: Buffer): Promise<PhotoSuggestion> {
  const out: PhotoSuggestion = { lat: null, lng: null, year: null, month: null };
  try {
    const gps = await exifr.gps(input);
    if (gps && Number.isFinite(gps.latitude) && Number.isFinite(gps.longitude)) {
      out.lat = gps.latitude;
      out.lng = gps.longitude;
    }
  } catch {
    /* no GPS */
  }
  try {
    const tags = await exifr.parse(input, { reviveValues: false, pick: ['DateTimeOriginal', 'CreateDate'] });
    // Parsed from the raw "YYYY:MM:DD hh:mm:ss" string: no Date object, so no time-zone drift.
    const m = /^(\d{4})[:\-](\d{2})/.exec(String(tags?.DateTimeOriginal ?? tags?.CreateDate ?? ''));
    if (m) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      if (y >= LIMITS.minYear && mo >= 1 && mo <= 12) {
        out.year = y;
        out.month = mo;
      }
    }
  } catch {
    /* no usable EXIF date */
  }
  return out;
}

/**
 * Validates the file by content (not by name/MIME), normalizes orientation, downsizes,
 * and re-encodes to a metadata-free JPEG working copy plus a small thumbnail.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  if (input.length > LIMITS.maxUploadBytes) throw new ApiError(413, 'file_too_large', 'File is too large');
  const kind = sniff(input);
  if (kind === 'heic') throw new ApiError(415, 'unsupported_heic', 'HEIC/HEIF is not supported; export as JPEG');
  if (!kind) throw new ApiError(415, 'unsupported_type', 'Only JPEG, PNG and WebP images are supported');

  const suggestion = await readSuggestion(input);
  try {
    const base = sharp(input, { failOn: 'error', limitInputPixels: 100_000_000 }).rotate().flatten({ background: '#ffffff' });
    const { data, info } = await base
      .resize({ width: MAX_ORIGINAL_EDGE, height: MAX_ORIGINAL_EDGE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(data).resize({ width: 360, height: 360, fit: 'inside' }).jpeg({ quality: 76 }).toBuffer();
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return { original: data, thumb, width: info.width, height: info.height, hash, suggestion };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(422, 'invalid_image', 'This image could not be read');
  }
}

/**
 * Builds the four physically cropped clue assets (stage 1 = tightest). Each is a genuine crop with
 * all metadata stripped, so a player can never recover the original from a clue.
 */
export async function buildCrops(original: Buffer, cx: number, cy: number): Promise<Buffer[]> {
  const meta = await sharp(original).metadata();
  const w = meta.width!;
  const h = meta.height!;
  return Promise.all(
    ZOOM_FACTORS.map((z) => {
      const win = cropWindow(w, h, cx, cy, z);
      return sharp(original)
        .extract(win)
        .resize({ width: CLUE_MAX_EDGE, height: CLUE_MAX_EDGE, fit: 'inside' })
        .jpeg({ quality: 82 })
        .toBuffer();
    }),
  );
}
