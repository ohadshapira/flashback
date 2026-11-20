-- Party play style "scratch": the photo is covered and revealed by scratching it; the more you scratch, the lower the bonus.
-- The server decides what each player may see: a tile is only served after the player scratched it, and the
-- revealed share (the score input) is counted from the tiles the server released, never from a client-side claim.

ALTER TABLE games ADD COLUMN play_style TEXT NOT NULL DEFAULT 'classic' CHECK (play_style IN ('classic', 'scratch'));

-- Share of the photo (0-100) the player had revealed when they answered. NULL for classic games.
ALTER TABLE guesses ADD COLUMN scratch_pct INTEGER CHECK (scratch_pct BETWEEN 0 AND 100);

CREATE TABLE scratch_cells (
  puzzle_id      TEXT NOT NULL REFERENCES puzzles (id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  cell           INTEGER NOT NULL CHECK (cell >= 0),
  PRIMARY KEY (puzzle_id, participant_id, cell)
);
