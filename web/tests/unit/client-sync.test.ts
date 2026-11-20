import { describe, expect, it } from 'vitest';
import { toDocs } from '@/player/sync';
import type { Track } from '@/lib/types';

const T = (id: string): Track => ({ kind: 'song', id, title: id, artists: [{ name: 'A' }] });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const base = { liked: {}, history: [], playlists: [], albums: {}, artists: {}, savedPlaylists: {} } as any;

describe('client diff', () => {
  it('offers everything on the first sync', () => {
    const s = { ...base, liked: { a: { track: T('a'), at: 5 } }, playlists: [{ id: 'p', name: 'x', tracks: [], createdAt: 1, updatedAt: 2 }] };
    const { docs } = toDocs(null, s);
    expect(docs.map((d) => `${d.kind}:${d.key}`).sort()).toEqual(['like:a', 'playlist:p']);
  });

  it('emits a like, then a tombstone when it is removed', () => {
    const { snap: snap0 } = toDocs(null, base);
    const s1 = { ...base, liked: { a: { track: T('a'), at: 10 } } };
    const r1 = toDocs(snap0, s1);
    expect(r1.docs).toEqual([{ kind: 'like', key: 'a', value: s1.liked.a, updated: 10 }]);
    const r2 = toDocs(r1.snap, base, 99);
    expect(r2.docs).toEqual([{ kind: 'like', key: 'a', value: null, updated: 99, deleted: true }]);
  });

  it('only emits playlists whose updatedAt changed, and new plays', () => {
    const p = { id: 'p', name: 'x', tracks: [], createdAt: 1, updatedAt: 2 };
    const { snap } = toDocs(null, { ...base, playlists: [p] });
    const play = { track: T('t'), at: 50, playedMs: 1, completed: true, skipped: false };
    const r = toDocs(snap, { ...base, playlists: [{ ...p, name: 'y', updatedAt: 3 }], history: [play] });
    expect(r.docs.map((d) => d.kind).sort()).toEqual(['play', 'playlist']);
  });
});

describe('documents written by the Android client', () => {
  it('applies saved albums, artists and playlists in the phone\'s shape', async () => {
    const { applyRows } = await import('@/player/sync');
    const { useLibrary } = await import('@/player/library');
    useLibrary.setState({ albums: {}, artists: {}, savedPlaylists: {} });
    const doc = (key: string, item: Record<string, unknown>) => ({ kind: 'saved', key, value: { item, at: 7 }, updated: 7, deleted: false, seq: 1 });
    applyRows([
      doc('MPREb_1', { kind: 'album', id: 'MPREb_1', title: 'Al', artists: [{ id: 'UC1', name: 'Ar' }], year: '2020', thumb: 'x' }),
      doc('UC1', { kind: 'artist', id: 'UC1', title: 'Ar' }),
      doc('PL1', { kind: 'playlist', id: 'PL1', title: 'Pl' }),
    ]);
    const s = useLibrary.getState();
    expect(Object.keys(s.albums)).toEqual(['MPREb_1']);
    expect(Object.keys(s.artists)).toEqual(['UC1']);
    expect(Object.keys(s.savedPlaylists)).toEqual(['PL1']);
    applyRows([{ kind: 'saved', key: 'UC1', value: null, updated: 9, deleted: true, seq: 2 }]);
    expect(useLibrary.getState().artists).toEqual({});
  });
});
