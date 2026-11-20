// Spacing audit for the bento layout. Opens each page at several widths and measures the real layout:
//  - every gap between neighbouring tiles equals the grid gap (12px, 8px on phones)
//  - tiles never overlap and never leave the grid
//  - tile padding sits on the 4px scale
//  - the page never scrolls sideways
// Run against a dev server:  BASE=http://localhost:4177 node tests/spacing.mjs
import { chromium } from '@playwright/test';

const BASE = process.env.BASE ?? 'http://localhost:4177';
const USER = process.env.AUDIT_USER ?? 'owner';
const PASS = process.env.AUDIT_PASS ?? 'shot-password-1';
const PAGES = [
  ['home', '/'],
  ['library', '/library'],
  ['search', '/search?q=despacito'],
  ['search-empty', '/search'],
  ['explore', '/explore'],
  ['settings', '/settings'],
  ['album', '/album/MPREb_78js9pEDBUZ'],
  ['artist', '/artist/UCk91oFc2hY2CdHirU93baLg'],
];
const WIDTHS = [1440, 1100, 768, 390];
const SCALE = new Set([0, 1, 2, 4, 8, 12, 16, 24, 32]);

const browser = await chromium.launch();
let bad = 0;
let checked = 0;
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => localStorage.setItem('lomu-welcomed', '1'));
  await page.goto(BASE + '/');
  await page.getByPlaceholder('Username').fill(USER);
  await page.getByPlaceholder('Password').fill(PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForTimeout(2000);
  for (const [name, url] of PAGES) {
    await page.goto(BASE + url);
    await page.waitForTimeout(name === 'settings' || name === 'library' || name === 'search-empty' ? 1500 : 6500);
    const report = await page.evaluate((SCALE_ARR) => {
      const scale = new Set(SCALE_ARR);
      const out = [];
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1) out.push(`page scrolls sideways (${de.scrollWidth} > ${de.clientWidth})`);
      for (const grid of document.querySelectorAll('.bento')) {
        const gcs = getComputedStyle(grid);
        const gap = parseFloat(gcs.columnGap);
        const gr = grid.getBoundingClientRect();
        const tiles = [...grid.children].filter((el) => el.classList.contains('tile')).map((el) => ({ el, r: el.getBoundingClientRect() }));
        const kids = [...grid.children].map((el) => ({ el, r: el.getBoundingClientRect() })).filter((k) => k.r.width > 0 && k.r.height > 0 && getComputedStyle(k.el).position !== 'absolute');
        const label = (t) => t.el.getAttribute('aria-label') || t.el.className.toString().slice(0, 30);
        for (const t of tiles) {
          // nothing inside a tile may poke out of its right edge (shelves that scroll on purpose are exempt)
          for (const el of t.el.querySelectorAll('*')) {
            if (el.closest('.hscroll') || el.closest('.chips') || getComputedStyle(el).position === 'absolute') continue;
            // clipped by an ancestor inside the tile (text-overflow: ellipsis and the like) is not visible overflow
            let clipped = false;
            for (let q = el.parentElement; q && q !== t.el; q = q.parentElement) {
              const ox = getComputedStyle(q).overflowX;
              if (ox !== 'visible' && q.getBoundingClientRect().right <= t.r.right + 1) { clipped = true; break; }
            }
            if (clipped) continue;
            const er = el.getBoundingClientRect();
            if (er.width > 0 && er.right > t.r.right + 1) { out.push(`content in "${label(t)}" overflows its tile by ${Math.round(er.right - t.r.right)}px (${el.tagName.toLowerCase()}.${String(el.className).slice(0, 24)})`); break; }
          }
          if (t.r.left < gr.left - 0.5 || t.r.right > gr.right + 0.5) out.push(`tile "${label(t)}" leaves the grid (${Math.round(t.r.left)}-${Math.round(t.r.right)} vs ${Math.round(gr.left)}-${Math.round(gr.right)})`);
          const cs = getComputedStyle(t.el);
          for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
            const v = parseFloat(cs['padding' + side]);
            if (!scale.has(Math.round(v))) out.push(`tile "${label(t)}" padding-${side.toLowerCase()} ${v}px is off the scale`);
          }
        }
        for (let i = 0; i < kids.length; i++) {
          for (let j = i + 1; j < kids.length; j++) {
            const a = kids[i].r, b = kids[j].r;
            const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            if (ox > 0.5 && oy > 0.5) out.push(`"${label(kids[i])}" overlaps "${label(kids[j])}"`);
            // neighbours in the same row: horizontal gap must equal the grid gap
            if (oy > 1) {
              const d = a.right <= b.left ? b.left - a.right : b.right <= a.left ? a.left - b.right : null;
              if (d !== null && d < 40 && Math.abs(d - gap) > 0.75) out.push(`horizontal gap ${d.toFixed(1)}px between "${label(kids[i])}" and "${label(kids[j])}" (expected ${gap})`);
            }
            // stacked in the same column: vertical gap must equal the grid gap
            if (ox > 1) {
              const d = a.bottom <= b.top ? b.top - a.bottom : b.bottom <= a.top ? a.top - b.bottom : null;
              if (d !== null && d < 40 && Math.abs(d - gap) > 0.75) out.push(`vertical gap ${d.toFixed(1)}px between "${label(kids[i])}" and "${label(kids[j])}" (expected ${gap})`);
            }
          }
        }
      }
      return out;
    }, [...SCALE]);
    checked++;
    if (report.length) {
      bad += report.length;
      console.log(`\n[${w}px] ${name}: ${report.length} issue(s)`);
      for (const r of [...new Set(report)].slice(0, 12)) console.log('  - ' + r);
    }
  }
  await ctx.close();
}
await browser.close();
console.log(`\nchecked ${checked} page views, ${bad} spacing issue(s)`);
process.exit(bad ? 1 : 0);
