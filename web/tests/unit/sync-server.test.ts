import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let sync: typeof import('@/server/sync');
let auth: typeof import('@/server/auth');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lomu-test-'));

beforeAll(async () => {
  process.env.LOMU_DATA_DIR = dir;
  sync = await import('@/server/sync');
  auth = await import('@/server/auth');
});
afterAll(async () => {
  (await import('@/server/db')).closeDb();
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
});

describe('sync log', () => {
  it('assigns increasing seq and pulls incrementally', () => {
    const r1 = sync.push([{ kind: 'like', key: 'a', value: { x: 1 }, updated: 100 }]);
    const r2 = sync.push([{ kind: 'like', key: 'b', value: { x: 2 }, updated: 100 }]);
    expect(r2.seq).toBeGreaterThan(r1.seq);
    const since = sync.pull(r1.seq);
    expect(since.docs.map((d) => d.key)).toEqual(['b']);
    expect(sync.pull(0).docs).toHaveLength(2);
  });

  it('last write wins by updated timestamp', () => {
    sync.push([{ kind: 'playlist', key: 'p', value: { name: 'new' }, updated: 200 }]);
    const stale = sync.push([{ kind: 'playlist', key: 'p', value: { name: 'old' }, updated: 150 }]);
    expect(stale.applied).toBe(0);
    expect(sync.all('playlist')[0].value.name).toBe('new');
  });

  it('ignores a write that changes nothing, so re-offering a whole library does not re-stamp it', () => {
    const first = sync.push([{ kind: 'saved', key: 's1', value: { a: 1 }, updated: 400 }]);
    const again = sync.push([{ kind: 'saved', key: 's1', value: { a: 1 }, updated: 400 }]);
    expect(first.applied).toBe(1);
    expect(again.applied).toBe(0);
    expect(again.seq).toBe(first.seq);
    expect(sync.push([{ kind: 'saved', key: 's1', value: { a: 2 }, updated: 400 }]).applied).toBe(1); // same time, new content: kept
  });

  it('tombstones propagate and hide from live queries', () => {
    sync.push([{ kind: 'like', key: 'a', value: null, updated: 300, deleted: true }]);
    const docs = sync.pull(0).docs;
    expect(docs.find((d) => d.key === 'a')!.deleted).toBe(true);
    expect(sync.all('like').map((d) => d.key)).toEqual(['b']);
  });

  it('rejects unknown kinds and oversized keys', () => {
    const r = sync.push([
      { kind: 'nope', key: 'x', value: 1, updated: 1 },
      { kind: 'like', key: 'k'.repeat(300), value: 1, updated: 1 },
    ]);
    expect(r.applied).toBe(0);
  });

  it('notifies listeners when something changed', () => {
    let seen = 0;
    const off = sync.onChange((s) => (seen = s));
    const r = sync.push([{ kind: 'search', key: 'q', value: 'x', updated: 5 }]);
    off();
    expect(seen).toBe(r.seq);
  });
});

describe('auth', () => {
  it('creates one owner and checks the password', () => {
    expect(auth.hasOwner()).toBe(false);
    expect(() => auth.createOwner('lo', 'short')).toThrow();
    auth.createOwner('lo', 'correct horse battery');
    expect(auth.hasOwner()).toBe(true);
    expect(() => auth.createOwner('other', 'another password')).toThrow('already set up');
    expect(auth.checkPassword('lo', 'correct horse battery')).toBe(true);
    expect(auth.checkPassword('LO', 'correct horse battery')).toBe(true);
    expect(auth.checkPassword('lo', 'wrong password')).toBe(false);
    expect(auth.checkPassword('nobody', 'correct horse battery')).toBe(false);
  });

  it('signs verifiable tokens and rejects tampered ones', () => {
    const t = auth.issueTokens('lo');
    expect(auth.verify(t.access)?.sub).toBe('lo');
    const [h, b, s] = t.access.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'evil', exp: 9e9 })).toString('base64url')}.${s}`;
    expect(auth.verify(forged)).toBeNull();
    expect(auth.verify(`${h}.${b}.`)).toBeNull();
    expect(auth.verify('garbage')).toBeNull();
  });

  it('rotates refresh tokens: each works once', () => {
    const t = auth.issueTokens('lo');
    const next = auth.rotate(t.refresh);
    expect(next).not.toBeNull();
    expect(auth.rotate(t.refresh)).toBeNull();
    expect(auth.rotate(next!.refresh)).not.toBeNull();
  });
});
