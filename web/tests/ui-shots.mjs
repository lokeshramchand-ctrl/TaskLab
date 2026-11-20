// Screenshot tour of the UI against a dev server started with LOMU_LOCAL_TOKEN=devui (no login screen).
//   node tests/ui-shots.mjs <outDir> [baseUrl] [page,page,...]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'ui-shots';
const base = process.argv[3] || 'http://localhost:4102';
const only = (process.argv[4] || '').split(',').filter(Boolean);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: (process.env.VIEWPORT || '1440x900').split('x').reduce((a, v, i) => ({ ...a, [i ? 'height' : 'width']: Number(v) }), {}), extraHTTPHeaders: { 'x-lomu-local': 'devui' } });
const page = await ctx.newPage();
await page.addInitScript(() => localStorage.setItem('lomu-welcomed', '1'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name, url, wait = 3500, act) => {
  if (only.length && !only.includes(name)) return;
  await page.goto(base + url, { waitUntil: 'domcontentloaded' });
  await sleep(wait);
  if (act) await act();
  await page.screenshot({ path: path.join(out, name + '.png') });
  console.log('shot', name);
};
await shot('home', '/', 6000);
await shot('search', '/search', 4000);
await shot('search-results', '/search?q=coldplay', 5000);
await shot('explore', '/explore', 5000);
await shot('library', '/library', 3000);
await shot('settings', '/settings', 3000);
const search = await page.evaluate(() => fetch('/api/search?q=coldplay').then((r) => r.json()));
if (search.albums?.[0]) await shot('album', '/album/' + search.albums[0].id, 6000);
if (search.artists?.[0]) await shot('artist', '/artist/' + search.artists[0].id, 6000);
if (search.playlists?.[0]) await shot('playlist', '/playlist/' + search.playlists[0].id, 6000);
await shot('playing', '/search?q=yellow%20coldplay', 4000, async () => {
  await page.getByText('Yellow', { exact: true }).first().click();
  await sleep(5000);
});
await shot('fullplayer', '/', 2000, async () => {
  await page.getByRole('button', { name: 'Open player' }).first().click();
  await sleep(2500);
});
await browser.close();
