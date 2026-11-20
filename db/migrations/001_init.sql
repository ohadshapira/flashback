-- flashback schema. All timestamps are epoch milliseconds.
-- Correct-answer columns (truth_*, suggest_*, source_create_time, title, story) are only ever
-- selected by server code paths that check the authorization boundary (see src/lib/services/authz.ts).

CREATE TABLE games (
  id               TEXT PRIMARY KEY,
  title            TEXT,
  mode             TEXT NOT NULL CHECK (mode IN ('couple', 'family_shared', 'party')),
  status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'handoff', 'lobby', 'playing', 'finished', 'deleted')),
  owner_sid        TEXT NOT NULL,
  join_code        TEXT UNIQUE,
  join_expires_at  INTEGER,
  target_count     INTEGER NOT NULL DEFAULT 6 CHECK (target_count BETWEEN 1 AND 20),
  current_round    INTEGER NOT NULL DEFAULT 0 CHECK (current_round >= 0),
  round_state      TEXT NOT NULL DEFAULT 'ready' CHECK (round_state IN ('ready', 'showing_crop', 'accepting_guesses', 'locked', 'revealed')),
  round_stage      INTEGER NOT NULL DEFAULT 1 CHECK (round_stage BETWEEN 1 AND 4),
  round_started_at INTEGER,
  round_deadline   INTEGER,
  revealed_at      INTEGER,
  host_seen_at     INTEGER,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL
);
CREATE INDEX idx_games_owner ON games (owner_sid);
CREATE INDEX idx_games_expires ON games (expires_at);

CREATE TABLE puzzles (
  id                 TEXT PRIMARY KEY,
  game_id            TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  ord                INTEGER NOT NULL,
  source             TEXT NOT NULL CHECK (source IN ('upload', 'google_photos', 'demo')),
  source_id          TEXT,
  source_create_time TEXT,
  content_hash       TEXT NOT NULL,
  width              INTEGER NOT NULL,
  height             INTEGER NOT NULL,
  crop_cx            REAL NOT NULL DEFAULT 0.5 CHECK (crop_cx BETWEEN 0 AND 1),
  crop_cy            REAL NOT NULL DEFAULT 0.5 CHECK (crop_cy BETWEEN 0 AND 1),
  crop_version       INTEGER NOT NULL DEFAULT 0,
  truth_lat          REAL CHECK (truth_lat BETWEEN -90 AND 90),
  truth_lng          REAL CHECK (truth_lng BETWEEN -180 AND 180),
  truth_year         INTEGER,
  truth_month        INTEGER CHECK (truth_month BETWEEN 1 AND 12),
  answer_confirmed   INTEGER NOT NULL DEFAULT 0 CHECK (answer_confirmed IN (0, 1)),
  suggest_lat        REAL,
  suggest_lng        REAL,
  suggest_year       INTEGER,
  suggest_month      INTEGER,
  title              TEXT,
  story              TEXT,
  created_at         INTEGER NOT NULL,
  UNIQUE (game_id, content_hash)
);
CREATE INDEX idx_puzzles_game ON puzzles (game_id, ord);

CREATE TABLE participants (
  id           TEXT PRIMARY KEY,
  game_id      TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  sid          TEXT,
  display_name TEXT NOT NULL,
  role         TEXT NOT NULL CHECK (role IN ('host', 'player')),
  joined_at    INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  UNIQUE (game_id, sid)
);
CREATE INDEX idx_participants_game ON participants (game_id);

CREATE TABLE guesses (
  id             TEXT PRIMARY KEY,
  game_id        TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  puzzle_id      TEXT NOT NULL REFERENCES puzzles (id) ON DELETE CASCADE,
  participant_id TEXT NOT NULL REFERENCES participants (id) ON DELETE CASCADE,
  guess_lat      REAL NOT NULL CHECK (guess_lat BETWEEN -90 AND 90),
  guess_lng      REAL NOT NULL CHECK (guess_lng BETWEEN -180 AND 180),
  guess_month    INTEGER NOT NULL CHECK (guess_month BETWEEN 1 AND 12),
  guess_year     INTEGER NOT NULL,
  reveal_stage   INTEGER NOT NULL CHECK (reveal_stage BETWEEN 1 AND 4),
  submitted_at   INTEGER NOT NULL,
  distance_km    REAL NOT NULL,
  month_diff     INTEGER NOT NULL,
  score_location INTEGER NOT NULL,
  score_date     INTEGER NOT NULL,
  score_zoom     INTEGER NOT NULL,
  score          INTEGER NOT NULL,
  UNIQUE (puzzle_id, participant_id)
);
CREATE INDEX idx_guesses_game ON guesses (game_id);

-- Google Photos Picker -------------------------------------------------
-- Tokens are AES-256-GCM encrypted at the application layer; never exposed to the browser.
CREATE TABLE google_tokens (
  sid         TEXT PRIMARY KEY,
  enc_access  TEXT NOT NULL,
  enc_refresh TEXT,
  expires_at  INTEGER NOT NULL,
  scope       TEXT,
  consent_at  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL
);

CREATE TABLE oauth_states (
  state            TEXT PRIMARY KEY,
  sid              TEXT NOT NULL,
  game_id          TEXT,
  enc_code_verifier TEXT NOT NULL,
  expires_at       INTEGER NOT NULL
);

CREATE TABLE google_sessions (
  id               TEXT PRIMARY KEY,
  sid              TEXT NOT NULL,
  game_id          TEXT NOT NULL REFERENCES games (id) ON DELETE CASCADE,
  picker_uri       TEXT NOT NULL,
  expire_time      INTEGER NOT NULL,
  poll_interval_ms INTEGER NOT NULL,
  timeout_at       INTEGER NOT NULL,
  max_items        INTEGER NOT NULL,
  media_items_set  INTEGER NOT NULL DEFAULT 0,
  import_state     TEXT NOT NULL DEFAULT 'idle' CHECK (import_state IN ('idle', 'importing', 'done', 'failed', 'cancelled')),
  import_total     INTEGER NOT NULL DEFAULT 0,
  import_done      INTEGER NOT NULL DEFAULT 0,
  import_errors    TEXT NOT NULL DEFAULT '[]',
  created_at       INTEGER NOT NULL
);
CREATE INDEX idx_gsessions_sid ON google_sessions (sid, game_id);
