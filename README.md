# flashback

**Guess the moment. Relive the memory.**

flashback turns your own photos into a private memory game. Players see a tightly zoomed-in crop of a photo, widen the view if they need to, then guess **where** (a pin on a real world map) and **when** (a month and a year, on two scroll wheels anchored to the bottom of that same map). Then the full photo, the real place and date, and your story are revealed.

* English (LTR) UI by default; Hebrew (RTL) is included and switchable in the header (`NEXT_PUBLIC_DEFAULT_LOCALE=he` makes it the default). All copy lives in `src/i18n`.
* The map opens on the player's own region (time zone, or device location only if already permitted; computed on the device, never sent anywhere). Set `NEXT_PUBLIC_MAP_START=world` for the neutral world view.
* Three modes: **Couple** (pass the phone), **Family & Friends** (one screen, one team answer), **Party** (everyone on their own phone, server-synchronized).
* Photos from **device upload** or the **Google Photos Picker**.
* Server-side image processing: players only ever receive physically cropped, metadata-free clue images.

> The product name is always lowercase: **flashback**.

---

## Quick start

Requires Node **≥ 20.9** (developed on 20.10 and 22).

```powershell
npm install        # also copies the MapLibre worker into public/maplibre
npm run dev        # http://localhost:3000
```

No credentials are needed. Open the home page and use **Try the demo** (clearly labelled *demo content*): it builds a ready-to-play game of three rounds from original illustrations with fictional answers (sample games have no delete button; there is nothing of yours in them). It is **not** connected to Google Photos.

**Party** on the demo card asks how to play (*Classic* or *Scratch*) and opens a party room where *you* play and run the room against three **simulated players**. They answer on their own a few seconds apart, are labelled *simulated* everywhere, and after every round the reveal screen lists what each of them did (distance, date difference, clue). It exists only for demo games; real rooms are unchanged.

**Scratch mode (harder, party only).** When creating a party you can choose *Scratch* instead of *Classic*. The photo is covered by foil and every player scratches their own copy to reveal it; the more of the photo you revealed, the lower your 20-point bonus (≤10% revealed: 20, ≤25%: 15, ≤45%: 10, ≤70%: 5, more: 0; location and date points are unchanged). The summary shows every player's score per round and how much each scratched. It is cheat-resistant by design: the photo is cut into tiles (a 20-column grid, built in the background when the round starts) from the widest, metadata-free clue crop, a tile is only served after the player scratched it (`POST /api/rooms/:code/scratch`, whose answer carries the pixels of exactly those tiles; the same tile can also be fetched by `GET /api/media/:puzzleId/scratch-N`, e.g. after a reload), and the revealed share that sets the score is counted by the server from the tiles it released, never from a figure the browser sends. On the demo card, *Party → Scratch (harder)* puts you against three simulated players who scratch different amounts.

The tagline is localized: *Guess the moment. Relive the memory.* in English, *נחשו את הרגע. חיו את הזיכרון מחדש.* in the Hebrew UI.

Optional: copy `.env.example` to `.env.local` and fill in what you need (see below).

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` · `npm run typecheck` | ESLint · `tsc --noEmit` |
| `npm test` | Vitest unit + integration tests (real SQLite + real sharp) |
| `npm run test:e2e` | Playwright browser tests (builds the app, starts a mock Google server) |
| `npm run cleanup` | Deletes expired games and orphaned media now |

First E2E run: `npx playwright install chromium`.

---

## How a game works

| Route | Purpose |
|---|---|
| `/` | Home: modes, join by code, demo |
| `/new?mode=couple\|family-shared\|party` | Create a game |
| `/new/photos?game=…` | Upload from device or Google Photos, reorder, remove |
| `/new/photo/[id]/details` | Real answer: map pin + **month/year wheels** (same component as guessing), title/story |
| `/new/photo/[id]/crop` | Drag the focus target; live preview of all four stages |
| `/new/review?game=…` | Completeness check and start |
| `/play/[gameId]/handoff` → `/play/[gameId]` → `/guess` → `/reveal` → `/summary` | Shared-device play |
| `/room/[code]`, `/lobby`, `/play` | Party: join, lobby (code, link, QR), synchronized rounds |
| `/privacy`, `/help/delete-data` | Privacy explanation; list and delete this device's games |

**The guess screen** (`MapWheelStage`) is one screen: a MapLibre world map (tap = one pin, tap again or drag to move it) with a bottom-anchored panel holding two independent iOS-style wheels (month, year) and **Confirm guess**. Wheels scroll only themselves; the map pans only itself. Future months are disabled in the current year; years run 1900 → now. Everything is operable by keyboard (wheels: ↑ ↓ PgUp PgDn Home End; map: Enter drops a pin at the centre, arrows nudge it).

**Scoring** (`src/lib/config.ts`, pure function `scoreGuess`): max 100 = location 50 + date 30 + zoom bonus 20.

| Distance | pts | Month diff | pts | Stage | pts |
|---|---|---|---|---|---|
| ≤ 10 km | 50 | 0 | 30 | 1 | 20 |
| ≤ 50 | 40 | 1 | 24 | 2 | 15 |
| ≤ 200 | 25 | 2–3 | 15 | 3 | 10 |
| ≤ 1000 | 10 | 4–6 | 8 | 4 | 5 |
| > 1000 | 0 | 7–12 | 4 | | |

Distance is haversine (correct across the International Date Line); the stage is the one the **server** recorded, never a client claim.

---

## Security model (what keeps answers secret)

* **Pixels:** the original is never sent to a player. At upload, sharp normalizes orientation, strips all metadata, and writes four physically cropped clue files (zoom 6× / 3.5× / 2× / 1.25×, clamped to the image). `GET /api/media/:puzzleId/:kind` is the only way to read media; it is stage-gated (`clue-N` only up to the current stage of the live round) and the original/thumbnail are served only for revealed rounds. Files live under `data/media`, never `public/`.
* **Answers:** `truth_*`, suggestions, story and `createTime` are selected only by code paths behind the authorization boundary in `src/lib/services/authz.ts` and `games.ts`. A player's JSON (`/round/current`, `/rooms/:code/state`) contains none of them until the round is revealed.
* **Hand-off lock:** the moment a game leaves *draft* the host's own device is refused the answers (`403 answers_locked`) until the game is *finished*. That is what makes "pass the phone" safe even though the partner holds the host's browser.
* **Identity:** anonymous `HttpOnly; SameSite=Lax` session cookie (`fb_sid`). Ids in URLs are never proof of access; strangers get an indistinguishable `404`.
* **Guesses:** one per participant per round (`UNIQUE (puzzle_id, participant_id)`), validated and scored server-side; repeats are idempotent and change nothing.
* **Party:** the server owns the clock (round deadline, zoom stage). SSE is only a "refetch" hint; `/state` is authoritative. Join is rate limited and codes expire.
* **Google tokens:** server-side only, AES-256-GCM encrypted at rest, short-lived, discarded after import. OAuth uses Authorization Code + PKCE (S256) with a single-use `state` bound to the browser session.

---

## Environment variables

See `.env.example` (placeholders only). Summary:

| Variable | Needed for |
|---|---|
| `APP_BASE_URL` | Links, cookie `Secure` flag when `https://` |
| `DEMO_MODE` | `true` shows the demo (set `false` in production) |
| `IMAGE_RETENTION_DAYS` | Auto-deletion, counted from **last activity** (default 7) |
| `FLASHBACK_DATA_DIR` | SQLite file + private media (default `./data`) |
| `CRON_SECRET` | Optional bearer for `GET /api/cron/cleanup` |
| `NEXT_PUBLIC_MAP_STYLE_URL` / `NEXT_PUBLIC_MAPTILER_KEY` | Map tiles; MapTiler key also enables place labels |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` | Google Photos Picker |
| `FLASHBACK_TIME_SCALE` | **Tests only**: shortens party timers |

### Map

Priority: `NEXT_PUBLIC_MAP_STYLE_URL` → MapTiler key → **OpenFreeMap "positron"** (free, key-less OpenStreetMap vector tiles; attribution shown on the map) with an automatic fall back to a bundled offline country-outline style (Natural Earth, public domain). For real use configure a licensed provider (e.g. MapTiler) and keep the attribution visible; do not use the public OSM tile server in production.

---

## Google Photos Picker

Implemented against the official Picker REST API (`https://photospicker.googleapis.com/v1`), scope `https://www.googleapis.com/auth/photospicker.mediaitems.readonly`:

1. Disclosure + explicit consent → `/api/auth/google/start` (PKCE, `state`).
2. `POST /v1/sessions` with `pickingConfig.maxItemCount` as a **string**; `pickerUri` opened in its **own tab** (never an iframe; `/autoclose` appended).
3. Server-side polling honouring `pollingConfig.pollInterval` / `timeoutIn` / `expireTime`.
4. After `mediaItemsSet`, `GET /v1/mediaItems` with `nextPageToken` pagination; videos skipped with a message.
5. Server-side authorized download (`baseUrl=w2048-h2048`, `Authorization: Bearer`), host allow-list (SSRF guard), size/type limits, same sharp pipeline as uploads.
6. `DELETE /v1/sessions/{id}` and token discard when done or cancelled.

`createTime` is only a **suggestion** for the date wheels; Google provides no location, so the host always places the pin.

### Google Cloud setup

1. Create a Google Cloud project and enable **Google Photos Picker API** (not Drive's Google Picker).
2. Configure the OAuth consent screen: product name **flashback**, authorized domain, privacy policy (`/privacy`) and support links; add test users while in testing.
3. Create OAuth credentials of type **Web application**. Authorized JavaScript origin `http://localhost:3000`; redirect URI `http://localhost:3000/api/auth/google/callback` (use your real origin in production).
4. Put the values in `.env.local`; generate the encryption key with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
5. Before public launch Google may require OAuth verification and review under the **Google Photos API User Data and Developer Policy** (including Limited Use). Do not assume approval.

Without these variables the UI says **"Google Photos is not configured in this development environment."**, disables the button, and local upload keeps working. Nothing is faked.

---

## Multiplayer details and limits

* Server-authoritative rounds: 60 s, zoom stages at 0 / 15 / 30 / 45 s. A round closes at the deadline or as soon as every player has answered, then everyone gets the reveal and leaderboard together.
* Realtime = Server-Sent Events from the Next.js server (`/api/rooms/:code/events`) with 4 s polling as a safety net. State lives in SQLite.
* **Single instance:** the SSE hint bus is in-process and SQLite is a local file, so run **one server process with a persistent disk** (a VM, container with a volume, Fly/Render/Railway-style host). It does **not** work on serverless platforms with ephemeral filesystems. Scaling out means replacing `src/lib/bus.ts` with Redis/Supabase Realtime and the SQLite layer with Postgres; this is *not* implemented.
* **Host disconnects:** the room is durable. The host can reload and continue. If the host is absent for 60 s at a reveal, the room advances by itself after 20 s.
* Join codes use an unambiguous alphabet, expire after 6 h, are rate limited, and rooms cap at 12 players. Behind a reverse proxy, make sure `X-Forwarded-For` is set by the proxy (it keys the rate limiter).

---

## Retention and deletion

Games and photos are deleted `IMAGE_RETENTION_DAYS` after the **last activity** (displayed on the review screen and in the privacy text). Cleanup runs opportunistically (every 10 min on game creation), via `npm run cleanup`, and `GET /api/cron/cleanup` (bearer `CRON_SECRET`) for a scheduler; it also removes orphaned media folders and stale OAuth rows. Users can delete a game at any time (`/help/delete-data`, summary screen), which removes rows, crops, originals, guesses and any Picker session.

---

## Tests

* `npm test`: 67 tests — scoring tables and boundaries, haversine incl. date line, month/year logic, crop geometry, crypto/PKCE vector, rate limiting, SSRF guard, i18n key parity, and **integration tests on real SQLite + sharp** covering permissions (no truth/original/stage leaks, host lock, strangers), idempotent guesses, EXIF stripping, deletion, retention cleanup, and the full party state machine.
* `npm run test:e2e`: Playwright (Pixel 7 + desktop Chrome). A local **mock** of Google OAuth + Picker enforces the real contract (Bearer, PKCE verification, string `maxItemCount`, durations, `FAILED_PRECONDITION`, pagination). Journeys: couple play end-to-end, host setup, three-browser party game, Google flow against the mock, the not-configured path, security, wheels/keyboard/RTL/LTR, 320 px layout.

**Not covered by automation:** a live Google account (needs your credentials), real iOS Safari / physical Android devices, and the licensed map provider.

---

## Deploying to a small Google Cloud VM (personal use)

The repo ships a `Dockerfile`, a `docker-compose.yml` (app + Caddy with automatic HTTPS), a `Caddyfile` and helper scripts in `deploy/`. **[docs/DEPLOY-GCP.md](docs/DEPLOY-GCP.md)** walks through creating the VM, the Google OAuth settings for Google Photos (Testing mode with your own account as a test user is enough), the configuration template (`deploy/.env.production.example`) and day-to-day updates. flashback needs a server with a persistent disk, so it cannot run on GitHub Pages or other static hosts.

Set `OWNER_PASSCODE` to make the server private: creating games (and uploads, Google Photos imports, the demo) then needs the passcode once per browser at `/unlock`; joining and playing a room never does.

## Deployment checklist

1. Provision a host with a persistent volume; `npm ci && npm run build && npm start`.
2. Set env vars (`APP_BASE_URL` with `https://`, `DEMO_MODE=false`, map provider key, Google values if used, `FLASHBACK_DATA_DIR` on the volume).
3. Terminate HTTPS at a proxy that sets `X-Forwarded-For`; disable response buffering for `/api/rooms/*/events`.
4. Schedule `GET /api/cron/cleanup` (with `CRON_SECRET`) or `npm run cleanup`.
5. Back up the data directory if you care about games beyond the retention window.
6. Have the privacy text legally reviewed and complete Google's verification before public launch.

## Known limitations

* HEIC/HEIF is rejected with a clear message (sharp's prebuilt binaries lack an HEVC decoder). Export as JPEG.
* SQLite + local disk instead of PostgreSQL/Supabase; no RLS because there is no client-side database access. See "Single instance".
* Google access tokens are not refreshed (no offline access requested, by design): each import may send the user through Google's quick consent again.
* No place-search box; the pin can be placed by tap, drag or keyboard. Place labels need a MapTiler key.
* No scheduled job inside the app process beyond the opportunistic cleanup.
* No Content-Security-Policy is shipped (map/style provider hosts vary per deployment); add one that allows your provider, `worker-src 'self'` and `img-src blob: data:`.
* The privacy page is a development draft, not legal advice.

## Troubleshooting

* *Blank map:* check the browser console; the app falls back to the bundled outline style if the remote style fails. Ensure `public/maplibre/maplibre-gl-worker.mjs` exists (`npm run predev` re-copies it).
* *`ERR_REQUIRE_ESM … magic-string` on Node 20.10:* handled by an npm `overrides` entry; re-run `npm install`.
* *`Segmentation fault` from better-sqlite3:* the pinned 12.x supports Node 20; newer majors require Node 22+.
