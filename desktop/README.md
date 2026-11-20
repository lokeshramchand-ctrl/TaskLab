# LoMu for Windows

The web player plus its own copy of the LoMu server, in an Electron window. The library, history, recommendations,
catalogue cache and audio cache live on the PC (`%APPDATA%\LoMu`), so it keeps working when the home server is off.
In the background it syncs with the home server (Settings > Home server) whenever it can; edits made while the
server is away are queued in the local database and sent later.

```bash
cd desktop
npm install
npm run dev      # build-less run against the existing web/.next (run `npm run prepare-server` once first)
npm run pack     # build web + unpacked app in dist/win-unpacked
npm run dist     # build web + installer: dist/LoMu Setup <version>.exe
```

How it fits together
- `main.js` starts the Next standalone server (`build/server`) on a free 127.0.0.1 port using Electron's own Node, and
  sends a per-launch secret header with every request, so there is no login screen (`LOMU_LOCAL_TOKEN`, web/src/server/auth.ts).
- `web/src/server/hub.ts` mirrors the local document log with the home server (same `/api/sync` protocol as the phone).
- `web/src/server/audiocache.ts` keeps songs you really listen to on disk (default 2 GB, `LOMU_AUDIO_CACHE_MB`).
- `cached()` in `web/src/server/yt.ts` keeps the last good catalogue/recommendation answers and serves them when YouTube is unreachable.
- Closing the window hides it to the tray so music keeps playing; "Quit" in the tray menu exits.
- Logs: `%APPDATA%\LoMu\logs\server.log`.

Updates
- `.github/workflows/desktop.yml` runs on every push to `music` or `main` that touches `web/`, `desktop/` or the workflow
  (edit `paths:` to change that). It runs the web typecheck and tests, builds the installer as version `1.0.<run number>`
  and publishes it as GitHub release `v1.0.<n>` together with `latest.yml`.
- The installed app (electron-updater) checks that feed 15 s after start and then every 30 minutes, downloads a newer
  version in the background and asks to restart; if you pick Later it installs when you next quit. LoMu menu >
  "Check for updates" does it on demand. The log is `%APPDATA%\LoMu\logs\updater.log`.
- The installer is unsigned, so only the very first install shows the SmartScreen warning; updates are verified by their hash from `latest.yml`.
