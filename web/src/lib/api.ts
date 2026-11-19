'use client';
import { useQuery } from '@tanstack/react-query';
import { api as authFetch } from '@/player/sync';
import type { AlbumData, ArtistData, ExploreData, HomeData, Item, LyricsData, PlaylistData, SearchData, Shelf, Track } from './types';

async function get<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return res.json();
}

const enc = encodeURIComponent;
export const api = {
  home: () => get<HomeData>('/api/home'),
  recs: () => get<Shelf[]>('/api/recs'),
  explore: () => get<ExploreData>('/api/explore'),
  mood: (browseId: string, params: string) => get<Shelf[]>(`/api/mood?browseId=${enc(browseId)}&params=${enc(params)}`),
  search: (q: string) => get<SearchData>(`/api/search?q=${enc(q)}`),
  suggest: (q: string) => get<{ queries: string[]; items: Item[] }>(`/api/suggest?q=${enc(q)}`),
  album: (id: string) => get<AlbumData>(`/api/album/${enc(id)}`),
  artist: (id: string, enrich = true) => get<ArtistData>(`/api/artist/${enc(id)}?enrich=${enrich ? 1 : 0}`),
  playlist: (id: string) => get<PlaylistData>(`/api/playlist/${enc(id)}`),
  nextUp: (id: string, recent: string[]) => get<Track[]>(`/api/recs/next?seed=${enc(id)}&recent=${enc(recent.join(','))}`),
  radio: (id: string) => get<Track[]>(`/api/radio/${enc(id)}`),
  track: (id: string) => get<Track | null>(`/api/track/${enc(id)}`),
  related: (id: string) => get<Shelf[]>(`/api/related/${enc(id)}`),
  lyrics: (t: Track) =>
    get<LyricsData>(
      `/api/lyrics/${enc(t.id)}?title=${enc(t.title)}&artist=${enc(t.artists[0]?.name ?? '')}&album=${enc(t.album?.name ?? '')}&duration=${t.duration ?? ''}`,
    ),
};

const long = { staleTime: 10 * 60_000 };
export const useRecs = () => useQuery({ queryKey: ['recs'], queryFn: api.recs, staleTime: 3 * 60_000 });
export const useHome = () => useQuery({ queryKey: ['home'], queryFn: api.home, ...long });
export const useExplore = () => useQuery({ queryKey: ['explore'], queryFn: api.explore, ...long });
export const useMood = (b: string, p: string) => useQuery({ queryKey: ['mood', p], queryFn: () => api.mood(b, p), enabled: !!p, ...long });
export const useSearch = (q: string) => useQuery({ queryKey: ['search', q], queryFn: () => api.search(q), enabled: q.trim().length > 0, ...long });
export const useSuggest = (q: string) => useQuery({ queryKey: ['suggest', q], queryFn: () => api.suggest(q), enabled: q.trim().length > 1, staleTime: 60_000 });
export const useAlbum = (id: string) => useQuery({ queryKey: ['album', id], queryFn: () => api.album(id), ...long });
export const useArtist = (id: string, enrich = true) => useQuery({ queryKey: ['artist', id, enrich], queryFn: () => api.artist(id, enrich), ...long });
export const usePlaylist = (id: string) => useQuery({ queryKey: ['playlist', id], queryFn: () => api.playlist(id), ...long });
export const useLyrics = (t: Track | undefined) =>
  useQuery({ queryKey: ['lyrics', t?.id], queryFn: () => api.lyrics(t!), enabled: !!t, staleTime: Infinity });
