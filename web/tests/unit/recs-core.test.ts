import { describe, expect, it } from 'vitest';
import { affinity, diversify, rankCandidates, type PlayDoc } from '@/server/recs-core';
import type { Track } from '@/lib/types';

const T = (id: string, artist: string): Track => ({ kind: 'song', id, title: id, artists: [{ name: artist }] });
const DAY = 86_400_000;
const now = Date.UTC(2026, 10, 18);
const play = (t: Track, daysAgo: number, how: 'done' | 'skip' | 'part'): PlayDoc => ({
  track: t,
  at: now - daysAgo * DAY,
  playedMs: how === 'skip' ? 8000 : 180000,
  completed: how === 'done',
  skipped: how === 'skip',
});

describe('affinity', () => {
  it('rewards completions and punishes early skips', () => {
    const a = T('a', 'A');
    const b = T('b', 'B');
    const aff = affinity([play(a, 1, 'done'), play(b, 1, 'skip')], [], now);
    expect(aff.trackScore.get('a')!).toBeGreaterThan(0);
    expect(aff.trackScore.get('b')!).toBeLessThan(0);
    expect(aff.skipped.has('b')).toBe(true);
    expect(aff.topTracks.map((t) => t.id)).toEqual(['a']);
  });

  it('recent plays outweigh old ones', () => {
    const a = T('a', 'A');
    const b = T('b', 'B');
    const aff = affinity([play(a, 90, 'done'), play(b, 1, 'done')], [], now);
    expect(aff.trackScore.get('b')!).toBeGreaterThan(aff.trackScore.get('a')!);
  });

  it('a like rescues a skipped track from the skip list', () => {
    const a = T('a', 'A');
    const aff = affinity([play(a, 2, 'skip')], [{ track: a, at: now - DAY }], now);
    expect(aff.skipped.has('a')).toBe(false);
  });

  it('marks tracks completed 3+ times as heavily played', () => {
    const a = T('a', 'A');
    const aff = affinity([1, 2, 3].map((d) => play(a, d, 'done')), [], now);
    expect(aff.heavilyPlayed.has('a')).toBe(true);
    expect(aff.onRepeat[0].id).toBe('a');
  });
});

describe('rankCandidates', () => {
  it('prefers candidates several seeds agree on and drops skipped ones', () => {
    const s1 = T('s1', 'S1');
    const s2 = T('s2', 'S2');
    const common = T('common', 'X');
    const once = T('once', 'Y');
    const bad = T('bad', 'Z');
    const aff = affinity([play(s1, 1, 'done'), play(s2, 1, 'done'), play(bad, 1, 'skip')], [], now);
    const ranked = rankCandidates(
      [s1, s2],
      new Map([
        [s1.id, [once, common, bad]],
        [s2.id, [common]],
      ]),
      aff,
    );
    expect(ranked.map((t) => t.id)).toEqual(['common', 'once']);
  });
});

describe('diversify', () => {
  it('caps tracks per lead artist and keeps order', () => {
    const list = [T('1', 'A'), T('2', 'A'), T('3', 'A'), T('4', 'B')];
    expect(diversify(list, 2).map((t) => t.id)).toEqual(['1', '2', '4']);
  });
});

describe('dailyMix', () => {
  const lib = Array.from({ length: 30 }, (_, i) => T('f' + i, 'Fav' + (i % 10)));
  const fresh = Array.from({ length: 60 }, (_, i) => T('n' + i, 'New' + (i % 25)));
  const aff = affinity(lib.map((t) => play(t, 2, 'done')), [], now);
  it('is stable within a day, differs across days, has no repeats or back-to-back artists', async () => {
    const { dailyMix } = await import('@/server/recs-core');
    const a = dailyMix(aff, fresh, '2026-11-21', 40);
    expect(a.map((t) => t.id)).toEqual(dailyMix(aff, fresh, '2026-11-21', 40).map((t) => t.id));
    expect(a.map((t) => t.id)).not.toEqual(dailyMix(aff, fresh, '2026-11-22', 40).map((t) => t.id));
    expect(new Set(a.map((t) => t.id)).size).toBe(a.length);
    expect(a.length).toBeGreaterThanOrEqual(30);
    for (let i = 1; i < a.length; i++) expect(a[i].artists[0].name).not.toBe(a[i - 1].artists[0].name);
  });
});
