# flashback — implementation plan

Status legend: ✅ built and exercised · 🔑 built, needs real credentials/approval to verify live

## Decisions (and why)

| Area | Choice | Reason / deviation from the original spec |
|---|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript, Tailwind 4 | as specified; Node 20.10 compatible |
| Map | MapLibre GL JS 6 + bundled offline fallback style | as specified; v6 worker must be served statically (`public/maplibre`) |
| Wheels | Own CSS scroll-snap component | no date input/dropdowns, per spec |
| Images | sharp (orientation, EXIF strip, 4 real crops) | as specified |
| Data | **SQLite (better-sqlite3) + local private disk** | *Deviation:* spec recommends Postgres/Supabase. Chosen so the whole product (incl. multiplayer) runs with zero credentials. Same relational schema, constraints, FKs and migrations (`db/migrations`). Not horizontally scalable. |
| Realtime | **Server-Sent Events + polling fallback**, server-authoritative state | *Deviation:* no Supabase Realtime. Real multi-device sync, single instance. |
| Auth | anonymous HttpOnly cookie; Google OAuth only for Photos | as specified |
| Google | Picker API v1 via OAuth code + PKCE, server-side everything | as specified; verified against a contract-enforcing mock |

## Milestones

1. ✅ **Core + shared device**: guess screen (map + pin + two bottom wheels), setup wizard (upload, answer, crop focus, review), handoff lock, reveal, summary/replay/role swap, scoring.
2. ✅/🔑 **Google Photos Picker**: consent, OAuth/PKCE, session, polling, pagination, import, cleanup, error states. Live verification needs credentials.
3. ✅ **Party**: rooms, QR/link, server timers, private guesses, leaderboard, reconnect, host-away auto-advance.
4. ✅ **QA/docs**: unit + integration + browser E2E, README, `.env.example`, retention/cleanup.

## Backlog (not done)

- Postgres/Supabase adapter and Redis/Supabase Realtime bus for multi-instance deploys
- HEIC conversion (needs a licensed HEVC decoder)
- Place-search box; richer reverse-geocoding options
- Token refresh for Google (currently re-consent per import by design)
- Native-device test pass (iOS Safari, physical Android)
