import { route } from '@/lib/http';
import { getPuzzleForOwner, rebuildCrops, toHostPuzzle } from '@/lib/services/games';
import { db } from '@/lib/db';
import type { PuzzleRow } from '@/lib/services/shared';

export const runtime = 'nodejs';

/** Rebuilds the four physically cropped clue assets from the saved focus point. */
export const POST = route(async (ctx) => {
  const { puzzle, game } = getPuzzleForOwner(ctx.params.id, ctx.sid);
  await rebuildCrops(game.id, puzzle.id, puzzle.crop_cx, puzzle.crop_cy);
  db().prepare('UPDATE puzzles SET crop_version = crop_version + 1 WHERE id = ?').run(puzzle.id);
  return toHostPuzzle(db().prepare('SELECT * FROM puzzles WHERE id = ?').get(puzzle.id) as PuzzleRow);
});
