import 'server-only';
import type { Shelf, Track } from '@/lib/types';
import { all } from './sync';
import { radio } from './catalog';
import { cached, readStale } from './yt';
import { affinity, diversify, rankCandidates, type PlayDoc, type LikeDoc } from './recs-core';

/* Server-side recommendations, shared by the web player and the phone. Signals come from the
   synced play log and likes; candidates come from YouTube's own radio for the strongest recent
   seeds; the scoring itself lives in recs-core.ts so it can be unit-tested without a network. */

const SEEDS = 5;
const PER_SEED = 30;

async function candidatesFor(seeds: Track[]): Promise<{ map: Map<string, Track[]>; ok: number }> {
  const map = new Map<string, Track[]>();
  let ok = 0;
  await Promise.all(
    seeds.map(async (s) => {
      try {
        map.set(s.id, (await radio(s.id)).filter((t) => t.id !== s.id).slice(0, PER_SEED));
        ok++;
      } catch {
        map.set(s.id, []);
      }
    }),
  );
  return { map, ok };
}

export function buildMixes(): Promise<Shelf[]> {
  // The play log changes slowly relative to how often the home page is opened.
  return cached('recs:mixes', 3 * 60_000, async () => {
    const plays = all('play', 3000).map((r) => r.value as PlayDoc);
    const likes = all('like', 3000).map((r) => r.value as LikeDoc);
    if (!plays.length && !likes.length) return [];

    const now = Date.now();
    const aff = affinity(plays, likes, now);
    const seeds = aff.topTracks.slice(0, SEEDS);
    const { map: cands, ok } = await candidatesFor(seeds);
    // Nothing reachable (offline): throw, so `cached` serves the last full set instead of a thin one.
    if (!ok && seeds.length && readStale('recs:mixes')) throw new Error('YouTube unreachable');
    const ranked = rankCandidates(seeds, cands, aff);

    const shelves: Shelf[] = [];
    const mix = diversify(ranked, 2).slice(0, 30);
    if (mix.length) shelves.push({ title: 'Your Mix', subtitle: 'Made from what you play and like', items: mix });

    if (aff.onRepeat.length) shelves.push({ title: 'On Repeat', subtitle: 'Your last 30 days', items: aff.onRepeat.slice(0, 15) });

    for (const seed of seeds.slice(0, 3)) {
      const list = diversify(
        (cands.get(seed.id) ?? []).filter((t) => !aff.heavilyPlayed.has(t.id) && !aff.skipped.has(t.id)),
        2,
      ).slice(0, 15);
      if (list.length >= 5) shelves.push({ title: `Because you played ${seed.title}`, items: list });
    }

    const fresh = ranked.filter((t) => t.artists.every((a) => !aff.knownArtists.has(a.name.toLowerCase())));
    const discover = diversify(fresh, 1).slice(0, 20);
    if (discover.length >= 5) shelves.push({ title: 'Discover', subtitle: 'Artists you have not played yet', items: discover });
    return shelves;
  });
}

/** Adaptive autoplay: what should follow `seedId`, skipping things you keep skipping. */
export async function nextUp(seedId: string, recent: string[] = []): Promise<Track[]> {
  const plays = all('play', 3000).map((r) => r.value as PlayDoc);
  const likes = all('like', 3000).map((r) => r.value as LikeDoc);
  const aff = affinity(plays, likes, Date.now());
  const skip = new Set(recent);
  const list = (await radio(seedId)).filter((t) => t.id !== seedId && !skip.has(t.id) && !aff.skipped.has(t.id));
  // Liked artists first, otherwise YouTube's order.
  const score = (t: Track) => t.artists.reduce((m, a) => Math.max(m, aff.artistScore.get(a.name.toLowerCase()) ?? 0), 0);
  return diversify([...list].sort((a, b) => score(b) - score(a)), 3).slice(0, 25);
}
