-- "Partners" (a parent and a child playing as one team) is not a new game mode. It is a family_shared game plus a small
-- profile: the two names, an optional birth month/year, and up to six family places the child knows.
-- The profile is stored as JSON in this nullable column (NULL for every other game). It is personal but not an answer:
-- it is returned to the game's owner only, and it is deleted with the game. No CHECK constraint on games.mode changes,
-- so no SQLite table rebuild is needed.

ALTER TABLE games ADD COLUMN partners TEXT;
