import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

/* The desktop app's hub worker against a fake hub that behaves like the real /api/sync + /api/auth routes. */

type Doc = { kind: string; key: string; value: unknown; updated: number; deleted?: boolean };
const hubDocs = new Map<string, Doc & { seq: number }>();
let hubSeq = 0;
let up = true;
let logins = 0;
let accessOk = 'a';
let refreshes = 0;
let port = 0;
let srv: http.Server;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lomu-hub-test-'));

const readBody = (req: http.IncomingMessage) => new Promise<string>((res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => res(b)); });

beforeAll(async () => {
  process.env.LOMU_DATA_DIR = dir;
  process.env.LOMU_LOCAL_TOKEN = 'test';
  srv = http.createServer(async (req, res) => {
    if (!up) return req.socket.destroy();
    const url = new URL(req.url!, 'http://x');
    const send = (code: number, o: unknown) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (url.pathname === '/api/auth/login') { logins++; return send(200, { access: 'a', refresh: 'r', user: 'me' }); }
    if (url.pathname === '/api/auth/refresh') { refreshes++; accessOk = 'b'; return send(200, { access: 'b', refresh: 'r2' }); }
    if (req.headers.authorization !== 'Bearer ' + accessOk) return send(401, { error: 'unauthorized' });
    if (url.pathname === '/api/sync' && req.method === 'GET') {
      const since = Number(url.searchParams.get('since') ?? 0);
      const docs = [...hubDocs.values()].filter((d) => d.seq > since).sort((a, b) => a.seq - b.seq);
      return send(200, { seq: docs.length ? docs[docs.length - 1].seq : since, docs: docs.map((d) => ({ ...d, deleted: !!d.deleted })) });
    }
    if (url.pathname === '/api/sync' && req.method === 'POST') {
      const { docs } = JSON.parse(await readBody(req)) as { docs: Doc[] };
      let applied = 0;
      for (const d of docs) {
        const cur = hubDocs.get(d.kind + ':' + d.key);
        if (cur && cur.updated > d.updated) continue;
        hubDocs.set(d.kind + ':' + d.key, { ...d, seq: ++hubSeq });
        applied++;
      }
      return send(200, { seq: hubSeq, applied });
    }
    send(404, {});
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
  port = (srv.address() as AddressInfo).port;
});
afterAll(async () => {
  srv.close();
  (await import('@/server/db')).closeDb();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe('hub sync worker', () => {
  it('merges both ways on first connect and does not echo', async () => {
    const sync = await import('@/server/sync');
    const hub = await import('@/server/hub');
    hubDocs.set('like:h1', { kind: 'like', key: 'h1', value: { from: 'hub' }, updated: 100, seq: ++hubSeq });
    sync.push([{ kind: 'like', key: 'l1', value: { from: 'pc' }, updated: 200 }]);

    await hub.connectHub(`http://127.0.0.1:${port}`, 'me', 'pw');
    await hub.syncHub();

    expect(hub.hubStatus()).toMatchObject({ state: 'online', pending: 0, user: 'me' });
    expect(sync.all('like').map((d) => d.key).sort()).toEqual(['h1', 'l1']); // hub doc arrived here
    expect(hubDocs.get('like:l1')?.value).toEqual({ from: 'pc' }); // local doc arrived there
    const hubBefore = hubSeq;
    await hub.syncHub();
    expect(hubSeq).toBe(hubBefore); // a quiet round writes nothing
  });

  it('queues edits while the hub is down and delivers them when it is back', async () => {
    const sync = await import('@/server/sync');
    const hub = await import('@/server/hub');
    up = false;
    sync.push([{ kind: 'playlist', key: 'p', value: { name: 'made offline' }, updated: 300 }]);
    await hub.syncHub();
    expect(hub.hubStatus().state).toBe('offline');
    expect(hub.hubStatus().pending).toBeGreaterThan(0);
    expect(hubDocs.has('playlist:p')).toBe(false);

    up = true;
    await hub.syncHub();
    expect(hub.hubStatus()).toMatchObject({ state: 'online', pending: 0 });
    expect(hubDocs.get('playlist:p')?.value).toEqual({ name: 'made offline' });
  });

  it('keeps the newer side on conflict and removes hub tombstones locally', async () => {
    const sync = await import('@/server/sync');
    const hub = await import('@/server/hub');
    hubDocs.set('like:l1', { kind: 'like', key: 'l1', value: null, updated: 999, deleted: true, seq: ++hubSeq });
    sync.push([{ kind: 'like', key: 'h1', value: { from: 'pc-newer' }, updated: 500 }]);
    await hub.syncHub();
    expect(sync.all('like').map((d) => d.key)).toEqual(['h1']); // l1 deleted on the hub (newer), h1 kept
    expect(hubDocs.get('like:h1')?.value).toEqual({ from: 'pc-newer' });
  });

  it('renews an expired access token with the refresh token and carries on', async () => {
    const sync = await import('@/server/sync');
    const hub = await import('@/server/hub');
    accessOk = 'expired-for-everyone-but-b'; // the stored access token ('a') is now rejected
    sync.push([{ kind: 'search', key: 'after-expiry', value: { q: 1 }, updated: 700 }]);
    await hub.syncHub();
    expect(refreshes).toBe(1);
    expect(hub.hubStatus().state).toBe('online');
    expect(hubDocs.has('search:after-expiry')).toBe(true);
  });

  it('disconnect stops syncing', async () => {
    const hub = await import('@/server/hub');
    hub.disconnectHub();
    expect(hub.hubStatus()).toMatchObject({ state: 'off', url: null });
  });
});
