import { db } from '../db';
import { notFound, forbidden } from '../errors';
import { readMedia, type MediaName } from '../storage';
import {
  effectiveStage,
  isOwner,
  participantBySid,
  puzzleIndex,
  roundPhase,
  type GameRow,
  type PuzzleRow,
} from './shared';
import { tickParty } from './play';

export type MediaKind = 'thumb' | 'original' | 'clue-1' | 'clue-2' | 'clue-3' | 'clue-4';

export function isMediaKind(k: string): k is MediaKind {
  return ['thumb', 'original', 'clue-1', 'clue-2', 'clue-3', 'clue-4'].includes(k);
}

/**
 * THE authorization boundary for pixels. A caller may see:
 *  - everything, if they own the game while it is a draft (the host sets answers) or once it finished;
 *  - a clue of stage <= the current stage of the live round;
 *  - the original/thumbnail and any clue only for rounds already revealed.
 * Everything else — including unknown ids — is a plain 404, so existence is not leaked either.
 */
export function authorizeMedia(sid: string | null, puzzleId: string, kind: MediaKind): { puzzle: PuzzleRow; game: GameRow } {
  const puzzle = db().prepare('SELECT * FROM puzzles WHERE id = ?').get(puzzleId) as PuzzleRow | undefined;
  if (!puzzle) throw notFound();
  let game = db().prepare("SELECT * FROM games WHERE id = ? AND status != 'deleted'").get(puzzle.game_id) as GameRow | undefined;
  if (!game) throw notFound();
  if (game.mode === 'party') {
    tickParty(game.id);
    game = db().prepare('SELECT * FROM games WHERE id = ?').get(game.id) as GameRow;
  }

  const owner = isOwner(game, sid);
  if (owner && (game.status === 'draft' || game.status === 'finished')) return { puzzle, game };

  // From here on the viewer must be a participant of a running/finished game.
  const member = owner || (game.mode === 'party' && !!participantBySid(game.id, sid));
  if (!member) throw notFound();

  const idx = puzzleIndex(game.id, puzzle.id);
  const phase = roundPhase(game, idx);
  if (phase === 'future') throw notFound();
  if (phase === 'revealed') return { puzzle, game };

  // Live round: only clues up to the current stage.
  if (kind.startsWith('clue-')) {
    const requested = Number(kind.slice(5));
    if (requested <= effectiveStage(game)) return { puzzle, game };
  }
  throw forbidden();
}

export function loadMedia(sid: string | null, puzzleId: string, kind: MediaKind): Buffer {
  const { puzzle, game } = authorizeMedia(sid, puzzleId, kind);
  const name: MediaName = kind === 'thumb' ? 'thumb.jpg' : kind === 'original' ? 'original.jpg' : (`${kind.replace('clue', 'crop')}.jpg` as MediaName);
  const buf = readMedia(game.id, puzzle.id, name);
  if (!buf) throw notFound();
  return buf;
}
