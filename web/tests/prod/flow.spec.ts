import { expect, test, type Page } from '@playwright/test';

const USER = process.env.LOMU_USER ?? 'admin';
const PASS = process.env.LOMU_PASS ?? 'admin123';
const SHOTS = process.env.LOMU_SHOTS ?? 'test-results/prod';
test.describe.configure({ mode: 'serial' });

const problems: string[] = [];
const watch = (page: Page) => {
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on('response', (r) => r.status() >= 400 && !/favicon|fonts\/|ytimg/.test(r.url()) && problems.push(`${r.status()} ${r.url().slice(0, 140)}`));
};
const log = (...a: unknown[]) => console.log('>>', ...a);

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lomu-welcomed', '1'));
  await page.goto('/');
  await page.getByPlaceholder('Username').fill(USER, { timeout: 45_000 });
  await page.getByPlaceholder('Password').fill(PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByPlaceholder('Username')).toBeHidden({ timeout: 20_000 });
  // Never steer the owner's other devices from a test run.
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: 'Devices' }).first().click();
  await page.getByRole('button', { name: /This device/ }).click();
}
const barTime = (page: Page) => page.locator('[aria-label="Seek"]').first().getAttribute('aria-valuenow').then((v) => v ?? '0');

test('playback, controls, like, lyrics, queue, playlist, pages', async ({ page }) => {
  watch(page);
  await login(page);

  await page.goto('/search?q=despacito');
  await page.getByText('Despacito', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  const a = await barTime(page);
  await page.waitForTimeout(5000);
  const b = await barTime(page);
  log('seek value', a, '->', b);
  expect(Number(b)).toBeGreaterThan(Number(a));
  await page.screenshot({ path: `${SHOTS}/10-playing-local.png` });

  await page.getByRole('button', { name: 'Pause' }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await page.getByRole('button', { name: 'Next' }).first().click();
  await page.waitForTimeout(3000);
  log('after next:', await page.locator('.meta').first().innerText().catch(() => '?'));
  await page.getByRole('button', { name: 'Previous' }).first().click().catch(() => {});

  await page.getByRole('button', { name: 'Like' }).first().click();
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: 'Lyrics' }).first().click();
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${SHOTS}/11-lyrics.png` });
  await page.getByRole('button', { name: 'Queue' }).first().click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/12-queue.png` });
  await page.getByRole('button', { name: 'Close player' }).click();

  await page.goto('/library');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/13-library.png` });

  // Create a playlist, add the current song through the menu.
  await page.goto('/search?q=tum hi ho');
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: /More|options|menu/i }).first().click().catch(() => page.locator('button:has-text("…")').first().click());
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOTS}/14-menu.png` });
  await page.keyboard.press('Escape');

  for (const sel of ['a[href^="/album/"]', 'a[href^="/artist/"]', 'a[href^="/playlist/"]']) {
    await page.goto('/search?q=arijit singh');
    await page.waitForTimeout(2500);
    const l = page.locator(sel).first();
    if (!(await l.count())) { log('no link', sel); continue; }
    await l.click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${SHOTS}/20-${sel.match(/\/(\w+)\//)![1]}.png` });
  }
  log('PROBLEMS', [...new Set(problems)].join(' | '));
});
