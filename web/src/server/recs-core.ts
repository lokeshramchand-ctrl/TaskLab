import type { Track } from '@/lib/types';

/* Pure scoring for the recommendation engine (no I/O, so it is unit-tested). */

export type PlayDoc = { track: Track; at: number; playedMs: number; completed: boolean; skipped: boolean };
export type LikeDoc = { track: Track; at: number };

export type Affinity = {
  trackScore: Map<string, number>;
  artistScore: Map<string, number>;
  topTracks: Track[]; // strongest positive signals, distinct artists preferred
  onRepeat: Track[]; // most played in the last 30 days
  heavilyPlayed: Set<string>; // completed 3+ times: not "new" any more
  skipped: Set<string>; // early-skipped recently and never liked
  knownArtists: Set<string>;
  favorites: Track[]; // strongest tracks overall (positive score), best first: the "familiar" pool of the daily mix
};

const DAY = 86_400_000;
const decay = (ageMs: number, halfLifeDays: number) => Math.pow(0.5, Math.max(0, ageMs) / DAY / halfLifeDays);
const name = (t: Track) => t.artists[0]?.name.toLowerCase() ?? '';

export function affinity(plays: PlayDoc[], likes: LikeDoc[], now: number): Affinity {
  const trackScore = new Map<string, number>();
  const artistScore = new Map<string, number>();
  const byId = new Map<string, Track>();
  const completions = new Map<string, number>();
  const recentSkips = new Map<string, number>();
  const monthPlays = new Map<string, number>();
  const likedIds = new Set(likes.map((l) => l.track.id));

  const add = (t: Track, w: number) => {
    byId.set(t.id, t);
    trackScore.set(t.id, (trackScore.get(t.id) ?? 0) + w);
    for (const a of t.artists) artistScore.set(a.name.toLowerCase(), (artistScore.get(a.name.toLowerCase()) ?? 0) + w * 0.5);
  };

  for (const p of plays) {
    const age = now - p.at;
    const d = decay(age, 14);
    if (p.completed) {
      add(p.track, d); // finishing a song is the strongest implicit "yes"
      completions.set(p.track.id, (completions.get(p.track.id) ?? 0) + 1);
      if (age < 30 * DAY) monthPlays.set(p.track.id, (monthPlays.get(p.track.id) ?? 0) + 1);
    } else if (p.skipped) {
      add(p.track, -1.2 * d);
      if (age < 21 * DAY) recentSkips.set(p.track.id, (recentSkips.get(p.track.id) ?? 0) + 1);
    } else {
      // Listened for a while but not to the end: the further in, the stronger the "yes" (flat 0.3 when the length is unknown).
      const dur = (p.track.duration ?? 0) * 1000;
      add(p.track, (dur > 0 ? Math.min(0.7, Math.max(0.1, (p.playedMs / dur) * 0.8)) : 0.3) * d);
    }
  }
  for (const l of likes) add(l.track, 2 * decay(now - l.at, 45));

  const ranked = [...trackScore.entries()].filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]);
  const topTracks: Track[] = [];
  const usedArtists = new Set<string>();
  for (const [id] of ranked) {
    const t = byId.get(id)!;
    if (usedArtists.has(name(t)) && topTracks.length < 3) continue; // spread the first few seeds
    usedArtists.add(name(t));
    topTracks.push(t);
    if (topTracks.length >= 12) break;
  }

  const onRepeat = [...monthPlays.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => byId.get(id)!);

  const favorites = ranked.slice(0, 80).map(([id]) => byId.get(id)!);

  return {
    trackScore,
    favorites,
    artistScore,
    topTracks,
    onRepeat,
    heavilyPlayed: new Set([...completions].filter(([, n]) => n >= 3).map(([id]) => id)),
    skipped: new Set([...recentSkips].filter(([id, n]) => n >= 1 && !likedIds.has(id)).map(([id]) => id)),
    knownArtists: new Set([...artistScore].filter(([, s]) => s > 0).map(([a]) => a)),
  };
}

/**
 * Consensus ranking: a candidate that several strong seeds agree on, ranked high in each
 * seed's radio, beats one that appears once. Skipped and over-played tracks drop out.
 */
export function rankCandidates(seeds: Track[], cands: Map<string, Track[]>, aff: Affinity): Track[] {
  const score = new Map<string, number>();
  const byId = new Map<string, Track>();
  const seedIds = new Set(seeds.map((s) => s.id));
  seeds.forEach((seed, si) => {
    const seedWeight = 1 / (1 + si * 0.25);
    (cands.get(seed.id) ?? []).forEach((t, rank, list) => {
      if (seedIds.has(t.id) || aff.skipped.has(t.id) || aff.heavilyPlayed.has(t.id)) return;
      byId.set(t.id, t);
      const positional = 1 - (rank / Math.max(1, list.length)) * 0.5;
      score.set(t.id, (score.get(t.id) ?? 0) + seedWeight * positional);
    });
  });
  for (const [id, s] of score) {
    const t = byId.get(id)!;
    const artistBoost = Math.min(1, Math.max(0, ...t.artists.map((a) => aff.artistScore.get(a.name.toLowerCase()) ?? 0)) / 5);
    score.set(id, s * (1 + 0.3 * artistBoost));
  }
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => byId.get(id)!);
}

/** Keeps at most `cap` tracks per lead artist, preserving order. */
export function diversify(list: Track[], cap: number): Track[] {
  const seen = new Map<string, number>();
  const out: Track[] = [];
  for (const t of list) {
    const a = name(t);
    const n = seen.get(a) ?? 0;
    if (a && n >= cap) continue;
    seen.set(a, n + 1);
    out.push(t);
  }
  return out;
}

/* ---------------------------------------------------------------- daily mix */

/** Local calendar day, e.g. 2026-11-21: the mix is rebuilt when this changes. */
export const dayKey = (now: number) => {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Small deterministic PRNG (mulberry32), so a given day always shuffles the same way. */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks `n` of `list`, favouring the front (weights fall off with rank) but never in the same order two days running. */
function pickWeighted<T>(list: T[], n: number, rnd: () => number): T[] {
  const pool = list.map((t, i) => ({ t, k: Math.pow(rnd(), 1 / (1 + 1.5 / (1 + i * 0.15))) }));
  return pool.sort((a, b) => b.k - a.k).slice(0, n).map((x) => x.t);
}

/** Which seeds to explore today: always the top two, the rest rotate so each day reaches a different corner of your taste. */
export function dailySeeds(top: Track[], day: string, n = 6): Track[] {
  if (top.length <= n) return top;
  const rnd = seeded('seeds:' + day);
  return [...top.slice(0, 2), ...pickWeighted(top.slice(2), n - 2, rnd)];
}

/**
 * The daily mix: a playlist, not a list. Three pools are blended in a fixed rhythm
 * (familiar favourite, fresh track from a known artist, fresh track, ... with a discovery every fifth slot),
 * so it opens with something you love, never runs two tracks by one artist back to back, and
 * eases from comfortable to new and back. Deterministic per day.
 */
export function dailyMix(aff: Affinity, ranked: Track[], day: string, size = 40): Track[] {
  const rnd = seeded('mix:' + day);
  const bad = (t: Track) => aff.skipped.has(t.id);
  const familiar = pickWeighted(aff.favorites.filter((t) => !bad(t)), Math.round(size * 0.35), rnd);
  const fresh = ranked.filter((t) => !bad(t));
  const known = fresh.filter((t) => t.artists.some((a) => aff.knownArtists.has(a.name.toLowerCase())));
  const unknown = fresh.filter((t) => t.artists.every((a) => !aff.knownArtists.has(a.name.toLowerCase())));
  const used = new Set(familiar.map((t) => t.id));
  const take = (src: Track[], n: number) => {
    const out: Track[] = [];
    for (const t of pickWeighted(src.filter((x) => !used.has(x.id)), n * 2, rnd)) {
      if (out.length >= n) break;
      used.add(t.id);
      out.push(t);
    }
    return out;
  };
  const known2 = take(known, Math.round(size * 0.4));
  const disc = take(unknown, Math.round(size * 0.25));
  const spill = take(fresh, size); // tops up whichever pool ran short

  // Rhythm: F K F K D, repeated. A pool that runs dry hands its slot to the next one.
  const q = { F: [...familiar], K: [...known2], D: [...disc], S: spill };
  const rhythm: ('F' | 'K' | 'D')[] = ['F', 'K', 'F', 'K', 'D'];
  const out: Track[] = [];
  const lead = (t: Track) => name(t);
  const total = familiar.length + known2.length + disc.length + spill.length;
  for (let i = 0; out.length < size && out.length < total && i < size * 4; i++) {
    const order = [rhythm[i % rhythm.length], 'F', 'K', 'D', 'S'] as ('F' | 'K' | 'D' | 'S')[];
    for (const k of order) {
      const idx = q[k].findIndex((t) => !out.length || lead(t) !== lead(out[out.length - 1]));
      if (idx < 0) continue;
      out.push(q[k].splice(idx, 1)[0]);
      break;
    }
  }
  return out;
}
