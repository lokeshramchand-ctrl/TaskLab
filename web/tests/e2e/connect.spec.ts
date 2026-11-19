import { expect, test, type Page } from '@playwright/test';

const USER = 'owner';
const PASS = 'e2e-correct-horse';
const VIDEO = 'kJQP7kiw5Fk';
const PHONE = 'android-e2e-0001';
const ROUNDS = Number(process.env.CONNECT_ROUNDS ?? 6);

test.describe.configure({ mode: 'serial' });

type Dev = { id: string; name: string; track?: { id: string; title: string }; playing?: boolean; position?: number };

/** Stand-in for the Android app: same SSE stream, same state reports, same commands. */
class FakePhone {
  devices: Dev[] = [];
  cmds: Record<string, any>[] = [];
  private ctl = new AbortController();
  constructor(private base: string, private cookie: string) {}
  async connect() {
    const r = await fetch(`${this.base}/api/connect/events?id=${PHONE}&name=Pixel%20E2E&kind=android`, { headers: { cookie: this.cookie }, signal: this.ctl.signal });
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let buf = '';
    (async () => {
      for (;;) {
        const { value, done } = await reader.read().catch(() => ({ value: undefined, done: true }));
        if (done) return;
        buf += dec.decode(value);
        for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /event: (\w+)/.exec(block)?.[1];
          const data = /data: (.*)/.exec(block)?.[1];
          if (!ev || !data) continue;
          if (ev === 'devices') this.devices = JSON.parse(data).devices;
          if (ev === 'command') this.cmds.push(JSON.parse(data).cmd);
        }
      }
    })();
  }
  close() {
    this.ctl.abort();
  }
  post(path: string, body: unknown) {
    return fetch(`${this.base}${path}`, { method: 'POST', headers: { cookie: this.cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }
  send(to: string, cmd: Record<string, unknown>) {
    return this.post('/api/connect/command', { from: PHONE, to, cmd });
  }
  report(playing: boolean, position = 30) {
    return this.post('/api/connect/state', {
      id: PHONE,
      state: { track: { id: 'phone-song', title: 'Phone Song', artists: [{ name: 'X' }] }, playing, position, duration: 200, volume: 1, shuffle: false, repeat: 'off', queueLen: 1 },
    });
  }
  web = () => this.devices.find((d) => d.id !== PHONE);
}

async function login(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lomu-welcomed', '1'));
  await page.goto('/');
  await page.getByPlaceholder('Username').fill(USER, { timeout: 45_000 });
  await page.getByPlaceholder('Password').fill(PASS);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByPlaceholder('Username')).toBeHidden({ timeout: 15_000 });
}

test('web and phone stay in sync, both directions', async ({ page, request, baseURL }) => {
  await request.post('/api/auth/setup', { data: { username: USER, password: PASS } });
  await login(page);
  const cookie = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  const phone = new FakePhone(baseURL!, cookie);
  await phone.connect();
  await expect.poll(() => phone.devices.length, { timeout: 15_000 }).toBe(2);

  // Play on the web.
  await page.goto('/search?q=despacito');
  const row = page.locator('[role="button"]').filter({ hasText: /Despacito/i }).first();
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.click();
  await page.getByRole('button', { name: 'Pause' }).waitFor({ timeout: 30_000 });

  // 1. The phone sees the web tab playing, with progress that moves.
  await expect.poll(() => phone.web()?.playing, { timeout: 15_000 }).toBe(true);
  const p0 = phone.web()!.position!;
  await expect.poll(() => phone.web()!.position!, { timeout: 15_000 }).toBeGreaterThan(p0);
  const webId = phone.web()!.id;
  expect(phone.web()!.track?.id).toBeTruthy();

  // 2. Phone presses pause / play N times: the web follows every time and reports back.
  for (let i = 0; i < ROUNDS; i++) {
    await phone.send(webId, { type: 'pause' });
    await expect(page.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => phone.web()?.playing, { timeout: 10_000 }).toBe(false);
    await phone.send(webId, { type: 'play' });
    await expect(page.getByRole('button', { name: 'Pause', exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect.poll(() => phone.web()?.playing, { timeout: 10_000 }).toBe(true);
  }

  // 3. Seek from the phone moves the web clock.
  await phone.send(webId, { type: 'seek', position: 100 });
  const seek = page.getByRole('slider', { name: 'Seek' }).first();
  await expect.poll(async () => Number(await seek.getAttribute('aria-valuenow')), { timeout: 15_000 }).toBeGreaterThan(95);
  await expect.poll(() => phone.web()!.position!, { timeout: 15_000 }).toBeGreaterThan(95);

  // 4. Phone starts something: the web is paused (one active device) and the web bar now shows the phone.
  await phone.report(true);
  await expect(page.getByText('Playing on Pixel E2E')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Play', exact: true }).first()).toBeHidden();

  // 5. Web bar controls reach the phone; pausing it keeps the web steering the phone (no flip back).
  for (let i = 0; i < ROUNDS; i++) {
    phone.cmds.length = 0;
    await page.getByRole('button', { name: i % 2 ? 'Play' : 'Pause', exact: true }).first().click();
    await expect.poll(() => phone.cmds.some((c) => c.type === 'toggle'), { timeout: 10_000 }).toBe(true);
    await phone.report(i % 2 === 1); // the phone answers with its new state
    await expect(page.getByText('Playing on Pixel E2E')).toBeVisible({ timeout: 10_000 });
  }
  await phone.report(false);
  await expect(page.getByRole('button', { name: 'Play', exact: true }).first()).toBeVisible();
  await expect(page.getByText('Playing on Pixel E2E')).toBeVisible(); // still steering while paused

  // 6. Next from the web reaches the phone.
  phone.cmds.length = 0;
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await expect.poll(() => phone.cmds.some((c) => c.type === 'next'), { timeout: 10_000 }).toBe(true);

  // 7. "This device" in the picker pulls playback back: the phone is asked to hand off to the web tab.
  phone.cmds.length = 0;
  await page.getByRole('button', { name: 'Devices' }).first().click();
  await page.getByRole('button', { name: /This device/ }).click();
  await expect.poll(() => phone.cmds.find((c) => c.type === 'handoff')?.to, { timeout: 10_000 }).toBe(webId);
  // The phone answers like the app does: a load command for the web tab.
  await phone.send(webId, { type: 'load', tracks: [{ kind: 'song', id: VIDEO, title: 'Handed Off', artists: [{ name: 'X' }] }], index: 0, position: 5, play: true });
  await expect(page.getByText('Playing on Pixel E2E')).toBeHidden({ timeout: 10_000 });
  await expect(page.getByText('Handed Off').first()).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => phone.web()?.playing, { timeout: 20_000 }).toBe(true);

  // 8. Web -> phone: pick the phone in the picker; it receives the queue to play.
  phone.cmds.length = 0;
  await page.getByRole('button', { name: 'Devices' }).first().click();
  await page.getByRole('button', { name: /Pixel E2E/ }).click();
  await expect.poll(() => phone.cmds.find((c) => c.type === 'load')?.tracks?.[0]?.id, { timeout: 10_000 }).toBe(VIDEO);
  await expect(page.getByText('Playing on Pixel E2E')).toBeVisible({ timeout: 10_000 });

  phone.close();
});
