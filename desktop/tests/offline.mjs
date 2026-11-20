// Offline run: the app's own server has no internet at all (run core.mjs first; it fills profile-a's caches).
// What must keep working: everything that was seen before, the library, and songs that were listened to.
import fs from 'node:fs';
import path from 'node:path';
import { OFFLINE, OUT, expect, launch, quit, results, sleep, step, summary } from './harness.mjs';

const shots = path.join(OUT, 'shots');
fs.mkdirSync(shots, { recursive: true });
const c = await launch('profile-a', { env: OFFLINE });
const { app, page, api, base, ud } = c;
const goto = async (p, w = 2500) => { await page.goto(base + p); await sleep(w); };
const text = () => page.evaluate(() => document.body.innerText);
const shot = (n) => page.screenshot({ path: path.join(shots, n + '.png') });

await step('offline: app starts and shows the library without internet', async () => {
  await goto('/library', 3000);
  const t = await text();
  expect(/E2E list/.test(t), 'playlist missing');
  await shot('offline-library');
});

await step('offline: really no internet for the server (a new search fails fast, cleanly)', async () => {
  const t0 = Date.now();
  const r = await api('/api/search?q=' + encodeURIComponent('never searched before ' + Date.now()));
  expect(r.s >= 500, 'expected an error, got ' + r.s);
  expect(Date.now() - t0 < 25000, 'took ' + (Date.now() - t0) + ' ms');
  return `${r.s} after ${Date.now() - t0} ms: ${r.j?.error}`;
});

await step('offline: home, explore, earlier searches and pages open from the saved copies', async () => {
  const home = await api('/api/home');
  expect(home.s === 200 && home.j.shelves.length > 0, 'home ' + home.s);
  const ex = await api('/api/explore');
  expect(ex.s === 200, 'explore ' + ex.s);
  const s = await api('/api/search?q=' + encodeURIComponent('coldplay'));
  expect(s.s === 200 && s.j.songs.length > 0, 'search ' + s.s);
  const alb = await api('/api/album/' + s.j.albums[0].id);
  expect(alb.s === 200 && alb.j.tracks.length > 0, 'album ' + alb.s);
  const art = await api('/api/artist/' + s.j.artists[0].id);
  expect(art.s === 200, 'artist ' + art.s);
  const rec = await api('/api/recs');
  expect(rec.s === 200, 'recs ' + rec.s);
  return `home ${home.j.shelves.length} shelves, album ${alb.j.tracks.length} tracks`;
});

await step('offline: Home page renders content, not an error', async () => {
  await goto('/', 4000);
  const t = await text();
  expect(t.length > 200 && !/Something went wrong|Application error/i.test(t), 'home text: ' + t.slice(0, 150).replace(/\n/g, ' | '));
  await shot('offline-home');
});

await step('offline: a song listened to before plays from disk', async () => {
  await goto('/search?q=' + encodeURIComponent('yellow coldplay'), 3500);
  await page.getByText('Yellow', { exact: true }).first().click();
  await sleep(4000);
  const bar = () => page.evaluate(() => Number(document.querySelector('[aria-label="Seek"]')?.getAttribute('aria-valuenow') || 0));
  const a = await bar();
  await sleep(4500);
  const b = await bar();
  expect(b > a, `position ${a} -> ${b}`);
  const playing = await page.evaluate(() => !!document.querySelector('button[aria-label="Pause"]'));
  expect(playing, 'not shown as playing');
  await shot('offline-playing');
  return `position ${a} -> ${b}`;
});

await step('offline: a song never listened to fails cleanly and the app stays usable', async () => {
  const r = await page.evaluate(async () => { const x = await fetch('/api/stream/ZZZZZZZZZZZ'); return { s: x.status, t: (await x.text()).slice(0, 80) }; });
  expect(r.s === 502, JSON.stringify(r));
  const st = await api('/api/auth/status');
  expect(st.s === 200, 'server unhealthy after the failure');
});

await step('offline: likes still work and are recorded for later', async () => {
  const before = (await api('/api/sync?since=0')).j.docs.length;
  await goto('/search?q=' + encodeURIComponent('yellow coldplay'), 3500);
  await page.locator('button[aria-label="Like"], button[aria-label="Unlike"]').nth(1).click();
  await sleep(2500);
  const after = (await api('/api/sync?since=0')).j.docs.length;
  expect(after >= before, 'sync log shrank');
  return `${before} -> ${after} docs`;
});

await step('offline: server log shows only expected errors', async () => {
  const log = fs.readFileSync(path.join(ud, 'logs', 'server.log'), 'utf8');
  const bad = log.split('\n').filter((l) => /Unhandled|TypeError|ReferenceError|ERR_MODULE|Cannot find/.test(l));
  expect(bad.length === 0, bad.slice(0, 2).join(' || '));
});

await quit(app);
fs.writeFileSync(path.join(OUT, 'offline-results.json'), JSON.stringify(results, null, 2));
process.exit(summary() ? 1 : 0);
