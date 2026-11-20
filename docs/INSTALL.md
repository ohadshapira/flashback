# Installing and running flashback

This guide takes you from a fresh clone to a running app, then to the optional extras (a nicer map, Google Photos, tests, production). The demo needs no accounts and no keys.

## 1. Requirements

* **Node.js 20.9 or newer** (developed on 20.10 and 22). Check with `node -v`.
* **npm** (comes with Node).
* A C/C++ toolchain is *not* needed: `better-sqlite3` and `sharp` ship prebuilt binaries for Windows, macOS and Linux.
* Any current browser. Chromium is only needed for the end-to-end tests (see section 6).

## 2. Install and start

```bash
git clone https://github.com/ohadshapira/flashback.git
cd flashback
npm install        # also copies the MapLibre worker into public/maplibre
npm run dev        # http://localhost:3000
```

Open <http://localhost:3000>. No configuration is required.

The database (a SQLite file) and every uploaded photo are created on first use in `./data`. That folder is private to your machine and is git-ignored.

## 3. Try it without any accounts

On the home page, the **Try the demo** card builds a ready-to-play game of three rounds from original illustrations with fictional answers. It is clearly labelled *demo content* and is **not** connected to Google Photos.

| Demo button | What you get |
|---|---|
| **Couple** | Pass-the-phone game on one device |
| **Family & Friends** | One screen, one team answer |
| **Partners** | A parent and a child as one team (the demo has a fictional family with four places) |
| **Party** | A party room where you play against three *simulated* players. Pick *Classic* or *Scratch* (harder: you scratch the photo clear and score less the more you reveal) |

To create **your own** game, use the mode buttons on the home page, upload photos from your device, and set each photo's real place and month/year.

## 4. Configuration (optional)

Copy the example file and edit what you need:

```bash
cp .env.example .env.local        # Windows PowerShell: Copy-Item .env.example .env.local
```

`.env.local` is git-ignored. Restart `npm run dev` after changing it. `NEXT_PUBLIC_*` values are read when the app is built, so rebuild after changing them in production.

| Variable | What it does |
|---|---|
| `APP_BASE_URL` | Public address of the app (default `http://localhost:3000`). Used for share links. With `https://` cookies are marked `Secure`. |
| `DEMO_MODE` | `true` shows the demo card. Use `false` in production. |
| `NEXT_PUBLIC_DEFAULT_LOCALE` | `en` (default) or `he` (Hebrew, right-to-left). Users can also switch in the header. |
| `NEXT_PUBLIC_MAP_START` | `world` opens the map on the whole world. By default it opens on the player's own region (computed on the device, never sent anywhere). |
| `NEXT_PUBLIC_MAP_STYLE_URL` / `NEXT_PUBLIC_MAPTILER_KEY` | Map tiles. See "Map" below. |
| `IMAGE_RETENTION_DAYS` | Games and photos are deleted this many days after the last activity (default 7). |
| `FLASHBACK_DATA_DIR` | Where the SQLite file and private photos live (default `./data`). |
| `CRON_SECRET` | Optional bearer token for `GET /api/cron/cleanup`. |
| `OWNER_PASSCODE` | Optional. When set, only someone who entered the passcode at `/unlock` can create games, upload photos or use the demo. Joining and playing a room never needs it. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`, `GOOGLE_TOKEN_ENCRYPTION_KEY` | Google Photos import (section 5). |

**Never commit `.env.local`, and never put real keys in `.env.example`.**

### Map

The app picks the first of these that is available:

1. `NEXT_PUBLIC_MAP_STYLE_URL` (any MapLibre style URL; the value `local` forces the bundled offline outline map).
2. A MapTiler key in `NEXT_PUBLIC_MAPTILER_KEY` (free tier; also enables place labels).
3. OpenFreeMap "positron": free OpenStreetMap vector tiles, no key. Attribution is shown on the map.

If the remote style fails to load, the app falls back to a bundled offline country-outline map (Natural Earth, public domain). For real use, configure a licensed provider such as MapTiler and keep the attribution visible. Do not use the public OpenStreetMap tile server in production.

## 5. Importing from Google Photos (optional)

Without these settings the app says **"Google Photos is not configured in this development environment."**, the button is disabled, and uploading from the device keeps working. Nothing is faked.

1. Create a project in the [Google Cloud console](https://console.cloud.google.com/) and enable **Google Photos Picker API** (not Drive's "Google Picker API").
2. Configure the **OAuth consent screen**: app name `flashback`, your own email as the contact. Keep the publishing status on **Testing** and add **your own Google account as a test user**. For personal use you never need to publish or verify the app; Google shows an "unverified app" screen and you choose *Advanced, then continue*.
3. **Credentials, then OAuth client ID, then Web application**:
   * Authorized JavaScript origin: `http://localhost:3000`
   * Authorized redirect URI: `http://localhost:3000/api/auth/google/callback`
4. Put the values in `.env.local`:

   ```dotenv
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
   GOOGLE_TOKEN_ENCRYPTION_KEY=<32 random bytes, base64>
   ```

   Generate the key with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```
5. Restart the app. On the photo step choose **Choose from Google Photos**, accept the disclosure, pick photos in the Google tab that opens, and come back.

Good to know:

* Google gives the app each photo's **creation date** (used to pre-fill the month and year wheels) but **no location**. You always place the pin yourself. Photos uploaded from the device pre-fill the pin only when the file has GPS data. Everything pre-filled can be changed.
* If you use several Google accounts, sign in with the one that owns the photos and is listed as a test user.
* Before opening the app to the public, Google may require OAuth verification and a review under the *Google Photos API User Data and Developer Policy*. Do not assume approval.

## 6. Checks and tests

| Command | What it does |
|---|---|
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit and integration tests (real SQLite and real image processing) |
| `npm run test:e2e` | Browser tests with Playwright (builds the app and starts a mock Google server) |
| `npm run build` / `npm start` | Production build / production server |
| `npm run cleanup` | Deletes expired games and orphaned media now |

Before the first end-to-end run, install the test browser once:

```bash
npx playwright install chromium
```

The end-to-end suite runs on its own ports (3100, 3101, 4010) and its own data folder, so it can run while `npm run dev` is open.

## 7. Running it for real

* **On your own network** (to play with other phones in the same Wi-Fi): set `APP_BASE_URL` to your computer's address, for example `http://192.168.1.20:3000`, and start with `npm run build && npm start`.
* **On a server**: flashback needs one always-on process and a persistent disk (SQLite plus local photo storage), so it does not run on static hosts such as GitHub Pages or on serverless platforms with temporary disks. A step-by-step guide for a small Google Cloud VM with Docker and automatic HTTPS is in [DEPLOY-GCP.md](DEPLOY-GCP.md).

## 8. Troubleshooting

* **Blank map**: open the browser console. The app falls back to the bundled outline map if the remote style fails. Make sure `public/maplibre/maplibre-gl-worker.mjs` exists (`npm run predev` copies it again).
* **`ERR_REQUIRE_ESM ... magic-string` on Node 20.10**: handled by an `overrides` entry in `package.json`; run `npm install` again.
* **`Segmentation fault` from better-sqlite3**: the pinned 12.x supports Node 20; newer major versions need Node 22 or newer.
* **Google button disabled**: one of the four `GOOGLE_*` values is missing or empty.
* **Google says `redirect_uri_mismatch`**: the redirect URI in the OAuth client must match `GOOGLE_OAUTH_REDIRECT_URI` exactly.
* **Google says access denied or the app is blocked**: the account you signed in with is not in the **Test users** list.
* **`npm run build` fails with `EPERM` on `.next/trace`** while a dev server is running: both use the `.next` folder. Stop the dev server before building.
* **HEIC photos are rejected**: export them as JPEG first (the image library has no HEVC decoder).
