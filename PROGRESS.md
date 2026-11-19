# LoMu — progress report

Personal music app replacing YouTube Music Premium: an **Android app** plus a **Next.js web player**, single owner, no ads. Forked from BeatWave (GPL-3.0); the original copyright headers in source files are kept as the licence requires.

_Last updated: 2026-11-18. Branch `music`. The upstream git remote has been removed on purpose; commits are local only._

---

## Status at a glance

| Area | Status |
|---|---|
| Repo rename to **LoMu** (folder, Gradle project, package `com.lomu.app`, app name, web name) | ✅ Done |
| App icon (headphones avatar, unmodified, on black) — Android + web | ✅ Done |
| Removal of bloat, gimmicks and the developer's backend | ✅ Done (source deleted) |
| Android app compiles and builds an APK | ✅ Done (2026-11-18) |
| Android UI (Compose): welcome, Home, Search, Library, album / artist / playlist, full-screen vinyl player with synced lyrics and queue, Settings | ✅ Built, compiles. 🔶 **Not yet seen running on a device** (see Known issues) |
| Web player UI | ✅ **Redesigned 2026-11-18** in the Dashboard console's design language (flat paper surfaces, hairline borders, Inter, Phosphor icons, pill buttons, sidebar + topbar, side panels). No vinyl and no big logo. Customisable, personalised home (quick picks, week stats, mixes, your artists, moods, trending, new releases). Checked in screenshots (light, dark, phone) and by the e2e tests |
| Web catalogue APIs (home, search, album, artist, playlist, radio, lyrics) | ✅ Working against live YouTube Music |
| Web audio playback | ✅ Fixed 2026-11-18: `VISIONOS` client first, plus a tail-of-file probe. Full tracks and mid-file seeks verified; Chromium plays past the old ~1 MB cut-off |
| Own account system (single owner, username/password, JWT + rotating refresh tokens) | ✅ Server + web + Android |
| Sync server (SQLite, document log with cursors, last-write-wins, tombstones, SSE) | ✅ Server + web client. Android syncs likes and listening history (polls every minute). **Playlists sync web ↔ server only**; Android playlists are not synced yet |
| Recommendation engine | ✅ Server-side: play/skip/like signals with recency decay, YouTube-radio candidates, consensus ranking, per-artist diversity. Shelves: Your Mix, On Repeat, Because you played X, Discover. Adaptive autoplay endpoint (`/api/recs/next`) exists; the web player does not call it yet. "New from your artists" not built |
| One-time "Import from YouTube Music" | ✅ Web: "Import" on any playlist page. ✅ Android: Settings → Import (Google sign-in in a WebView, cookie discarded afterwards). Code complete, **untested against a real account** |
| Automated tests | ✅ 19 unit tests (vitest) + 5 Playwright end-to-end tests (account lock-down, whole-file streaming, sync LWW, real playback in Chromium, sign-out). Android: `app/smoke-test.sh` (adb) |
| Deploy to homelab (LXC + nginx subdomain) | 🔶 **Prepared, not executed**: `deploy/` has the install script, systemd unit, nginx site and a README checklist. The production build and `next start` were verified locally |

---

## ▶ How to resume (read this first)

### Environment (this PC)

| Tool | Where / version |
|---|---|
| JDK | 21, `JAVA_HOME=C:\Softwares\Java` |
| Android SDK | `C:\Users\Lo\AppData\Local\Android\Sdk` (`ANDROID_HOME` set) |
| adb | `C:\Softwares\platform-tools\adb` — phone: Pixel 7 (serial starts `2A231FDH`) |
| Node / npm | 24.18 / 11.16 |
| Python | 3.12; Pillow installed in user site (icon generation) |
| Gradle | wrapper 9.4.1 (`./gradlew`), AGP 9.2.1, Kotlin 2.3.10 |
| Shells | Git Bash and PowerShell both available |

### Start the web player

```bash
cd web
npm install            # first time only
npm run dev            # http://localhost:4100  (port 3000 is taken by another app)
npm run typecheck      # must stay clean
node tests/shots.mjs <outDir>   # screenshot tour (desktop + mobile + dark), dev server must be running
```

### Build and install the Android app (once it compiles)

```bash
./gradlew :app:assembleDebug                     # no product flavours any more
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.lomu.app.debug/com.lomu.app.MainActivity
adb exec-out screencap -p > shot.png             # phone screenshot
```

The first compile takes about 6 minutes. **Before stripping, the original code compiled cleanly**, so every error from now on comes from the removals.

### Immediate next tasks, in order

**1. ✅ Android core compiles (done 2026-11-18).** What was removed to get there: Listen Together DI, `SyncUtils` (YouTube-account sync) from the view models, canvas downloads, TIDAL / JioSaavn / 8spine intercepts in `YTPlayerUtils`, kuromoji / tinypinyin romanization (Japanese/Chinese lyrics are now left as-is), the dead lyrics providers, and from `MusicService`: Discord RPC, Last.fm, ListenBrainz, Spotify sync, DJ engine, 8D, stall watchdog, sleep timer, widgets and Android Auto lyrics. **Kept:** plain crossfade (`startCrossfade`, `startManualTrackTransition`), EQ, silence skipping, queue persistence. The Room schema folder was renamed to `app/schemas/com.lomu.app.db.InternalDatabase`, which the migrations need.

Left over and harmless: unused `isTidalStream` / `isSpineStream` fields on `PlaybackData`, unused preference keys in `constants/PreferenceKeys.kt`, `CastConnectionHandler.kt` (compiles; Cast is not wired to any UI), `LyricsMetadataPlayer.kt`, and the unused `isRefreshing` flows in two view models. Clean these up when convenient.

**2. ✅ `MainActivity` + Compose UI written.** Files: `MainActivity.kt` (binds `MusicService`, provides `PlayerConnection`, sync client, importer), `ui/` (`Theme`, `Nav`, `Data`, `Components`, `Screens`, `Player`, `ImportScreen`, `Root`), `sync/SyncClient.kt`, `sync/YtmImporter.kt`. Icons are text glyphs and the layout is simpler than the web player's; polish is the open item.

**3. ✅ Web playback fixed** (see Known issues #1).

**4. ✅ Sync server + accounts, recommendation engine, tests** (see the sections below).

**5. What is left, in order:**
1. Run the Android app on a real device or emulator (`app/smoke-test.sh`), fix whatever it shows, and check playback, lyrics, likes, sync and the importer for real.
2. Deploy: follow `deploy/README.md`.
3. Android: sync playlists, use `/api/recs/next` for autoplay, polish the UI to match the web design (vinyl list wheel, neumorphic cards), downloads UI.
4. Web: call `/api/recs/next` for autoplay, visual pass with `tests/shots.mjs` (it predates the login gate: sign in first or seed a session).

### Gotchas already hit (save yourself the time)

- **adb locks the repo folder.** The adb server keeps its working directory where it was first started. Start it from outside the repo (`cd /c && adb start-server`), or folder renames fail with "in use".
- **Next 16 dev reload loop on Windows.** Browser-log forwarding writes `.next/dev/logs/next-development.log`, which retriggers the watcher. Keep `logging.browserToTerminal: false` and `agentRules: false` in `next.config.ts`.
- **Never write files inside `web/` while the dev server runs** (probe scripts, caches). They trigger rebuilds and page reloads. Put scratch scripts outside the repo. The youtubei.js cache already lives in the OS temp dir (`LOMU_CACHE_DIR` overrides it).
- **`globalThis` singletons survive hot reload.** The YouTube session (`__lomuYt`) and stream caches persist across edits, so **restart the dev server** after changing session options in `server/yt.ts`.
- **styled-jsx needs `components/StyleRegistry.tsx`** in the root layout, or the first paint is unstyled.
- **Next.js 16 has breaking changes.** Its own docs are in `web/node_modules/next/dist/docs/`; check there before guessing APIs. Route-handler `params` is a `Promise`.
- **Don't probe YouTube in tight loops.** It got this IP bot-flagged ("Sign in to confirm you're not a bot") for ANDROID_VR / VISIONOS for a while. Use a **YouTube-issued visitor id** (`generate_session_locally: false`); that cleared it in testing.
- **Deezer is unreachable from this network**, so don't use it for enrichment. TheAudioDB (free key `123`), Wikipedia, LRCLIB, iTunes and MusicBrainz all work.
- **Shell quoting on Windows** mangled `\b` / backslashes in `sed` / Python one-liners twice. Prefer the editor for regex-heavy edits.

---

## Decisions made with the owner

- **Single user.** Own LoMu account (username + password, JWT); **no Google login as the account**.
- **Sync server = the web app** (`web/`), self-hosted on the owner's Proxmox homelab behind the existing nginx / wildcard TLS, on a subdomain the owner will choose. A home IP is also what YouTube is least likely to block.
- **YouTube is used anonymously** for the catalogue and audio. Best quality without Premium is Opus ~160 kbps (AAC ~128 kbps fallback). No lossless/TIDAL source.
- **Import from YouTube Music** is a one-time import (playlist link, or a one-time Google sign-in on the phone whose cookie is discarded afterwards).
- **No Windows/Electron app.** The web player (installable as a PWA) covers desktop.
- **Explore is hidden by default.** It is turned on from Settings → Developer.
- **Design reference:** soft light neumorphic look (pale lavender/white), heavy black grotesk headlines with a grey second line ("New / *Age Of* / Music"), circular vinyl artwork, a curved wheel list, and a "Get Started" welcome screen.

---

## What was removed

**Gradle modules:** kizzy (Discord), lastfm, kugou, simpmusic, youlyplus, paxsenixlyrics, musixmatchlyrics, jiosaavn, spotify, spine, shazamkit, canvas, applecanvas, artistvideo, vivimusiccanvas, listen-together-server.
**Kept:** `innertube` (YouTube Music API), `lrclib`, `betterlyrics`.

**App code:** the entire old UI (~118k lines), Listen Together, song recognition (+ unused C++ fingerprinting lib), AI playlists, updater/changelog, widgets, Supabase backend + admin panel + feedback forms, the remote config fetched on every launch (`config6767.vercel.app`), DJ / mashup / 8D audio, sleep timer, Android Auto, Cast (+ the FOSS/GMS flavours), local-file playback, ringtone setter, TIDAL / JioSaavn / Spotify sources, multi-account switching, 60+ translations (the French one broke the upstream build), and repo clutter (images, docs, CI, crowdin, renovate).

**Manifest:** dropped sync/listen deep links, widgets, icon-switcher alias, microphone, Bluetooth, install-packages and storage permissions.

**Privacy note (from the audit):** the original app never sent the Google login cookie anywhere but YouTube. It did fetch remote config from the developer's server on every launch, and it shipped a full-access database key and a self-updater. All of that is gone.

---

## Android (`app/`)

**Done**
- Package `com.lomu.app`, applicationId `com.lomu.app` (debug: `.debug`), app name "LoMu".
- New minimal `res/`: only the strings and drawables the core still uses, a `Theme.Music` light/dark theme, and the adaptive launcher icon generated from `branding/icon-source.png`.
- New `App.kt`: anonymous YouTube (persisted visitor id), cipher-WebView warm-up, Coil image cache.
- `build.gradle.kts` rewritten: no flavours, no Supabase/LastFM/admin build fields, unused libraries dropped (protobuf, ucrop, lottie, shimmer, kuromoji, tinypinyin, cast…).
- ProGuard rules updated to the new package. They protect the engine's WebView JavaScript bridges in release builds, so they matter.

**Engine kept untouched (this is what plays the music):** `innertube/`, `utils/YTPlayerUtils.kt` (client fallback chain), `utils/cipher/`, `utils/potoken/` (real-WebView proof-of-origin tokens), `utils/sabr/` + `assets/solver/`, `playback/MusicService.kt`, `PlayerConnection.kt`, queues, downloads, Room DB, lyrics helpers, equalizer engine.

**Next steps**
1. Get the core compiling. Remove from `MusicService.kt` / `PlayerConnection.kt` / `MediaLibrarySessionCallback.kt` / `DownloadUtil.kt` / `LyricsHelper.kt` every reference to deleted features (Discord, Last.fm, ListenBrainz, Spotify, TIDAL/JioSaavn/8spine intercepts in `YTPlayerUtils`, DJ engine, sleep timer, widgets, Listen Together, canvas). The baseline before stripping compiled cleanly in about 6 minutes.
2. Write the new Compose UI in the agreed design: welcome, Home, Search, Library, album / artist / playlist, full-screen vinyl player with synced lyrics and queue, Settings with a Developer section (Explore toggle).
3. LoMu account sign-in + sync client; one-time YouTube Music import.
4. Install and test on the Pixel 7 over adb. It disconnected during this session; reconnect it and accept the USB-debugging prompt.

---

## Web player (`web/`)

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · TanStack Query · Zustand · youtubei.js 18 (server side only) · styled-jsx · Inter Tight.

**Run it:** `cd web && npm run dev`, then open <http://localhost:4100>. Port 3000 is used by another app on this PC, so LoMu uses 4100. `npm run typecheck` passes.

**Server (`src/server/`)**
- `yt.ts`: one shared youtubei.js session with a YouTube-issued visitor id; stream-URL JavaScript evaluated in an isolated `vm` sandbox with a timeout; cache kept **outside** the project folder (writing inside it caused a dev reload loop).
- `map.ts`: turns YouTube's node trees into simple `Track / Album / Artist / Playlist / Shelf` types (handles artist names hidden in text, album tracks without artwork, etc.).
- `catalog.ts`: home (YouTube feed + explore shelves, because anonymous home feeds are thin), explore, moods, search, suggestions, album, artist, playlist (with continuations), radio, related, lyrics. **Synced lyrics come from LRCLIB**, falling back to YouTube's plain lyrics.
- `enrich.ts`: artist extras from **TheAudioDB** (square photo, banner, genre, origin, year) and **Wikipedia** (bio when YouTube has none). Deezer was tried but is unreachable from this network.
- `stream.ts`: audio proxy with proper 200/206 range support. Pulls from googlevideo in 1 MiB pieces, prefers Opus and falls back to AAC, and switches client mid-song on failure (same itag, same byte offset).
- API routes under `src/app/api/*`.

**UI (`src/app/`, `src/components/`)**
- Welcome ("New / Age Of / Music", CSS-drawn clear vinyls, CD with live artwork, cassette, Get Started).
- Home (greeting, *Jump back in* from your history, shelves).
- Search (live suggestions, recent searches, top result, songs, artists, albums, playlists, videos).
- Library (Liked, Playlists, Albums, Artists, History; create, rename and delete playlists).
- Album / playlist pages (sleeve with the record sliding out; Save; Import).
- Artist page (enriched photo / banner / facts, top songs, shelves, About).
- Explore (curved wheel list with centre pill + Play, focus panel; trending, new releases, moods). **Hidden unless enabled in Settings → Developer.**
- Floating mini player, full-screen player (spinning vinyl, seek, shuffle / repeat, like, synced lyrics with tap-to-seek, queue with autoplay toggle), right-click track menu, toasts.
- Media Session support (keyboard / OS media keys, lock-screen controls), PWA manifest, light / dark / system theme.
- Settings: theme, autoplay, clear history, **Developer** (Explore, artist enrichment, stream info, replay welcome).

**State:** library (likes, history, playlists, saved items) and player queue are stored in the browser for now. They move to the sync server once it exists.

**Fixed during development**
- Endless page-reload loop in dev: browser-log forwarding wrote into `.next/dev/logs`, which the Windows file watcher picked up. Disabled in `next.config.ts`.
- styled-jsx styles missing on first paint: added a style registry (`components/StyleRegistry.tsx`), as the Next 16 docs require.
- Wrong artist names ("Song") from text-only subtitles; "N/A" playlist authors.

---

## Known issues (most important first)

1. ~~Web playback stops after about 50 seconds.~~ **Resolved** (see status table; notes below kept for history). If it regresses, `web/scripts/po-chromium.mjs` (real-Chromium BotGuard minter, mints 716-char tokens) and `scripts/probe-full.mjs` (per-client full-download probe) are the tools to start from. Tokens alone did not unlock the blocked clients.
   - **Cause:** googlevideo now serves only the first ~1 MB of any audio stream unless the request carries a valid proof-of-origin (PO) token. This was measured from every client (ANDROID_VR, IOS, MWEB, YTMUSIC) and every request pattern.
   - **Tried:** a token minter that runs YouTube's BotGuard in jsdom in a separate process (`web/scripts/po-minter.mjs`) mints tokens, but googlevideo still rejects them.
   - **Next options, in order:**
     - (a) Stream through YouTube's newer **SABR protocol** using LuanRT's `googlevideo` package, which is how the official web player works now.
     - (b) Mint tokens in a **real headless Chromium** (Playwright is already installed), mirroring how the Android engine uses a real WebView.
   - The Android engine already has its own WebView-based token generation and is expected to be fine, but that is unverified until the app builds.

   **What was measured (2026-11-18, youtubei.js 18.3.0, anonymous):**

   | Test | Result |
   |---|---|
   | Player response, ANDROID_VR / VISIONOS, locally generated visitor id | `LOGIN_REQUIRED` (bot check) after heavy probing |
   | Same, with a YouTube-issued visitor id | `OK` again |
   | Player response, IOS / MWEB / YTMUSIC | `OK`; TV / WEB_EMBEDDED / WEB fail |
   | Best audio offered | itag 251 Opus ~150 kbps (IOS: only itag 140 AAC 128 kbps) |
   | googlevideo `bytes=0-1048575` (first 1 MiB) | 206 ✅ |
   | Any byte past ~1 MiB: second chunk, a mid-file seek as the first request, whole-file range, no range header | 403 ❌, on every client |
   | Two 512 KiB chunks inside the first MiB | both 206 |
   | User-Agent matching the client / forcing IPv4 vs IPv6 | no change (this host has IPv4 only) |
   | `pot` from `scripts/po-minter.mjs` (bgutils-js + jsdom + `@napi-rs/canvas`, integrity token TTL 12 h, token length 716) added | still 403 past 1 MiB (worse for ANDROID_VR: first chunk 403 too) |

   - **Conclusion:** googlevideo enforces GVS proof-of-origin for anything past the first segment, and the jsdom-minted tokens are not accepted. The `n` parameter isn't the cause, because ANDROID_VR/IOS URLs carry none.
   - **Where the pieces are:** `web/scripts/po-minter.mjs` speaks JSON lines over stdio (`init` with `{program, globalName, interpreterUrl}` from `Innertube.getAttestationChallenge('ENGAGEMENT_TYPE_UNBOUND')` and requestKey `O43z0dpjhgX20SCx4KAo`, then `mint` with a `binding`). It is **not yet wired into `server/stream.ts`**.
   - **Already in `server/stream.ts`:** 1 MiB chunking, range math, the per-client "flagged" cooldown and same-itag client switching. These stay useful whichever fix is chosen.
2. **Heavy probing during this session got this IP bot-flagged** for some clients ("Sign in to confirm you're not a bot"). It is usually temporary. The server now uses a YouTube-issued visitor id, which cleared it for ANDROID_VR in testing.
3. **The Android app has never been run on a device.** It compiles and builds; the Pixel 7 was not connected during development, so UI, playback, sync and import are unverified there. Run `app/smoke-test.sh`.
4. The screenshot tour (`web/tests/shots.mjs`) predates the login gate; it needs a signed-in session.
5. **Before the owner account exists the web server is open to anyone who can reach it.** Set `LOMU_SETUP_CODE` (the install script does) and create the account first.

---

## Web design system (redesign, 2026-11-18)

Follows `Dashboard/DESIGN_SYSTEM.md` (the `Dashboard/` folder is a separate reference repo and is git-ignored). Tokens and utilities are in `web/src/app/globals.css`; shared pieces in `components/ui.tsx` (`Sheet`, `Toggle`, `Stat`, `SparkBars`, `EmptyState`, `PageHeader`); icons are inlined Phosphor paths generated by `scripts/gen-icons.mjs` into `components/icons.ts` (add a glyph to the map there, don't draw one-off SVGs). The home page sections are switchable (`HOME_SECTIONS` in `player/settings.ts`, Customise panel on Home and Settings → Home); the personal numbers come from `lib/insights.ts` (unit-tested). Screenshot tour: `node tests/shots.mjs <outDir>` against a dev server with a throwaway `LOMU_DATA_DIR`.

## Accounts, sync and recommendations (built 2026-11-18)

**Server (`web/src/server/`)**
- `db.ts`: one SQLite file via Node's built-in `node:sqlite`, in `LOMU_DATA_DIR` (default `~/.lomu`, kept outside the project so it never triggers the dev bundler).
- `auth.ts`: single owner (scrypt password hash), HS256 JWT access token (15 min) + random refresh token (60 days, stored hashed, **rotated on every use**). Browsers get httpOnly cookies, the phone sends `Authorization: Bearer`. Until an owner exists the API is open (first-run setup); afterwards every API route, including the audio proxy, requires a session. Login is rate-limited (8 failures / 10 min per client). Optional `LOMU_SETUP_CODE` guards account creation.
- `sync.ts`: documents `(kind, key) -> JSON`, kinds `like`, `playlist`, `saved`, `play`, `search`, `queue`. Last write wins by the client's `updated` timestamp; deletes are tombstones; each accepted write gets the next `seq`; `GET /api/sync?since=N` is incremental; `GET /api/sync/events` is server-sent events so other devices pull immediately.
- `recs-core.ts` (pure, unit-tested) and `recs.ts` (fetches YouTube radio for the top seeds, cached 3 min).
- Routes: `/api/auth/{status,setup,login,refresh,logout}`, `/api/sync`, `/api/sync/events`, `/api/recs`, `/api/recs/next?seed=&recent=`.

**Web client**: `player/sync.ts` diffs the library store against its previous snapshot and pushes the changes; `components/AuthGate.tsx` is the login / first-run screen; Settings shows the account and sync status; Home shows the recommendation shelves.

**Android client**: `sync/SyncClient.kt` (login, refresh, incremental pull, push of likes and plays, recs), Settings screen for server address and sign-in.

## Tests

```bash
cd web
npm test            # 19 unit tests: scoring, sync log + LWW, auth/JWT/refresh rotation, client diffing, range parsing
npm run e2e         # 5 Playwright tests on a throwaway server (port 4199): needs network (real YouTube)
npm run typecheck
# Android, device connected:
app/smoke-test.sh
```

---

## Roadmap (what is still open)

- **Android on a device:** first real run, bug-fixing, polish to match the web design.
- **Android playlists sync**, adaptive autoplay from `/api/recs/next` on both clients, "New from your artists" shelf.
- **Offline downloads UI** on Android (the engine supports it).
- **Deploy** to the homelab (see `deploy/README.md`) and add the Uptime Kuma check.
- **Housekeeping:** remove unused preference keys / `PlaybackData` fields, restrict cleartext traffic in `network_security_config.xml` once the server has TLS.

---

## Repo layout

```
LoMu/
├─ app/            Android app (com.lomu.app): engine kept, new Compose UI in ui/, sync in sync/
├─ innertube/      YouTube Music API client (Kotlin)
├─ lrclib/, betterlyrics/   lyrics providers
├─ branding/       icon source (transparent PNG)
├─ web/            Next.js web player + sync server
├─ deploy/         homelab install script, systemd unit, nginx site, README
│  ├─ src/app/         pages + API routes
│  ├─ src/components/  UI components
│  ├─ src/player/      player engine, library, settings stores
│  ├─ src/server/      YouTube layer, mappers, stream proxy, enrichment
│  ├─ scripts/         po-chromium.mjs / po-minter.mjs (PO tokens), probe-full.mjs (per-client download probe)
│  └─ tests/           unit/ (vitest), e2e/ (Playwright), shots.mjs (screenshot tour)
└─ PROGRESS.md     this file
```

---

## Phone auto-update on push

`git config core.hooksPath .githooks` (once per clone) enables `.githooks/pre-push`. After a push that touches the Android code it runs `scripts/update-phone.sh` in the background: build the debug APK, then `adb install -r` on every connected phone, which updates the installed app in place (data and sign-in kept). If no phone is connected over adb it skips silently; the push is never blocked. Log: `.git/phone-update.log`. Run it by hand any time with `scripts/update-phone.sh`.

The in-place update only works while builds are signed with the same key, so build on this PC (the debug key) and do not uninstall the app first.
