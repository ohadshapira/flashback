# flashback reference

How the game works and how it is built. For installing and running it, see [INSTALL.md](INSTALL.md).

## Screens and routes

| Route | Purpose |
|---|---|
| `/` | Home: modes, join by code, demo |
| `/new?mode=couple\|family-shared\|party` | Create a game |
| `/new/photos?game=…` | Upload from the device or Google Photos, reorder, remove |
| `/new/photo/[id]/details` | The real answer: map pin plus **month/year wheels** (the same component as guessing), title and story |
| `/new/photo/[id]/crop` | Drag the focus target; live preview of all four zoom stages |
| `/new/review?game=…` | Completeness check and start |
| `/play/[gameId]/handoff` → `/play/[gameId]` → `/guess` → `/reveal` → `/summary` | Shared-device play |
| `/room/[code]`, `/lobby`, `/play` | Party: join, lobby (code, link, QR), synchronized rounds |
| `/unlock` | Owner passcode (only when `OWNER_PASSCODE` is set) |
| `/privacy`, `/help/delete-data` | Privacy explanation; list and delete this device's games |

## Game modes

* **Couple**: one person builds the game and answers every photo, then hands the phone over. The host's own device is refused the answers until the game is finished, so passing the phone is safe.
* **Family & Friends**: everyone around one screen agrees on one pin and one date. The score is a team score.
* **Party**: everyone plays on their own phone. The host sets the answers and does not compete. Players join with a code, link or QR code.
  * *Classic*: the zoom widens over time (stages at 0, 15, 30 and 45 s of a 60 s round).
  * *Scratch* (harder): the photo is covered by foil and each player scratches their own copy clear. The more you reveal, the lower your 20-point bonus: up to 10% revealed is 20, up to 25% is 15, up to 45% is 10, up to 70% is 5, more is 0. Location and date points are unchanged. The summary lists every player's score per round and how much each scratched.

  Scratch is cheat-resistant: the photo is cut into tiles (a 20-column grid, built in the background when the round starts) from the widest, metadata-free clue crop. A tile is served only after the player scratched it (`POST /api/rooms/:code/scratch` returns the pixels of exactly those tiles; the same tile can also be fetched by `GET /api/media/:puzzleId/scratch-N`, for example after a reload). The revealed share that sets the score is counted by the server from the tiles it released, never from a number the browser sends.

## The guess screen

One screen, never split: a MapLibre world map (tap = one pin; tap again or drag to move it) with a bottom-anchored panel holding two independent iOS-style wheels (month, year) and **Confirm guess**. The wheels scroll only themselves and the map pans only itself. Future months are disabled in the current year; years run from 1900 to now. Everything works by keyboard: wheels use ↑ ↓ PgUp PgDn Home End, and on the map Enter drops a pin at the centre and the arrow keys nudge it.

## Scoring

Maximum 100 per round: location 50 + date 30 + zoom bonus 20. The tables live in `src/lib/config.ts` and the pure function is `scoreGuess`.

| Distance | pts | Month difference | pts | Stage | pts |
|---|---|---|---|---|---|
| ≤ 10 km | 50 | 0 | 30 | 1 | 20 |
| ≤ 50 | 40 | 1 | 24 | 2 | 15 |
| ≤ 200 | 25 | 2–3 | 15 | 3 | 10 |
| ≤ 1000 | 10 | 4–6 | 8 | 4 | 5 |
| > 1000 | 0 | 7–12 | 4 | | |

Distance is haversine (correct across the International Date Line). The stage is the one the **server** recorded, never a client claim.

## Security model (what keeps answers secret)

* **Pixels:** the original is never sent to a player. At upload, sharp normalizes orientation, strips all metadata and writes four physically cropped clue files (zoom 6×, 3.5×, 2×, 1.25×, clamped to the image). `GET /api/media/:puzzleId/:kind` is the only way to read media. It is stage-gated (`clue-N` only up to the current stage of the live round) and the original and thumbnail are served only for revealed rounds. Files live under `data/media`, never in `public/`.
* **Answers:** `truth_*`, suggestions, story and `createTime` are selected only by code paths behind the authorization boundary in `src/lib/services/authz.ts`. A player's JSON (`/round/current`, `/rooms/:code/state`) contains none of them until the round is revealed.
* **Hand-off lock:** once a game leaves *draft*, the host's own device is refused the answers (`403 answers_locked`) until the game is *finished*.
* **Identity:** an anonymous `HttpOnly; SameSite=Lax` session cookie (`fb_sid`). Ids in URLs are never proof of access; strangers get an indistinguishable `404`.
* **Guesses:** one per participant per round (`UNIQUE (puzzle_id, participant_id)`), validated and scored on the server. Repeats are idempotent and change nothing.
* **Party:** the server owns the clock (round deadline, zoom stage). Server-sent events are only a "refetch" hint; `/state` is authoritative. Joining is rate limited and codes expire.
* **Google tokens:** server-side only, AES-256-GCM encrypted at rest, short-lived, discarded after import. OAuth uses Authorization Code with PKCE (S256) and a single-use `state` bound to the browser session.
* **Owner lock:** with `OWNER_PASSCODE` set, creating games, uploads, imports and the demo need an `HttpOnly` cookie issued after the passcode is entered (compared in constant time, 8 attempts per 10 minutes per address).

## Google Photos Picker

Implemented against the official Picker REST API (`https://photospicker.googleapis.com/v1`) with scope `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`:

1. Disclosure and explicit consent, then `/api/auth/google/start` (PKCE, `state`).
2. `POST /v1/sessions` with `pickingConfig.maxItemCount` as a **string**. `pickerUri` opens in its **own tab** (never an iframe; `/autoclose` is appended).
3. Server-side polling that honours `pollingConfig.pollInterval`, `timeoutIn` and `expireTime`.
4. After `mediaItemsSet`, `GET /v1/mediaItems` with `nextPageToken` pagination. Videos are skipped with a message.
5. Authorized server-side download (`baseUrl=w2048-h2048`, `Authorization: Bearer`) with a host allow-list (SSRF guard), size and type limits, and the same image pipeline as uploads.
6. `DELETE /v1/sessions/{id}` and token discard when done or cancelled.

`createTime` is only a **suggestion** for the date wheels. Google provides no location, so the host places the pin.

## Multiplayer details and limits

* Server-authoritative rounds of 60 s with zoom stages at 0 / 15 / 30 / 45 s. A round closes at the deadline or as soon as every player has answered; then everyone gets the reveal and the leaderboard together.
* Realtime is Server-Sent Events from the Next.js server (`/api/rooms/:code/events`) with 4 s polling as a safety net. State lives in SQLite.
* **Single instance:** the event bus is in-process and SQLite is a local file, so run **one server process with a persistent disk**. Scaling out would mean replacing `src/lib/bus.ts` with Redis or Supabase Realtime and the SQLite layer with Postgres; that is not implemented.
* **Host disconnects:** the room is durable and the host can reload and continue. If the host is absent for 60 s at a reveal, the room advances by itself after 20 s.
* Join codes use an unambiguous alphabet, expire after 6 h, are rate limited, and rooms are capped at 12 players. Behind a reverse proxy, make sure `X-Forwarded-For` is set by the proxy (it keys the rate limiter).
* The demo's *simulated players* answer on their own and are labelled as simulated everywhere. They exist only in demo games.

## Retention and deletion

Games and photos are deleted `IMAGE_RETENTION_DAYS` after the **last activity** (shown on the review screen and in the privacy text). Cleanup runs opportunistically (every 10 minutes when a game is created), via `npm run cleanup`, and via `GET /api/cron/cleanup` (bearer `CRON_SECRET`) for a scheduler. It also removes orphaned media folders and stale OAuth rows. Users can delete a game at any time (`/help/delete-data`, or the summary screen), which removes rows, crops, originals, guesses and any Picker session.

## Tests

* `npm test`: 94 unit and integration tests covering the scoring tables and boundaries, haversine across the date line, month/year logic, crop geometry, the crypto and PKCE vectors, rate limiting, the SSRF guard, translation key parity, and integration tests on real SQLite and real image processing for permissions (no leak of answers, originals or later stages; host lock; strangers), idempotent guesses, EXIF stripping, deletion, retention, the scratch game, the owner lock, and the full party state machine.
* `npm run test:e2e`: 20 Playwright journeys on a phone profile and desktop Chrome. A local **mock** of Google OAuth and the Picker enforces the real contract (Bearer token, PKCE verification, string `maxItemCount`, durations, `FAILED_PRECONDITION`, pagination). Journeys: couple play from start to finish, host setup, a three-browser party game, the scratch game, the Google flow against the mock, the not-configured path, answer-leak security checks, wheels/keyboard/RTL/LTR, and a 320 px layout.

Not covered by automation: a live Google account, real iOS Safari and physical Android devices, and a licensed map provider.

## Deployment checklist

1. Provision a host with a persistent volume; run `npm ci && npm run build && npm start`.
2. Set the environment: `APP_BASE_URL` with `https://`, `DEMO_MODE=false`, a map provider key, the Google values if used, and `FLASHBACK_DATA_DIR` on the volume.
3. Terminate HTTPS at a proxy that sets `X-Forwarded-For`, and disable response buffering for `/api/rooms/*/events`.
4. Schedule `GET /api/cron/cleanup` (with `CRON_SECRET`) or `npm run cleanup`.
5. Back up the data directory if you care about games beyond the retention window.
6. Have the privacy text legally reviewed and complete Google's verification before any public launch.

A ready-made setup for one small Google Cloud VM (Docker, automatic HTTPS) is in [DEPLOY-GCP.md](DEPLOY-GCP.md).

## Known limitations

* HEIC/HEIF is rejected with a clear message (the prebuilt image library has no HEVC decoder). Export as JPEG.
* SQLite and local disk instead of PostgreSQL/Supabase; there is no row-level security because there is no client-side database access.
* Google access tokens are not refreshed (no offline access is requested, by design), so each import may send the user through Google's quick consent again.
* No place-search box; the pin is placed by tap, drag or keyboard. Place labels need a MapTiler key.
* No scheduled job inside the app process beyond the opportunistic cleanup.
* No Content-Security-Policy is shipped (map and style provider hosts vary per deployment). Add one that allows your provider, `worker-src 'self'` and `img-src blob: data:`.
* The privacy page is a development draft, not legal advice.
