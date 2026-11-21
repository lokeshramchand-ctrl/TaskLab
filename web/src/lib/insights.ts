import type { ArtistRef, Track } from './types';

/* Pure helpers behind the personalised parts of the home page (no React, unit-tested). */

export type PlayLike = { track: Track; at: number; playedMs: number; completed: boolean };

const DAY = 86_400_000;
const dayKey = (t: number) => {
  const d = new Date(t);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/** Last 7 days (oldest first) of listening minutes, plus headline numbers. */
export function weekStats(history: PlayLike[], now = Date.now()) {
  const today = dayKey(now);
  const daily = Array.from({ length: 7 }, () => 0);
  let plays = 0;
  const artistMs = new Map<string, { ref: ArtistRef; ms: number }>();
  const days = new Set<number>();
  for (const p of history) {
    const k = dayKey(p.at);
    days.add(k);
    const back = Math.round((today - k) / DAY);
    if (back >= 0 && back < 7) {
      daily[6 - back] += p.playedMs / 60_000;
      if (p.completed) plays++;
      const a = p.track.artists[0];
      if (a && a.name !== 'N/A') {
        const cur = artistMs.get(a.name) ?? { ref: a, ms: 0 };
        cur.ms += p.playedMs;
        artistMs.set(a.name, cur);
      }
    }
  }
  // Streak: consecutive days with any listening, ending today (or yesterday if nothing yet today).
  let streak = 0;
  let cursor = days.has(today) ? today : today - DAY;
  while (days.has(cursor)) {
    streak++;
    cursor -= DAY;
  }
  const top = [...artistMs.values()].sort((a, b) => b.ms - a.ms)[0];
  return { minutes: Math.round(daily.reduce((a, b) => a + b, 0)), plays, streak, daily: daily.map((m) => Math.round(m)), topArtist: top?.ref };
}

/** Most recent distinct songs, topped up from likes when the history is short. */
export function recentTracks(history: PlayLike[], liked: { track: Track; at: number }[], n = 8): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  const push = (t: Track) => {
    if (seen.has(t.id) || t.video) return;
    seen.add(t.id);
    out.push(t);
  };
  for (const p of history) {
    push(p.track);
    if (out.length >= n) return out;
  }
  for (const l of [...liked].sort((a, b) => b.at - a.at)) {
    push(l.track);
    if (out.length >= n) break;
  }
  return out;
}

/** Artists ranked by completed plays and listening time, with an id so they can be linked. */
export function topArtists(history: PlayLike[], n = 12): ArtistRef[] {
  const score = new Map<string, { ref: ArtistRef; s: number }>();
  for (const p of history) {
    for (const a of p.track.artists.slice(0, 1)) {
      if (!a.id) continue;
      const cur = score.get(a.id) ?? { ref: a, s: 0 };
      cur.s += (p.completed ? 1 : 0.25) + p.playedMs / 600_000;
      score.set(a.id, cur);
    }
  }
  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, n).map((x) => x.ref);
}

export function formatMinutes(m: number): { value: string; unit: string } {
  if (m >= 90) return { value: (m / 60).toFixed(m >= 600 ? 0 : 1), unit: 'h' };
  return { value: String(m), unit: 'min' };
}

/* ---------------------------------------------------------------- deeper analytics */

export type DeepStats = {
  totalMs: number;
  monthMs: number;
  activeDays: number;
  avgDayMs: number; // per day you listened
  hourMs: number[]; // 24 buckets, local time
  weekdayMs: number[]; // Monday first
  completionRate: number; // 0..1 of plays that were finished
  skipRate: number;
  uniqueSongs: number;
  uniqueArtists: number;
  longestStreak: number; // days in a row
  topTracks: { track: Track; plays: number; ms: number }[];
  topArtistsMs: { name: string; ms: number; plays: number; id?: string }[];
  peakHour: number | null;
  newArtistsThisMonth: number;
};

/** Everything the Insights page shows, from the play log. `exclude` drops plays (e.g. the ones while asleep) from the totals and charts. */
export function deepStats(history: (PlayLike & { skipped?: boolean })[], now = Date.now(), exclude: (p: PlayLike) => boolean = () => false): DeepStats {
  const hourMs = Array.from({ length: 24 }, () => 0);
  const weekdayMs = Array.from({ length: 7 }, () => 0);
  const days = new Set<number>();
  const tracks = new Map<string, { track: Track; plays: number; ms: number }>();
  const artists = new Map<string, { name: string; ms: number; plays: number; id?: string }>();
  const firstSeen = new Map<string, number>();
  const monthAgo = now - 30 * DAY;
  let totalMs = 0, monthMs = 0, done = 0, skips = 0, n = 0;
  for (const p of history) {
    const a = p.track.artists[0]?.name;
    if (a && a !== 'N/A') firstSeen.set(a, Math.min(firstSeen.get(a) ?? Infinity, p.at));
    if (exclude(p)) continue;
    n++;
    totalMs += p.playedMs;
    if (p.at >= monthAgo) monthMs += p.playedMs;
    if (p.completed) done++;
    if (p.skipped) skips++;
    days.add(dayKey(p.at));
    const d = new Date(p.at);
    hourMs[d.getHours()] += p.playedMs;
    weekdayMs[(d.getDay() + 6) % 7] += p.playedMs;
    const t = tracks.get(p.track.id) ?? { track: p.track, plays: 0, ms: 0 };
    t.plays += p.completed ? 1 : 0;
    t.ms += p.playedMs;
    tracks.set(p.track.id, t);
    if (a && a !== 'N/A') {
      const x = artists.get(a) ?? { name: a, ms: 0, plays: 0, id: p.track.artists[0]?.id };
      x.ms += p.playedMs;
      x.plays += p.completed ? 1 : 0;
      artists.set(a, x);
    }
  }
  const sorted = [...days].sort((a, b) => a - b);
  let best = 0, cur = 0;
  sorted.forEach((d, i) => {
    cur = i && Math.round((d - sorted[i - 1]) / DAY) === 1 ? cur + 1 : 1;
    best = Math.max(best, cur);
  });
  const peak = Math.max(...hourMs);
  return {
    totalMs,
    monthMs,
    activeDays: days.size,
    avgDayMs: days.size ? totalMs / days.size : 0,
    hourMs,
    weekdayMs,
    completionRate: n ? done / n : 0,
    skipRate: n ? skips / n : 0,
    uniqueSongs: tracks.size,
    uniqueArtists: artists.size,
    longestStreak: best,
    topTracks: [...tracks.values()].sort((a, b) => b.ms - a.ms).slice(0, 10),
    topArtistsMs: [...artists.values()].sort((a, b) => b.ms - a.ms).slice(0, 10),
    peakHour: peak > 0 ? hourMs.indexOf(peak) : null,
    newArtistsThisMonth: [...firstSeen.values()].filter((t) => t >= monthAgo).length,
  };
}
