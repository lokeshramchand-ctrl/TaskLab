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
