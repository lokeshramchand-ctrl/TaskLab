import { beforeEach, describe, expect, it } from 'vitest';
import type { Track } from '@/lib/types';

const T = (id: string): Track => ({ kind: 'song', id, title: id, artists: [{ name: 'A' }] });

// The module reads localStorage; give it an in-memory one.
const mem = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, v),
  removeItem: (k: string) => void mem.delete(k),
} as Storage;

const row = (value: unknown, deleted = false) => ({ kind: 'queue', key: 'current', value, deleted });

describe('queue sync (continue listening)', () => {
  beforeEach(async () => {
    mem.clear();
    (await import('@/player/queue-sync')).useRemoteQueue.setState({ q: null });
  });

  it('offers a queue from another device, newest first, and ignores its own', async () => {
    const m = await import('@/player/queue-sync');
    const me = m.deviceId();
    m.noteQueueRows([row({ tracks: [T('a'), T('b')], index: 1, positionMs: 5000, at: 100, dev: 'phone', device: 'android' })]);
    expect(m.useRemoteQueue.getState().q).toMatchObject({ device: 'android', index: 1, positionMs: 5000, at: 100 });
    m.dismissRemote();
    expect(m.useRemoteQueue.getState().q).toBeNull();
    // the same (or an older) queue is not offered again after it was dismissed
    m.noteQueueRows([row({ tracks: [T('a')], index: 0, at: 100, dev: 'phone' })]);
    expect(m.useRemoteQueue.getState().q).toBeNull();
    // a newer one is, but one written by this browser never is
    m.noteQueueRows([row({ tracks: [T('c')], index: 0, at: 200, dev: me })]);
    expect(m.useRemoteQueue.getState().q).toBeNull();
    m.noteQueueRows([row({ tracks: [T('c')], index: 9, at: 200, dev: 'phone' })]);
    expect(m.useRemoteQueue.getState().q?.index).toBe(0); // clamped into range
  });

  it('a tombstone clears the offer', async () => {
    const m = await import('@/player/queue-sync');
    m.noteQueueRows([row({ tracks: [T('a')], index: 0, at: 5, dev: 'phone' })]);
    expect(m.useRemoteQueue.getState().q).not.toBeNull();
    m.noteQueueRows([row(null, true)]);
    expect(m.useRemoteQueue.getState().q).toBeNull();
  });
});
