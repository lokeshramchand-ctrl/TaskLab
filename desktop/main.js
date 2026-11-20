'use strict';
/*
 * LoMu for Windows.
 *
 * The app is the web player plus its own copy of the LoMu server (the same code that runs on the homelab),
 * started on 127.0.0.1 with its data in %APPDATA%\LoMu. Because the library, listening history, recommendations,
 * catalogue cache and audio cache all live on this PC, it keeps working when the home server is off. The server
 * syncs with the home server in the background whenever it can (see web/src/server/hub.ts).
 */
const { app, BrowserWindow, Menu, Tray, nativeImage, session, shell, dialog, net, powerMonitor } = require('electron');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const nodeNet = require('node:net');
const path = require('node:path');
const { autoUpdater } = require('electron-updater');

app.setName('LoMu');

// Media keys and background playback.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-features', 'HardwareMediaKeyHandling,MediaSessionService');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const TOKEN = crypto.randomBytes(24).toString('hex'); // proves to the local server that a request comes from this app
let port = 0;
let server = null;
let win = null;
let tray = null;
let quitting = false;

const serverDir = app.isPackaged ? path.join(process.resourcesPath, 'server') : path.join(__dirname, 'build', 'server');
const iconPath = path.join(__dirname, 'build', 'icon.png');
const userData = () => app.getPath('userData');
const base = () => `http://127.0.0.1:${port}`;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = nodeNet.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}

/** Tiny local request helper that carries the app token. */
function call(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(base() + urlPath, { method, headers: { 'x-lomu-local': TOKEN, 'content-type': 'application/json' }, timeout: 3000 }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(body ? JSON.stringify(body) : undefined);
  });
}

async function startServer() {
  const entry = JSON.parse(fs.readFileSync(path.join(serverDir, 'entry.json'), 'utf8')).entry;
  const serverJs = path.join(serverDir, entry);
  port = await freePort();
  fs.mkdirSync(path.join(userData(), 'logs'), { recursive: true });
  const log = fs.createWriteStream(path.join(userData(), 'logs', 'server.log'), { flags: 'a' });
  server = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1', // run Electron's own Node, no separate install needed
      // The server's dependencies are shipped as "lib_modules" (see scripts/prepare.mjs).
      NODE_PATH: [path.join(path.dirname(serverJs), 'lib_modules'), path.join(serverDir, 'lib_modules')].join(path.delimiter),
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      PORT: String(port),
      HOSTNAME: '127.0.0.1',
      LOMU_LOCAL_TOKEN: TOKEN,
      LOMU_DATA_DIR: path.join(userData(), 'data'),
      LOMU_CACHE_DIR: path.join(userData(), 'yt-cache'),
      LOMU_AUDIO_CACHE_DIR: path.join(userData(), 'audio'),
      LOMU_REGION: process.env.LOMU_REGION || 'IN',
    },
  });
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  server.on('exit', (code) => {
    server = null;
    if (!quitting) {
      dialog.showErrorBox('LoMu', `The local server stopped unexpectedly (code ${code}). Details are in ${path.join(userData(), 'logs', 'server.log')}.`);
      quitting = true;
      app.quit();
    }
  });
  // Wait until it answers.
  const deadline = Date.now() + 60_000;
  for (;;) {
    if (!server) throw new Error('server exited during start-up');
    try {
      if ((await call('GET', '/api/auth/status')) === 200) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('server did not start in time');
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ------------------------------------------------------------------ window

const statePath = () => path.join(userData(), 'window.json');
function loadState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    return {};
  }
}
function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(statePath(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    /* not important */
  }
}

const SPLASH =
  'data:text/html;charset=utf-8,' +
  encodeURIComponent(
    '<body style="margin:0;height:100vh;display:grid;place-items:center;background:#111;color:#bbb;font:14px system-ui"><div style="text-align:center"><div style="font-size:22px;color:#fff;margin-bottom:8px">LoMu</div>Starting…</div></body>',
  );

function createWindow() {
  const st = loadState();
  win = new BrowserWindow({
    width: st.width || 1280,
    height: st.height || 820,
    x: st.x,
    y: st.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#111111',
    autoHideMenuBar: true,
    icon: iconPath,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  if (st.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());
  win.on('close', (e) => {
    saveState();
    if (!quitting) {
      e.preventDefault(); // keep playing in the tray
      win.hide();
    }
  });
  // Anything that is not the local app opens in the normal browser.
  const local = (u) => u.startsWith(base());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url) && !local(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!local(url) && !url.startsWith('data:')) {
      e.preventDefault();
      if (/^https?:/i.test(url)) shell.openExternal(url);
    }
  });
  win.loadURL(SPLASH);
}

function createTray() {
  const img = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  tray = new Tray(img);
  tray.setToolTip('LoMu');
  const show = () => {
    if (!win) return;
    win.show();
    win.focus();
  };
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open LoMu', click: show },
      { label: 'Quit', click: () => app.quit() },
    ]),
  );
  tray.on('click', show);
}

function createMenu() {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }],
      },
      {
        label: 'LoMu',
        submenu: [
          { label: `Check for updates (version ${app.getVersion()})`, click: checkForUpdatesNow },
          { label: 'Open data folder', click: () => shell.openPath(userData()) },
          { label: 'Open server log', click: () => shell.openPath(path.join(userData(), 'logs', 'server.log')) },
          { type: 'separator' },
          { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
        ],
      },
    ]),
  );
}

// ------------------------------------------------------------------ updates
// Every push to GitHub publishes a release (see .github/workflows/desktop.yml). The installed app checks for one
// on start and every 30 minutes, downloads it in the background and offers to restart into it. If you ignore the
// offer it is installed the next time you quit the app.

let updateReady = null;
let manualCheck = false;
const updLog = (m) => {
  try {
    fs.appendFileSync(path.join(userData(), 'logs', 'updater.log'), `${new Date().toISOString()} ${m}
`);
  } catch {
    /* logging only */
  }
};

function offerRestart(version) {
  dialog
    .showMessageBox(win && !win.isDestroyed() ? win : undefined, {
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      title: 'LoMu update',
      message: `LoMu ${version} is ready`,
      detail: 'Restart to update. If you choose Later, it installs when you next quit LoMu.',
    })
    .then(({ response }) => {
      if (response === 0) {
        quitting = true;
        autoUpdater.quitAndInstall(true, true); // silent, and start LoMu again afterwards
      }
    });
}

function setupUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = { info: updLog, warn: updLog, error: updLog, debug: () => {} };
  autoUpdater.on('update-available', (i) => updLog(`update ${i.version} found, downloading`));
  autoUpdater.on('update-not-available', () => {
    if (manualCheck) dialog.showMessageBox({ type: 'info', message: `LoMu ${app.getVersion()} is the latest version.` });
    manualCheck = false;
  });
  autoUpdater.on('update-downloaded', (i) => {
    updateReady = i.version;
    manualCheck = false;
    offerRestart(i.version);
  });
  autoUpdater.on('error', (e) => {
    updLog(`error: ${e && e.message ? e.message : e}`);
    if (manualCheck) dialog.showMessageBox({ type: 'warning', message: 'Could not check for updates', detail: 'Are you online? Details are in the updater log.' });
    manualCheck = false;
  });
  const check = () => autoUpdater.checkForUpdates().catch((e) => updLog(`check failed: ${e && e.message}`));
  setTimeout(check, 15_000);
  setInterval(check, 30 * 60_000);
}

function checkForUpdatesNow() {
  if (!app.isPackaged) {
    dialog.showMessageBox({ type: 'info', message: 'Updates only work in the installed app.' });
    return;
  }
  if (updateReady) return offerRestart(updateReady);
  manualCheck = true;
  autoUpdater.checkForUpdates().catch(() => {});
}

// ------------------------------------------------------------------ life cycle

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.on('before-quit', () => {
  quitting = true;
  saveState();
});
app.on('will-quit', () => {
  if (server) server.kill();
});
app.on('window-all-closed', () => {
  /* stay in the tray */
});

app.whenReady().then(async () => {
  createMenu();
  createWindow();
  createTray();
  setupUpdates();
  try {
    await startServer();
  } catch (e) {
    quitting = true;
    dialog.showErrorBox('LoMu could not start', String(e && e.message ? e.message : e));
    app.quit();
    return;
  }

  // Every request the window makes to its own server carries the app token (pages, API, audio, event streams).
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`${base()}/*`] }, (details, cb) => {
    details.requestHeaders['x-lomu-local'] = TOKEN;
    cb({ requestHeaders: details.requestHeaders });
  });
  win.loadURL(base() + '/');

  // Sync with the home server as soon as the network is back or the PC wakes up.
  let online = net.isOnline();
  setInterval(() => {
    const now = net.isOnline();
    if (now && !online) call('POST', '/api/hub', { action: 'sync' }).catch(() => {});
    online = now;
  }, 10_000);
  powerMonitor.on('resume', () => setTimeout(() => call('POST', '/api/hub', { action: 'sync' }).catch(() => {}), 3000));
});
