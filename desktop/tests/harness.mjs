// Shared helpers for the desktop end-to-end tests. Drives the real (installed or unpacked) app with Playwright's Electron support.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '../../web/package.json'));
export const { _electron } = require('@playwright/test');

export const EXE = process.env.LOMU_EXE || path.join(process.env.LOCALAPPDATA, 'Programs', 'LoMu', 'LoMu.exe');
export const OUT = process.env.LOMU_TEST_DIR || path.join(os.tmpdir(), 'lomu-desktop-tests');
export const DNSMAP = path.join(here, 'dnsmap.cjs');
// Simulates "no internet" for the app's own server: its outgoing requests go to a dead proxy.
export const OFFLINE = { HTTPS_PROXY: 'http://127.0.0.1:9', HTTP_PROXY: 'http://127.0.0.1:9', NODE_USE_ENV_PROXY: '1', NO_PROXY: '127.0.0.1,localhost' };
export const HUB_URL = 'https://lomu.deploy-ui.lokeshrc.me';
export const HUB_USER = process.env.LOMU_HUB_USER || 'admin';
export const HUB_PASS = process.env.LOMU_HUB_PASS || 'admin123';
fs.mkdirSync(OUT, { recursive: true });

export const results = [];
export async function step(name, fn) {
  const t = Date.now();
  try {
    const note = await fn();
    results.push({ ok: true, name, note });
    console.log(`PASS  ${name}${note ? '  - ' + note : ''}  (${Date.now() - t} ms)`);
  } catch (e) {
    results.push({ ok: false, name, note: String(e.message).split('\n')[0] });
    console.log(`FAIL  ${name}  - ${String(e.message).split('\n')[0]}`);
  }
}
export function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function summary() {
  const bad = results.filter((r) => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} passed`);
  for (const b of bad) console.log(`  FAILED: ${b.name} - ${b.note}`);
  return bad.length;
}

/** Launches the app on its own data folder. Returns { app, page, problems, ud, api }. */
export async function launch(name, { env = {}, fresh = false } = {}) {
  const ud = path.join(OUT, name);
  if (fresh) fs.rmSync(ud, { recursive: true, force: true });
  const app = await _electron.launch({ executablePath: EXE, args: ['--user-data-dir=' + ud], env: { ...process.env, ...env } });
  // Never let a native dialog (update ready, errors) block a test; keep what they said.
  await app.evaluate(({ dialog }) => {
    globalThis.__dialogs = [];
    dialog.showMessageBox = async (...a) => { globalThis.__dialogs.push(a.map((x) => x && (x.message || x.detail)).filter(Boolean).join(' | ')); return { response: 1 }; };
    dialog.showErrorBox = (t, c) => globalThis.__dialogs.push('ERROR ' + t + ': ' + c);
  });
  const page = await app.firstWindow();
  const problems = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message.slice(0, 160)));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && problems.push('console: ' + m.text().slice(0, 160)));
  page.on('response', (r) => r.status() >= 400 && !/favicon|ytimg|googleusercontent|ggpht/.test(r.url()) && problems.push(`${r.status()} ${r.url().replace(/^http:\/\/127\.0\.0\.1:\d+/, '').slice(0, 120)}`));
  await page.waitForURL(/127\.0\.0\.1/, { timeout: 90_000 });
  await page.waitForLoadState('domcontentloaded');
  await page.addInitScript(() => localStorage.setItem('lomu-welcomed', '1')).catch(() => {});
  const api = (p, init) =>
    page.evaluate(async ([p, init]) => {
      const r = await fetch(p, init ? { ...init, body: init.body ? JSON.stringify(init.body) : undefined, headers: { 'content-type': 'application/json' } } : undefined);
      let j = null;
      try { j = await r.json(); } catch {}
      return { s: r.status, j };
    }, [p, init]);
  return { app, page, problems, ud, api, base: new URL(page.url()).origin, dialogs: () => app.evaluate(() => globalThis.__dialogs) };
}

export async function quit(app) {
  await app.evaluate(({ app }) => { app.quit(); }).catch(() => {});
  await app.close().catch(() => {});
  await sleep(1500);
}

/** Hub (home server) helpers, talking to it directly with the temporary admin login. */
export async function hubLogin() {
  const r = await fetch(HUB_URL + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-lomu-device': 'desktop-e2e' }, body: JSON.stringify({ username: HUB_USER, password: HUB_PASS }) });
  if (!r.ok) throw new Error('hub login ' + r.status);
  const t = await r.json();
  const h = { authorization: 'Bearer ' + t.access, 'content-type': 'application/json' };
  return {
    pull: async (since = 0) => (await fetch(HUB_URL + '/api/sync?since=' + since, { headers: h })).json(),
    push: async (docs) => (await fetch(HUB_URL + '/api/sync', { method: 'POST', headers: h, body: JSON.stringify({ docs }) })).json(),
  };
}
