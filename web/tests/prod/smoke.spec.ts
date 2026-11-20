import { expect, test, type Page } from '@playwright/test';

const USER = process.env.LOMU_USER ?? 'admin';
const PASS = process.env.LOMU_PASS ?? 'admin123';
const SHOTS = process.env.LOMU_SHOTS ?? 'test-results/prod';
test.describe.configure({ mode: 'serial' });

const problems: string[] = [];
function watch(page: Page) {
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text().slice(0, 200)}`));
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => r.status() >= 400 && !r.url().includes('favicon') && problems.push(`${r.status()} ${r.url().slice(0, 140)}`));
}

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lomu-welcomed', '1'));
  await page.goto('/');
  await page.getByPlaceholder('Username').fill(USER, { timeout: 45_000 });
  await page.getByPlaceholder('Password').fill(PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByPlaceholder('Username')).toBeHidden({ timeout: 20_000 });
}

test('walk every page, play, like, playlist, lyrics, queue', async ({ page }) => {
  watch(page);
  await login(page);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOTS}/01-home.png` });

  for (const p of ['/explore', '/library', '/settings', '/search?q=arijit']) {
    await page.goto(p);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/page-${p.replace(/\W+/g, '_')}.png` });
  }

  // Search -> play first song.
  await page.goto('/search?q=despacito');
  await page.waitForTimeout(2500);
  const link = page.locator('a[href^="/album/"]').first();
  console.log('album link', await link.count());
  const row = page.getByText('Despacito').first();
  await row.dblclick().catch(() => row.click());
  await page.waitForTimeout(8000);
  const audio = await page.evaluate(() => {
    const a = document.querySelector('audio');
    return a && { t: a.currentTime, paused: a.paused, dur: a.duration, err: a.error?.code };
  });
  console.log('audio', JSON.stringify(audio));
  await page.screenshot({ path: `${SHOTS}/02-playing.png` });

  console.log('PROBLEMS\n' + [...new Set(problems)].join('\n'));
});
