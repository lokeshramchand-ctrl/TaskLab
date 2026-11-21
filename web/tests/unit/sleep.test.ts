import { describe, expect, it } from 'vitest';
import { detectSleep, followsOn, formatSpan } from '@/lib/sleep';
import { deepStats } from '@/lib/insights';
import type { Track } from '@/lib/types';

const T = (id: string): Track => ({ kind: 'song', id, title: id, artists: [{ name: 'A' }] });
const MIN = 60_000;
const start = new Date(2026, 10, 18, 23, 0).getTime();
// n back-to-back 3.5 minute songs, all finished, starting at `at`
const run = (n: number, at = start, ms = 210_000) =>
  Array.from({ length: n }, (_, i) => ({ track: T('s' + i), at: at + i * ms, playedMs: ms, completed: true }));

describe('detectSleep', () => {
  it('finds a long unattended run and estimates when sleep began', () => {
    const plays = [{ track: T('x'), at: start - 10 * MIN, playedMs: 2 * MIN, completed: false, skipped: true }, ...run(100)];
    const [s] = detectSleep(plays);
    expect(s.plays).toHaveLength(100);
    expect(s.start).toBe(start);
    expect(s.asleepFrom).toBe(start + 15 * MIN);
    expect(s.asleepMs).toBe(100 * 210_000 - 15 * MIN);
    expect(s.confidence).toBe('high'); // overnight and 5+ hours
  });
  it('ignores short runs and runs broken by a skip', () => {
    expect(detectSleep(run(12))).toHaveLength(0); // 42 min: just a long listen
    const broken = run(40);
    broken[20] = { ...broken[20], completed: false, playedMs: 8000, skipped: true } as never;
    expect(detectSleep(broken)).toHaveLength(0);
  });
  it('uses the song the user says they remember', () => {
    const plays = run(60);
    const [s] = detectSleep(plays, { [String(start)]: plays[5].at });
    expect(s.corrected).toBe(true);
    expect(s.lastAwakeIndex).toBe(5);
    expect(s.asleepFrom).toBe(plays[5].at + 105_000);
  });
  it('copes with logs stamped when a song ends instead of when it starts', () => {
    const a = { track: T('a'), at: 1000, playedMs: 200_000, completed: true };
    const b = { track: T('b'), at: 1000 + 200_000, playedMs: 200_000, completed: true };
    expect(followsOn(a, b)).toBe(true);
    expect(followsOn(a, { ...b, at: b.at + 10 * MIN })).toBe(false);
  });
});

describe('misc', () => {
  it('formats spans', () => {
    expect(formatSpan(45 * MIN)).toBe('45m');
    expect(formatSpan(7 * 60 * MIN + 20 * MIN)).toBe('7h 20m');
  });
  it('deepStats can leave excluded plays out', () => {
    const plays = run(4);
    const all = deepStats(plays, start + 1e7);
    const some = deepStats(plays, start + 1e7, (p) => p.at >= plays[2].at);
    expect(all.totalMs).toBe(4 * 210_000);
    expect(some.totalMs).toBe(2 * 210_000);
    expect(all.hourMs[23]).toBeGreaterThan(0);
  });
});
