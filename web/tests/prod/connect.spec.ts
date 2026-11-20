import { expect, test, type Page } from '@playwright/test';

const USER = process.env.LOMU_USER ?? 'admin';
const PASS = process.env.LOMU_PASS ?? 'admin123';
const SHOTS = process.env.LOMU_SHOTS ?? 'test-results/prod';
const log = (...a: unknown[]) => console.log('>>', ...a);

async function devices(page: Page) {
  return page.evaluate(async () => (await fetch('/api/connect/devices')).json());
}
const phone = async (page: Page) => (await devices(page)).devices.find((d: any) => d.kind === 'android');

test('web steers the phone, then takes playback over', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lomu-welcomed', '1'));
  await page.goto('/');
  await page.getByPlaceholder('Username').fill(USER, { timeout: 45_000 });
  await page.getByPlaceholder('Password').fill(PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByPlaceholder('Username')).toBeHidden({ timeout: 20_000 });
  await page.waitForTimeout(4000);

  let p = await phone(page);
  log('phone', p?.track?.title, p?.playing, Math.round(p?.position ?? 0));
  expect(p).toBeTruthy();

  await page.getByRole('button', { name: 'Devices' }).first().click();
  await page.screenshot({ path: `${SHOTS}/30-devices.png` });
  await page.getByRole('button', { name: /Pixel 7/ }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/31-steering.png` });

  if (!(await phone(page)).playing) {
    await page.getByRole('button', { name: 'Play', exact: true }).first().click();
    await expect.poll(async () => (await phone(page))?.playing, { timeout: 15_000 }).toBe(true);
    log('play from idle reached phone');
  }
  await page.getByRole('button', { name: 'Pause' }).first().click();
  await expect.poll(async () => (await phone(page))?.playing, { timeout: 10_000 }).toBe(false);
  log('pause reached phone');
  await page.getByRole('button', { name: 'Play', exact: true }).first().click();
  await expect.poll(async () => (await phone(page))?.playing, { timeout: 15_000 }).toBe(true);
  log('play reached phone');
  const before = (await phone(page)).track.id;
  await page.getByRole('button', { name: 'Next' }).first().click();
  await expect.poll(async () => (await phone(page))?.track?.id, { timeout: 15_000 }).not.toBe(before);
  log('next reached phone ->', (await phone(page)).track.title);

  // Play something new from the web onto the phone.
  // A full page load would drop the steering, so search through the app's own box.
  await page.getByPlaceholder('Search songs, artists, albums').fill('tum hi ho');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3500);
  await page.getByText('Tum Hi Ho', { exact: true }).first().click();
  await expect.poll(async () => (await phone(page))?.track?.title, { timeout: 15_000 }).toBe('Tum Hi Ho');
  log('web-started song plays on phone');

  // Take it back to this browser.
  await page.getByRole('button', { name: 'Devices' }).first().click();
  await page.getByRole('button', { name: /This device/ }).click();
  await page.waitForTimeout(6000);
  const d = await devices(page);
  log('after handoff active=', d.active, d.devices.map((x: any) => `${x.kind}:${x.playing}`).join(','));
  await page.screenshot({ path: `${SHOTS}/32-handoff.png` });
  await page.getByRole('button', { name: 'Pause' }).first().click().catch(() => {});
});
