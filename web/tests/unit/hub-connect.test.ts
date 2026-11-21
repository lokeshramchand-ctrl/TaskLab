import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

/* The desktop app's Connect calls must land on the hub (where the phone is), and fall back to the local relay when the hub is away. */

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lomu-hubconnect-test-'));
let srv: http.Server;
let up = true;
const seen: string[] = [];

beforeAll(async () => {
  process.env.LOMU_DATA_DIR = dir;
  process.env.LOMU_LOCAL_TOKEN = 'test';
  srv = http.createServer((req, res) => {
    if (!up) return req.socket.destroy();
    const url = new URL(req.url!, 'http://x');
    seen.push(`${req.method} ${url.pathname}${url.search} ${req.headers.authorization}`);
    if (url.pathname === '/api/auth/login') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ access: 'a', refresh: 'r' }));
    }
    if (url.pathname === '/api/connect/devices') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ devices: [{ id: 'phone-device-1', name: 'Pixel', kind: 'android' }], active: 'phone-device-1', now: 1 }));
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
});
afterAll(async () => {
  srv.close();
  (await import('@/server/db')).closeDb();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe('hubConnect', () => {
  it('is null with no hub configured', async () => {
    const hub = await import('@/server/hub');
    expect(await hub.hubConnect('devices')).toBeNull();
  });
  it('forwards to the hub as the signed-in PC, and gives up quietly when the hub is down', async () => {
    const hub = await import('@/server/hub');
    await hub.connectHub(`http://127.0.0.1:${(srv.address() as AddressInfo).port}`, 'me', 'pw');
    const r = await hub.hubConnect('devices');
    expect((await r!.json()).devices[0].name).toBe('Pixel');
    expect(seen.some((s) => s.startsWith('GET /api/connect/devices') && s.endsWith('Bearer a'))).toBe(true);
    const p = await hub.hubConnect('state', { method: 'POST', body: '{}' });
    expect(p?.status).toBe(200);
    up = false;
    expect(await hub.hubConnect('devices')).toBeNull();
    hub.disconnectHub();
  });
});
