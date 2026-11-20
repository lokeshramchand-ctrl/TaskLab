import 'server-only';
import { cached, yt } from './yt';
import { bestThumb, compact, toItem, toShelf, toTrack, txt } from './map';
import { enrichArtist } from './enrich';
import type {
  AlbumCard, AlbumData, ArtistCard, ArtistData, ExploreData, HomeData, Item, LyricsData,
  PlaylistCard, PlaylistData, SearchData, Shelf, Track,
} from '@/lib/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const MIN = 60_000;

export function home(): Promise<HomeData> {
  return cached('home', 20 * MIN, async () => {
    const client = await yt();
    const [feed, explore] = await Promise.all([
      client.music.getHomeFeed().catch(() => null),
      exploreRaw().catch(() => null),
    ]);
    if (!feed && !explore) throw new Error('YouTube unreachable'); // lets `cached` serve the last good page
    const shelves: Shelf[] = compact((feed?.sections ?? []).map(toShelf));
    // Anonymous home feeds are thin; fill with explore shelves (new releases, trending, videos).
    for (const s of compact((explore?.sections ?? []).map(toShelf))) {
      if (!shelves.some((x) => x.title === s.title)) shelves.push(s);
    }
    return { shelves };
  });
}

function exploreRaw() {
  return cached('explore-raw', 30 * MIN, async () => (await yt()).music.getExplore());
}

export function explore(): Promise<ExploreData> {
  return cached('explore', 30 * MIN, async () => {
    const ex: any = await exploreRaw();
    const sections: any[] = ex.sections ?? [];
    const byTitle = (re: RegExp) => sections.find((s) => re.test(txt(s.header?.title)));
    const trending = compact<Track>(((byTitle(/trending/i)?.contents ?? []) as any[]).map((n) => toTrack(n)));
    const newReleases = compact<Item>((byTitle(/new albums|new releases/i)?.contents ?? []).map(toItem)).filter(
      (i): i is AlbumCard => i.kind === 'album',
    );
    const moods = ((byTitle(/moods/i)?.contents ?? []) as any[])
      .map((b) => ({
        title: txt(b.button_text),
        browseId: b.endpoint?.payload?.browseId ?? '',
        params: b.endpoint?.payload?.params ?? '',
        color: typeof b.color === 'number' ? '#' + (b.color & 0xffffff).toString(16).padStart(6, '0') : undefined,
      }))
      .filter((m) => m.title && m.params);
    const shelves = compact(sections.map(toShelf)).filter((s) => !/moods|episodes|podcast/i.test(s.title));
    return { trending, newReleases, moods, shelves };
  });
}

export function moodPlaylists(browseId: string, params: string): Promise<Shelf[]> {
  return cached(`mood:${params}`, 60 * MIN, async () => {
    const client = await yt();
    const res: any = await client.actions.execute('/browse', { browseId, params, client: 'YTMUSIC', parse: true });
    const out: Shelf[] = [];
    const walk = (node: any) => {
      if (!node || typeof node !== 'object') return;
      if ((node.type === 'MusicCarouselShelf' || node.type === 'Grid' || node.type === 'GridRenderer') && node.contents) {
        const title = txt(node.header?.title) || 'Playlists';
        const items = compact<Item>((node.contents ?? node.items ?? []).map(toItem));
        if (items.length) out.push({ title, items });
        return;
      }
      for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v);
    };
    walk(res?.contents);
    return out;
  });
}

export async function search(q: string): Promise<SearchData> {
  const query = q.trim().slice(0, 200);
  if (!query) return { songs: [], albums: [], artists: [], playlists: [], videos: [] };
  return cached(`search:${query.toLowerCase()}`, 10 * MIN, async () => {
    const res: any = await (await yt()).music.search(query);
    const items: Item[] = [];
    let top: Item | undefined;
    for (const sec of res.contents ?? []) {
      if (sec.type === 'MusicCardShelf') {
        top = toItem(sec.title?.endpoint ? { ...sec, item_type: guessCardKind(sec) } : sec) ?? undefined;
        for (const c of sec.contents ?? []) {
          const it = toItem(c);
          if (it) items.push(it);
        }
        continue;
      }
      for (const c of sec.contents ?? []) {
        const it = toItem(c);
        if (it) items.push(it);
      }
    }
    const songs = items.filter((i): i is Track => i.kind === 'song' && !i.video);
    const videos = items.filter((i): i is Track => i.kind === 'song' && !!i.video);
    const result: SearchData = {
      top: top ?? songs[0] ?? items[0],
      songs: uniq(songs),
      videos: uniq(videos),
      albums: uniq(items.filter((i): i is AlbumCard => i.kind === 'album')),
      artists: uniq(items.filter((i): i is ArtistCard => i.kind === 'artist')),
      playlists: uniq(items.filter((i): i is PlaylistCard => i.kind === 'playlist')),
    };
    return result;
  });
}

function guessCardKind(card: any): string {
  const page = card.title?.endpoint?.payload?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType ?? '';
  if (/ARTIST/.test(page)) return 'artist';
  if (/ALBUM/.test(page)) return 'album';
  if (/PLAYLIST/.test(page)) return 'playlist';
  return card.title?.endpoint?.payload?.videoId ? 'song' : '';
}

const uniq = <T extends { id: string }>(a: T[]) => {
  const seen = new Set<string>();
  return a.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
};

export async function suggestions(q: string): Promise<{ queries: string[]; items: Item[] }> {
  const query = q.trim().slice(0, 100);
  if (!query) return { queries: [], items: [] };
  return cached(`sugg:${query.toLowerCase()}`, 10 * MIN, async () => {
    const sections: any[] = await (await yt()).music.getSearchSuggestions(query);
    const queries: string[] = [];
    const items: Item[] = [];
    for (const s of sections ?? []) {
      for (const c of s.contents ?? []) {
        if (c.type === 'SearchSuggestion' || c.type === 'HistorySuggestion') {
          const t = txt(c.suggestion);
          if (t) queries.push(t);
        } else {
          const it = toItem(c);
          if (it) items.push(it);
        }
      }
    }
    return { queries: queries.slice(0, 8), items: items.slice(0, 5) };
  });
}

export function album(id: string): Promise<AlbumData> {
  return cached(`album:${id}`, 6 * 60 * MIN, async () => {
    const al: any = await (await yt()).music.getAlbum(id);
    const h = al.header ?? {};
    const artists = compact<{ id?: string; name: string }>(
      (h.strapline_text_one?.runs ?? []).map((r: any) =>
        r?.text && r.text.trim() !== '&' && r.text.trim() !== ',' ? { id: r.endpoint?.payload?.browseId, name: txt(r.text) } : null,
      ),
    );
    const thumb = bestThumb(h, 800);
    const title = txt(h.title);
    const year = txt(h.subtitle).match(/\b(19|20)\d{2}\b/)?.[0];
    const fallback = { artists, album: { id, name: title }, thumb };
    const tracks = compact<Track>((al.contents ?? []).map((n: any) => toTrack(n, fallback))).map((t) => ({
      ...t,
      // YouTube reports a missing artist as the text "N/A"; fall back to the album's artists.
      artists: t.artists.filter((a) => a.name && a.name !== 'N/A').length ? t.artists.filter((a) => a.name && a.name !== 'N/A') : artists,
      album: { id, name: title },
      thumb,
      video: false,
    }));
    const playlistId = String(al.url ?? '').match(/list=([\w-]+)/)?.[1];
    return {
      id,
      title,
      artists,
      year,
      thumb,
      playlistId,
      description: txt(h.description?.description ?? h.description) || undefined,
      tracks,
      duration: txt(h.second_subtitle) || undefined,
      more: compact((al.sections ?? []).map(toShelf)),
    };
  });
}

export async function artist(id: string, enrich = true): Promise<ArtistData> {
  const base = await artistBase(id);
  if (!enrich || !base.name) return base;
  const extra = await enrichArtist(base.name, !base.description);
  return {
    ...base,
    image: extra.image,
    banner: extra.banner,
    genre: extra.genre,
    origin: extra.origin,
    since: extra.since,
    description: base.description ?? extra.bio,
    bioSource: base.description ? 'YouTube Music' : extra.bioSource,
  };
}

function artistBase(id: string): Promise<ArtistData> {
  return cached(`artist:${id}`, 3 * 60 * MIN, async () => {
    const ar: any = await (await yt()).music.getArtist(id);
    const h = ar.header ?? {};
    const sections: any[] = ar.sections ?? [];
    const top = sections.find((s) => s.type === 'MusicShelf');
    return {
      id,
      name: txt(h.title),
      thumb: bestThumb(h, 1200),
      description: txt(h.description) || undefined,
      subscribers: txt(h.subscription_button?.subscriber_count_text) || undefined,
      topSongs: compact<Track>((top?.contents ?? []).map((n: any) => toTrack(n))),
      shelves: compact(sections.filter((s) => s !== top).map(toShelf)),
    };
  });
}

export function playlist(id: string): Promise<PlaylistData> {
  return cached(`playlist:${id}`, 30 * MIN, async () => {
    const client = await yt();
    let pl: any = await client.music.getPlaylist(id);
    const h = pl.header ?? {};
    const tracks: Track[] = compact<Track>((pl.items ?? []).map((n: any) => toTrack(n)));
    // Pull continuations so whole playlists play/import, capped to keep latency sane.
    for (let i = 0; i < 20 && pl.has_continuation; i++) {
      try {
        pl = await pl.getContinuation();
        tracks.push(...compact<Track>((pl.items ?? pl.contents ?? []).map((n: any) => toTrack(n))));
      } catch {
        break;
      }
    }
    return {
      id,
      title: txt(h.title),
      author: [txt(h.strapline_text_one), txt(h.subtitle).replace(/^Playlist\s*•\s*/, '')].find((x) => x && x !== 'N/A' && !/^\d{4}$/.test(x)) || undefined,
      thumb: bestThumb(h, 800),
      description: txt(h.description?.description ?? h.description) || undefined,
      trackCount: txt(h.second_subtitle) || undefined,
      tracks,
    };
  });
}

/** YouTube's own radio for a seed song (the strongest "similar songs" signal YouTube offers). */
export function radio(videoId: string): Promise<Track[]> {
  return cached(`radio:${videoId}`, 60 * MIN, async () => {
    const panel: any = await (await yt()).music.getUpNext(videoId, true);
    return compact<Track>((panel.contents ?? []).map((n: any) => toTrack(n)));
  });
}

export function related(videoId: string): Promise<Shelf[]> {
  return cached(`related:${videoId}`, 60 * MIN, async () => {
    const res: any = await (await yt()).music.getRelated(videoId);
    return compact(((res?.contents ?? []) as any[]).map(toShelf));
  });
}

/** Synced lyrics from LRCLIB when available, YouTube's plain lyrics otherwise. */
export function lyrics(t: { id: string; title: string; artist: string; album?: string; duration?: number }): Promise<LyricsData> {
  return cached(`lyrics:${t.id}`, 24 * 60 * MIN, async () => {
    const lrc = await lrclib(t).catch(() => null);
    if (lrc) return lrc;
    const shelf: any = await (await yt()).music.getLyrics(t.id).catch(() => null);
    const text = txt(shelf?.description);
    if (!text) return null;
    return {
      synced: false,
      source: txt(shelf?.footer).replace(/^Source:\s*/, '') || 'YouTube Music',
      lines: text.split('\n').map((l) => ({ t: -1, text: l })),
    };
  });
}

async function lrclib(t: { title: string; artist: string; album?: string; duration?: number }): Promise<LyricsData> {
  const headers = { 'user-agent': 'LoMu/1.0 (personal music player)' };
  const title = t.title.replace(/\s*[([](feat|ft|with)\.?[^)\]]*[)\]]/gi, '').trim();
  const q = new URLSearchParams({ track_name: title, artist_name: t.artist });
  if (t.album) q.set('album_name', t.album);
  if (t.duration) q.set('duration', String(Math.round(t.duration)));
  let res = await fetch(`https://lrclib.net/api/get?${q}`, { headers, signal: AbortSignal.timeout(6000) });
  let body: any = res.ok ? await res.json() : null;
  if (!body?.syncedLyrics) {
    res = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: title, artist_name: t.artist })}`, {
      headers,
      signal: AbortSignal.timeout(6000),
    });
    const list: any[] = res.ok ? await res.json() : [];
    body =
      list.find((x) => x.syncedLyrics && (!t.duration || Math.abs((x.duration ?? 0) - t.duration) < 4)) ??
      list.find((x) => x.syncedLyrics) ??
      body;
  }
  if (body?.syncedLyrics) {
    const lines = String(body.syncedLyrics)
      .split('\n')
      .flatMap((line) => {
        const m = line.match(/^\[(\d+):(\d+(?:\.\d+)?)\](.*)$/);
        return m ? [{ t: Math.round((Number(m[1]) * 60 + Number(m[2])) * 1000), text: m[3].trim() }] : [];
      });
    if (lines.length) return { synced: true, source: 'LRCLIB', lines };
  }
  if (body?.plainLyrics) {
    return { synced: false, source: 'LRCLIB', lines: String(body.plainLyrics).split('\n').map((l) => ({ t: -1, text: l })) };
  }
  return null;
}

export type ImportRef = { id?: string; title?: string; artist?: string };

/** Resolves Google Takeout rows (a video id, or a title and artist) into playable tracks. */
export async function resolveImport(refs: ImportRef[]): Promise<(Track | null)[]> {
  const client = await yt();
  const one = async (r: ImportRef): Promise<Track | null> => {
    try {
      if (r.title) {
        const q = [r.title, r.artist].filter(Boolean).join(' ');
        const hit = (await search(q)).songs[0];
        if (hit) return hit;
      }
      if (r.id && /^[\w-]{11}$/.test(r.id)) {
        const info: any = await client.getBasicInfo(r.id);
        const b = info.basic_info ?? {};
        if (!b.title) return null;
        const name = String(b.author ?? '').replace(/ - Topic$/, '');
        const thumbs: any[] = b.thumbnail ?? [];
        return {
          kind: 'song',
          id: r.id,
          title: String(b.title),
          artists: name ? [{ name }] : [],
          duration: typeof b.duration === 'number' ? b.duration : undefined,
          thumb: thumbs[thumbs.length - 1]?.url,
          video: true,
        };
      }
    } catch {
      /* unresolved rows are reported as null */
    }
    return null;
  };
  const out: (Track | null)[] = new Array(refs.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (next < refs.length) {
        const i = next++;
        out[i] = await one(refs[i]);
      }
    }),
  );
  return out;
}
