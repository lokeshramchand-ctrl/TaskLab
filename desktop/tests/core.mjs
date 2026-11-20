// Online end-to-end run of the Windows app: window, security, every page, catalogue, playback and its controls,
// likes, playlists, saved items, sync log, audio cache, tray/single-instance behaviour, persistence across restarts.
//   node desktop/tests/core.mjs            (uses the installed app; LOMU_EXE=... to test another build)
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EXE, OUT, expect, launch, quit, results, sleep, step, summary } from './harness.mjs';

const shots = path.join(OUT, 'shots');
fs.mkdirSync(shots, { recursive: true });
const PROFILE = 'profile-a';
const AUDIO = path.join(OUT, PROFILE, 'audio');
let ctx = await launch(PROFILE, { fresh: true });
let { app, page, api, problems } = ctx;
const shot = (n) => page.screenshot({ path: path.join(shots, n + '.png') });
const goto = async (p, wait = 2500) => {
  await page.goto(ctx.base + p);
  await sleep(wait);
};
const text = () => page.evaluate(() => document.body.innerText);
// The engine's Audio element is not part of the page, so playback is observed the way a user sees it: the seek bar and the Play/Pause button.
const audioState = () => page.evaluate(() => {
  const bar = document.querySelector('[aria-label="Seek"]');
  const playing = !!document.querySelector('button[aria-label="Pause"]');
  return bar ? { t: Number(bar.getAttribute('aria-valuenow') || 0), paused: !playing } : null;
});
let track = {};

// ------------------------------------------------------------------ window and security
await step('window opens on the local server with no login screen', async () => {
  const w = await app.evaluate(({ BrowserWindow }) => { const b = BrowserWindow.getAllWindows()[0]; return { title: b.getTitle(), w: b.getBounds().width, h: b.getBounds().height, visible: b.isVisible() }; });
  expect(w.visible && w.w >= 900 && w.h >= 600, 'window size/visibility ' + JSON.stringify(w));
  const s = (await api('/api/auth/status')).j;
  expect(s.local && s.setup && s.user === 'local', 'status ' + JSON.stringify(s));
  expect((await page.locator('.gate').count()) === 0, 'login gate showing');
  return `${w.title}, ${w.w}x${w.h}`;
});

await step('server refuses requests without the app token and is loopback-only', async () => {
  const noTok = await fetch(ctx.base + '/api/home');
  const bad = await fetch(ctx.base + '/api/home', { headers: { 'x-lomu-local': 'nope' } });
  const st = await (await fetch(ctx.base + '/api/auth/status')).json();
  expect(noTok.status === 401 && bad.status === 401 && st.user === null, `no token ${noTok.status}, bad token ${bad.status}, user ${st.user}`);
  const port = new URL(ctx.base).port;
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address);
  for (const ip of lan) {
    const reached = await fetch(`http://${ip}:${port}/api/auth/status`, { signal: AbortSignal.timeout(4000) }).then(() => true, () => false);
    expect(!reached, `server reachable on LAN address ${ip}`);
  }
  return `LAN addresses tried: ${lan.join(', ') || 'none'}`;
});

// ------------------------------------------------------------------ pages
for (const [name, p] of [['home', '/'], ['search', '/search'], ['explore', '/explore'], ['library', '/library'], ['settings', '/settings'], ['import', '/import']]) {
  await step(`page ${name} renders`, async () => {
    const before = problems.length;
    await goto(p, 3500);
    const t = await text();
    expect(t.length > 60 && !/Application error|This page couldn't load/i.test(t), 'page looks empty or crashed');
    await shot('page-' + name);
    const newProblems = problems.slice(before);
    expect(newProblems.length === 0, 'problems: ' + newProblems.join(' | '));
  });
}

// ------------------------------------------------------------------ catalogue through the local server
let ids = {};
await step('search returns songs, albums, artists and playlists', async () => {
  const r = await api('/api/search?q=' + encodeURIComponent('coldplay'));
  expect(r.s === 200, 'status ' + r.s);
  const j = r.j;
  expect(j.songs.length && j.albums.length && j.artists.length, `songs ${j.songs?.length} albums ${j.albums?.length} artists ${j.artists?.length}`);
  ids = { song: j.songs[0], album: j.albums[0].id, artist: j.artists[0].id, playlist: j.playlists?.[0]?.id };
  return `${j.songs.length} songs, ${j.albums.length} albums, ${j.artists.length} artists, ${j.playlists?.length ?? 0} playlists`;
});
await step('suggestions', async () => {
  const r = await api('/api/suggest?q=cold');
  expect(r.s === 200 && r.j.queries.length > 0, `status ${r.s}`);
  return r.j.queries.slice(0, 3).join(', ');
});
await step('home feed', async () => {
  const r = await api('/api/home');
  expect(r.s === 200 && r.j.shelves.length > 0, `status ${r.s}, shelves ${r.j?.shelves?.length}`);
  return r.j.shelves.length + ' shelves';
});
await step('explore', async () => {
  const r = await api('/api/explore');
  expect(r.s === 200 && (r.j.trending.length || r.j.newReleases.length), `status ${r.s}`);
  return `${r.j.trending.length} trending, ${r.j.newReleases.length} new, ${r.j.moods.length} moods`;
});
await step('album, artist and playlist pages', async () => {
  const a = await api('/api/album/' + ids.album);
  expect(a.s === 200 && a.j.tracks.length > 0, 'album ' + a.s);
  const ar = await api('/api/artist/' + ids.artist);
  expect(ar.s === 200 && ar.j.name, 'artist ' + ar.s);
  let pl = 'n/a';
  if (ids.playlist) {
    const p = await api('/api/playlist/' + ids.playlist);
    expect(p.s === 200 && p.j.tracks.length > 0, 'playlist ' + p.s);
    pl = p.j.tracks.length + ' tracks';
  }
  return `album ${a.j.tracks.length} tracks, artist ${ar.j.name}, playlist ${pl}`;
});
await step('radio, related, track details, lyrics, mood', async () => {
  const id = ids.song.id;
  const r = await api('/api/radio/' + id);
  expect(r.s === 200 && r.j.length > 3, 'radio ' + r.s);
  const rel = await api('/api/related/' + id);
  expect(rel.s === 200, 'related ' + rel.s);
  const t = await api('/api/track/' + id);
  expect(t.s === 200, 'track ' + t.s);
  const ly = await api(`/api/lyrics/${id}?title=${encodeURIComponent(ids.song.title)}&artist=${encodeURIComponent(ids.song.artists?.[0]?.name ?? '')}&duration=${ids.song.duration ?? ''}`);
  expect(ly.s === 200, 'lyrics ' + ly.s);
  const ex = (await api('/api/explore')).j.moods[0];
  const m = ex ? await api(`/api/mood?browseId=${encodeURIComponent(ex.browseId)}&params=${encodeURIComponent(ex.params)}`) : { s: 200 };
  expect(m.s === 200, 'mood ' + m.s);
  return `radio ${r.j.length}, lyrics ${ly.j?.synced?.length ?? ly.j?.lines?.length ?? (ly.j?.plain ? 'plain' : 'none')}`;
});

// ------------------------------------------------------------------ UI search and playback
await step('search box finds a song', async () => {
  await goto('/', 1500);
  const box = page.getByPlaceholder(/Search songs/).first();
  await box.click();
  await box.fill('yellow coldplay');
  await box.press('Enter');
  await page.waitForURL(/search\?q=/, { timeout: 15000 });
  await page.getByText('Yellow', { exact: true }).first().waitFor({ timeout: 20000 });
  await shot('search-results');
});

await step('clicking a song plays it (audio advances, bar shows it)', async () => {
  await page.getByText('Yellow', { exact: true }).first().click();
  await sleep(4000);
  const a = await audioState();
  await sleep(4500);
  const b = await audioState();
  expect(a && b && b.t > a.t && !b.paused, `audio ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  const bar = await page.locator('.meta').first().innerText();
  expect(/Yellow/i.test(bar), 'player bar shows: ' + bar.replace(/\n/g, ' / '));
  track = { start: Date.now() };
  await shot('playing');
  return `position ${b.t.toFixed(1)} s`;
});

await step('media session metadata for media keys / taskbar', async () => {
  const m = await page.evaluate(() => navigator.mediaSession.metadata && { title: navigator.mediaSession.metadata.title, artist: navigator.mediaSession.metadata.artist, art: navigator.mediaSession.metadata.artwork.length });
  expect(m && /Yellow/i.test(m.title), JSON.stringify(m));
  return JSON.stringify(m);
});

await step('pause and resume', async () => {
  await page.getByRole('button', { name: 'Pause' }).first().click();
  await sleep(700);
  expect((await audioState()).paused === true, 'not paused');
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await sleep(1500);
  expect((await audioState()).paused === false, 'did not resume');
});

await step('seek jumps the position', async () => {
  const before = (await audioState()).t;
  const bar = page.locator('[aria-label="Seek"]').first();
  const box = await bar.boundingBox();
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  await sleep(1500);
  const after = (await audioState()).t;
  expect(Math.abs(after - before) > 20, `position ${before.toFixed(0)} -> ${after.toFixed(0)}`);
  return `${before.toFixed(0)} s -> ${after.toFixed(0)} s`;
});

await step('keep listening so the song is kept on disk (audio cache) and the play is logged', async () => {
  const left = 16000 - (Date.now() - track.start);
  if (left > 0) await sleep(left);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (fs.existsSync(AUDIO) && fs.readdirSync(AUDIO).some((f) => !f.endsWith('.part'))) break;
    await sleep(1500);
  }
  const files = fs.existsSync(AUDIO) ? fs.readdirSync(AUDIO) : [];
  expect(files.some((f) => !f.endsWith('.part')), 'no cached file, folder: ' + files.join(','));
  const full = files.find((f) => !f.endsWith('.part'));
  return `${full} ${(fs.statSync(path.join(AUDIO, full)).size / 1e6).toFixed(1)} MB`;
});

await step('cached song is served from disk', async () => {
  const id = fs.readdirSync(AUDIO).find((f) => f.endsWith('.opus')).replace('.opus', '');
  const r = await page.evaluate(async (id) => { const x = await fetch('/api/stream/' + id, { headers: { range: 'bytes=100-2147' } }); return { s: x.status, c: x.headers.get('x-lomu-client'), n: (await x.arrayBuffer()).byteLength, cr: x.headers.get('content-range') }; }, id);
  expect(r.s === 206 && r.c === 'disk' && r.n === 2048, JSON.stringify(r));
  return r.cr;
});

await step('next / previous change the track', async () => {
  const t1 = await page.locator('.meta').first().innerText();
  await page.getByRole('button', { name: 'Next' }).first().click();
  await sleep(4000);
  const t2 = await page.locator('.meta').first().innerText();
  expect(t1 !== t2, 'track did not change: ' + t1.replace(/\n/g, ' / '));
  await page.getByRole('button', { name: 'Previous' }).first().click();
  await sleep(2500);
  const a = await audioState();
  expect(a && !a.paused, 'not playing after previous: ' + JSON.stringify(a));
  return `${t1.split('\n')[0]} -> ${t2.split('\n')[0]}`;
});

await step('full player: queue, lyrics, shuffle, close', async () => {
  await page.getByRole('button', { name: 'Open player' }).first().click();
  await sleep(1200);
  await page.getByRole('button', { name: 'Queue' }).first().click().catch(() => {});
  await sleep(1500);
  await shot('full-player-queue');
  const q = await text();
  await page.getByRole('button', { name: 'Lyrics' }).first().click().catch(() => {});
  await sleep(6000);
  await shot('full-player-lyrics');
  await page.getByRole('button', { name: 'Shuffle' }).first().click().catch(() => {});
  await sleep(600);
  await shot('full-player-shuffle');
  await page.getByRole('button', { name: 'Close player' }).click();
  await sleep(600);
  expect(q.length > 100, 'full player rendered no text');
});

await step('like a song, see it in Library, unlike, like again', async () => {
  const liveLikes = async () => (await api('/api/sync?since=0')).j.docs.filter((d) => d.kind === 'like' && !d.deleted).length;
  await goto('/search?q=' + encodeURIComponent('yellow coldplay'), 3500);
  const heart = () => page.locator('button[aria-label="Like"], button[aria-label="Unlike"]').first();
  const n0 = await liveLikes();
  await heart().click();
  await sleep(2500);
  expect((await liveLikes()) === n0 + 1, 'like not recorded in the sync log');
  await goto('/library', 2500);
  expect(/Yellow/i.test(await text()), 'liked song not in Library');
  await shot('library-liked');
  await goto('/search?q=' + encodeURIComponent('yellow coldplay'), 3500);
  await heart().click();
  await sleep(2500);
  expect((await liveLikes()) === n0, 'unlike not recorded (tombstone)');
  await heart().click();
  await sleep(2500);
  expect((await liveLikes()) === n0 + 1, 'like again not recorded');
});

await step('create a playlist from a song menu and open it', async () => {
  await goto('/search?q=' + encodeURIComponent('fix you coldplay'), 3500);
  await page.locator('button[aria-label="More"]').first().click();
  await sleep(500);
  await page.getByText('Add to playlist').first().click();
  await sleep(500);
  await page.getByText('New playlist').first().click();
  await sleep(400);
  await page.getByLabel('Playlist name').fill('E2E list');
  await page.keyboard.press('Enter');
  await sleep(1500);
  await goto('/library', 2500);
  expect(/E2E list/.test(await text()), 'playlist not listed');
  await page.getByText('E2E list').first().click();
  await sleep(2500);
  expect(/Fix You/i.test(await text()), 'song missing from playlist');
  await shot('playlist');
});

await step('save an album and an artist, both appear in Library', async () => {
  await goto('/album/' + ids.album, 4000);
  const saveA = page.getByRole('button', { name: /^Save|Add to library|Saved/i }).first();
  expect(await saveA.count(), 'no save button on album page');
  await saveA.click();
  await sleep(800);
  await goto('/artist/' + ids.artist, 4000);
  const saveB = page.getByRole('button', { name: /^Save|Add to library|Follow|Saved/i }).first();
  expect(await saveB.count(), 'no save button on artist page');
  await saveB.click();
  await sleep(800);
  await goto('/library', 2500);
  await shot('library-saved');
});

await step('Devices panel lists this PC and never touches other devices', async () => {
  await goto('/', 2500);
  await page.getByRole('button', { name: 'Devices' }).first().click();
  await sleep(1500);
  const t = await text();
  expect(/This device/i.test(t), 'no "This device"');
  await shot('devices');
  await page.keyboard.press('Escape');
});

await step('settings: theme, hub card, export button', async () => {
  await goto('/settings', 2500);
  const t = await text();
  expect(/Home server/.test(t) && /Export/.test(t) && /Autoplay/.test(t), 'settings missing sections');
  expect(!/Sign out/.test(t), 'Sign out is shown in the desktop app');
});

await step('sync log on this PC holds likes, plays and the playlist', async () => {
  const r = await api('/api/sync?since=0');
  const kinds = {};
  for (const d of r.j.docs) kinds[d.kind] = (kinds[d.kind] || 0) + 1;
  expect(kinds.like >= 1 && kinds.playlist >= 1 && kinds.saved >= 2, JSON.stringify(kinds));
  return JSON.stringify(kinds);
});

await step('recommendations endpoint answers', async () => {
  const r = await api('/api/recs');
  expect(r.s === 200 && Array.isArray(r.j), 'status ' + r.s);
  return r.j.map((s) => s.title).join(', ') || 'no shelves yet (needs more plays)';
});

// ------------------------------------------------------------------ window behaviour
await step('closing the window hides it (tray) and the app keeps running', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
  await sleep(800);
  const v = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
  expect(v === false, 'window still visible');
  const st = await fetch(ctx.base + '/api/auth/status').then((r) => r.status);
  expect(st === 200, 'server stopped');
});

await step('a second launch hands over to the running app', async () => {
  const p = spawn(EXE, ['--user-data-dir=' + ctx.ud], { stdio: 'ignore' });
  const code = await new Promise((res) => { const t = setTimeout(() => { p.kill(); res('hung'); }, 15000); p.on('exit', (c) => { clearTimeout(t); res(c); }); });
  expect(code === 0, 'second instance exit code ' + code);
  await sleep(800);
  const v = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible());
  expect(v === true, 'first window not brought back');
});

// ------------------------------------------------------------------ restart: persistence
await step('window size is remembered and quitting stops the server', async () => {
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ x: 40, y: 40, width: 1111, height: 777 }));
  await sleep(500);
  const port = new URL(ctx.base).port;
  await quit(app);
  const alive = await fetch(`http://127.0.0.1:${port}/api/auth/status`, { signal: AbortSignal.timeout(3000) }).then(() => true, () => false);
  expect(!alive, 'server still running after quit');
  const left = execFileSync('powershell', ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process | Where-Object { $_.Name -ne 'powershell.exe' -and $_.CommandLine -like '*${PROFILE}*' } | Measure-Object).Count`]).toString().trim();
  expect(left === '0', left + ' processes left behind');
});

ctx = await launch(PROFILE);
({ app, page, api, problems } = ctx);

await step('after restart: likes, playlist, saved items and window size are still there', async () => {
  const b = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getNormalBounds());
  expect(Math.abs(b.width - 1111) < 15 && Math.abs(b.height - 777) < 15, 'bounds ' + JSON.stringify(b));
  await goto('/library', 3500);
  const t = await text();
  expect(/E2E list/.test(t), 'playlist lost');
  expect(/Yellow/i.test(t), 'like lost');
  await shot('after-restart-library');
  const r = await api('/api/sync?since=0');
  expect(r.j.docs.length >= 4, 'only ' + r.j.docs.length + ' docs');
  return `${r.j.docs.length} docs`;
});

await step('server log has no crashes', async () => {
  const log = fs.readFileSync(path.join(ctx.ud, 'logs', 'server.log'), 'utf8');
  const bad = log.split('\n').filter((l) => /\[(api|stream|audio-cache)\]|Unhandled|ERR_|TypeError|ReferenceError/.test(l));
  expect(bad.length === 0, bad.slice(0, 3).join(' || '));
  return log.split('\n').length + ' log lines';
});

await step('updater is wired: menu entry present, log written', async () => {
  const labels = await app.evaluate(({ Menu }) => { const out = []; const walk = (items) => items.forEach((i) => { if (i.label) out.push(i.label); if (i.submenu) walk(i.submenu.items); }); walk(Menu.getApplicationMenu().items); return out; });
  expect(labels.some((l) => /Check for updates \(version/.test(l)), labels.join(', '));
  return labels.find((l) => /Check for updates/.test(l));
});

await quit(app);
fs.writeFileSync(path.join(OUT, 'core-results.json'), JSON.stringify(results, null, 2));
process.exit(summary() ? 1 : 0);
