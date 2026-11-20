import fs from 'node:fs';
import path from 'node:path';
import { dataDir } from './db';

/** Private media storage on local disk, outside public/. Keys are `<gameId>/<puzzleId>`. */
export function mediaRoot(): string {
  return path.join(dataDir(), 'media');
}

const SAFE = /^[A-Za-z0-9_-]+$/;

export function puzzleDir(gameId: string, puzzleId: string): string {
  if (!SAFE.test(gameId) || !SAFE.test(puzzleId)) throw new Error('unsafe storage key');
  return path.join(mediaRoot(), gameId, puzzleId);
}

export type MediaName = 'original.jpg' | 'thumb.jpg' | 'crop-1.jpg' | 'crop-2.jpg' | 'crop-3.jpg' | 'crop-4.jpg';

export function writeMedia(gameId: string, puzzleId: string, name: MediaName, data: Buffer) {
  const dir = puzzleDir(gameId, puzzleId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), data);
}

export function readMedia(gameId: string, puzzleId: string, name: MediaName): Buffer | null {
  try {
    return fs.readFileSync(path.join(puzzleDir(gameId, puzzleId), name));
  } catch {
    return null;
  }
}

export function deletePuzzleMedia(gameId: string, puzzleId: string) {
  fs.rmSync(puzzleDir(gameId, puzzleId), { recursive: true, force: true });
}

export function deleteGameMedia(gameId: string) {
  if (!SAFE.test(gameId)) return;
  fs.rmSync(path.join(mediaRoot(), gameId), { recursive: true, force: true });
}

export function listGameDirs(): string[] {
  try {
    return fs.readdirSync(mediaRoot(), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}
