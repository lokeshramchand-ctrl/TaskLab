// Home-server (hub) run against the real homelab with the temporary admin login. It only ever writes clearly named
// test documents of kind "search" (which no client displays) and tombstones them at the end; it never changes the account.
//   node --require ./desktop/tests/dnsmap.cjs desktop/tests/hub.mjs
// (dnsmap.cjs maps the public name to the homelab's LAN address, because from the home network the public name
//  lands on the router. Over WARP or from outside the home network, run without --require and set LOMU_NO_DNSMAP=1.)
import fs from 'node:fs';
import path from 'node:path';
import { DNSMAP, HUB_PASS, HUB_URL, HUB_USER, OFFLINE, OUT, expect, hubLogin, launch, quit, results, sleep, step, summary } from './harness.mjs';

const shots = path.join(OUT, 'shots');
fs.mkdirSync(shots, { recursive: true });
const NO_MAP = process.env.LOMU_NO_DNSMAP === '1';
const ENV = NO_MAP ? {} : { LOMU_SERVER_NODE_OPTIONS: `--require ${DNSMAP}` };
const stamp = Date.now();
const K = { local: `e2e-desktop-local-${stamp}`, remote: `e2e-hub-remote-${stamp}`, offline: `e2e-desktop-offline-${stamp}` };
const doc = (key, extra = {}) => ({ kind: 'search', key, value: { q: 'e2e', stamp }, updated: Date.now(), ...extra });
const hub = await hubLogin();
const seq0 = (await hub.pull(-1)).seq;
const hubKeys = async () => new Set((await hub.pull(0)).docs.map((d) => d.kind + ':' + d.key));
console.log('hub log position before the run:', seq0);

async function until(fn, ms, what) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn().catch(() => null);
    if (last) return last;
    await sleep(1500);
  }
  throw new Error('timed out waiting for ' + what);
}

let c = await launch('profile-b', { fresh: true, env: ENV });
const hubState = () => c.api('/api/hub').then((r) => r.j);
const goto = async (p, w = 2500) => { await c.page.goto(c.base + p); await sleep(w); };
const shot = (n) => c.page.screenshot({ path: path.join(shots, n + '.png') });

try {
  await step('settings card shows "not connected" before connecting', async () => {
    await goto('/settings', 2500);
    const t = await c.page.evaluate(() => document.body.innerText);
    expect(/Not connected/.test(t) && /Connect/.test(t), 'card missing');
    await shot('hub-not-connected');
  });

  await step('wrong password is refused with a clear message', async () => {
    const r = await c.api('/api/hub', { method: 'POST', body: { url: HUB_URL, username: HUB_USER, password: 'definitely-wrong-e2e' } });
    expect(r.s === 400 && /wrong username or password/i.test(r.j.error), JSON.stringify(r));
    expect((await hubState()).url === null, 'connected anyway');
  });

  await step('unreachable address is refused with a clear message', async () => {
    const r = await c.api('/api/hub', { method: 'POST', body: { url: 'https://127.0.0.1:9', username: 'x', password: 'y' } });
    expect(r.s === 400 && /reach/i.test(r.j.error), JSON.stringify(r));
    const r2 = await c.api('/api/hub', { method: 'POST', body: { url: 'lomu.example', username: 'x', password: 'y' } });
    expect(r2.s === 400 && /https/i.test(r2.j.error), JSON.stringify(r2));
  });

  await step('sign in to the home server and reach "online"', async () => {
    const r = await c.api('/api/hub', { method: 'POST', body: { url: HUB_URL, username: HUB_USER, password: HUB_PASS } });
    expect(r.s === 200 && r.j.url, JSON.stringify(r));
    const st = await until(async () => { const s = await hubState(); return s.state === 'online' && s; }, 90000, 'state online');
    return `${st.user} on ${new URL(st.url).host}, pending ${st.pending}`;
  });

  await step('first sync brought the home server library to this PC', async () => {
    const mine = (await c.api('/api/sync?since=0')).j.docs;
    const theirs = (await hub.pull(0)).docs;
    expect(mine.length >= theirs.length - 5, `local ${mine.length} vs hub ${theirs.length}`);
    const kinds = {};
    for (const d of mine) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
    return `${mine.length} docs ${JSON.stringify(kinds)}`;
  });

  await step('library from the home server shows in the app', async () => {
    await goto('/library', 4000);
    await shot('hub-library');
    const t = await c.page.evaluate(() => document.body.innerText);
    expect(t.length > 100, 'library empty');
  });

  await step('PC -> home server: a new local document arrives there', async () => {
    await c.api('/api/sync', { method: 'POST', body: { docs: [doc(K.local)] } });
    await c.api('/api/hub', { method: 'POST', body: { action: 'sync' } });
    await until(async () => (await hubKeys()).has('search:' + K.local), 60000, 'document on the home server');
  });

  await step('home server -> PC: a document written there arrives here', async () => {
    await hub.push([doc(K.remote)]);
    await c.api('/api/hub', { method: 'POST', body: { action: 'sync' } });
    await until(async () => (await c.api('/api/sync?since=0')).j.docs.some((d) => d.key === K.remote), 60000, 'document on the PC');
  });

  await step('"Sync now" and the status card in the UI', async () => {
    await goto('/settings', 3000);
    const t = await c.page.evaluate(() => document.body.innerText);
    expect(/Up to date|Syncing/.test(t) && /Sync now/.test(t) && /Disconnect/.test(t), t.slice(0, 200));
    await c.page.getByRole('button', { name: 'Sync now' }).click();
    await sleep(2500);
    await shot('hub-online');
  });

  await step('connection survives a restart (no sign-in needed) and keeps syncing', async () => {
    await quit(c.app);
    c = await launch('profile-b', { env: ENV });
    const st = await until(async () => { const s = await hubState(); return s.url && s.state === 'online' && s; }, 90000, 'online after restart');
    return `${st.user}, last sync ${new Date(st.lastSync).toLocaleTimeString()}`;
  });

  await step('home server unreachable: state "offline", edits queue, nothing is lost', async () => {
    await quit(c.app);
    c = await launch('profile-b', { env: { ...ENV, ...OFFLINE } });
    await c.api('/api/sync', { method: 'POST', body: { docs: [doc(K.offline)] } });
    await c.api('/api/hub', { method: 'POST', body: { action: 'sync' } });
    const st = await until(async () => { const s = await hubState(); return s.state === 'offline' && s; }, 90000, 'state offline');
    expect(st.pending >= 1, 'pending ' + st.pending);
    expect(!(await hubKeys()).has('search:' + K.offline), 'document reached the hub while "offline"');
    await goto('/settings', 3000);
    const t = await c.page.evaluate(() => document.body.innerText);
    expect(/unreachable/i.test(t) && /waiting/i.test(t), 'card text: ' + t.slice(0, 250).replace(/\n/g, ' '));
    await shot('hub-offline');
    return `pending ${st.pending}`;
  });

  await step('home server back: queued edit is delivered by itself', async () => {
    await quit(c.app);
    c = await launch('profile-b', { env: ENV });
    const st = await until(async () => { const s = await hubState(); return s.state === 'online' && s.pending === 0 && s; }, 90000, 'online with nothing pending');
    await until(async () => (await hubKeys()).has('search:' + K.offline), 60000, 'queued document on the home server');
    return `pending ${st.pending}`;
  });

  await step('nothing else was written to the home server (no stray or re-stamped documents)', async () => {
    const after = (await hub.pull(seq0)).docs;
    const stray = after.filter((d) => !(d.kind === 'search' && d.key.startsWith('e2e-')));
    expect(stray.length === 0, `${stray.length} unexpected: ` + stray.slice(0, 5).map((d) => d.kind + ':' + d.key).join(', '));
    return `${after.length} test documents`;
  });

  await step('disconnect clears the connection and it stays cleared after a restart', async () => {
    const r = await c.api('/api/hub', { method: 'DELETE' });
    expect(r.j.state === 'off' && r.j.url === null, JSON.stringify(r.j));
    await quit(c.app);
    c = await launch('profile-b', { env: ENV });
    const st = await hubState();
    expect(st.url === null && st.state === 'off', JSON.stringify(st));
  });
} finally {
  // Leave the home server as it was: tombstone every test document.
  const now = Date.now();
  await hub.push(Object.values(K).map((key) => ({ kind: 'search', key, value: null, updated: now + 1000, deleted: true }))).catch(() => {});
  await quit(c.app).catch(() => {});
}
fs.writeFileSync(path.join(OUT, 'hub-results.json'), JSON.stringify(results, null, 2));
process.exit(summary() ? 1 : 0);
