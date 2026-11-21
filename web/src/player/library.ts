'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AlbumCard, ArtistCard, PlaylistCard, Track } from '@/lib/types';

export type Play = { track: Track; at: number; playedMs: number; completed: boolean; skipped: boolean };
export type UserPlaylist = { id: string; name: string; tracks: Track[]; createdAt: number; updatedAt: number };

type LibraryState = {
  liked: Record<string, { track: Track; at: number }>;
  history: Play[];
  playlists: UserPlaylist[];
  albums: Record<string, { item: AlbumCard; at: number }>;
  artists: Record<string, { item: ArtistCard; at: number }>;
  savedPlaylists: Record<string, { item: PlaylistCard; at: number }>;
  recentSearches: string[];

  isLiked: (id: string) => boolean;
  toggleLike: (t: Track) => void;
  logPlay: (p: Play) => void;
  createPlaylist: (name: string, tracks?: Track[]) => string;
  addToPlaylist: (playlistId: string, tracks: Track[]) => void;
  removeFromPlaylist: (playlistId: string, index: number) => void;
  renamePlaylist: (playlistId: string, name: string) => void;
  deletePlaylist: (playlistId: string) => void;
  toggleSaved: (i: AlbumCard | ArtistCard | PlaylistCard) => void;
  isSaved: (id: string) => boolean;
  rememberSearch: (q: string) => void;
  clearSearches: () => void;
};

/** Plays kept in the browser. Was 2000, which silently dropped older plays that the phone still counted. */
export const HISTORY_CAP = 8000;

const uid =() => (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16);

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      liked: {},
      history: [],
      playlists: [],
      albums: {},
      artists: {},
      savedPlaylists: {},
      recentSearches: [],

      isLiked: (id) => !!get().liked[id],
      toggleLike: (t) =>
        set((s) => {
          const liked = { ...s.liked };
          if (liked[t.id]) delete liked[t.id];
          else liked[t.id] = { track: t, at: Date.now() };
          return { liked };
        }),
      logPlay: (p) => set((s) => ({ history: [p, ...s.history].slice(0, HISTORY_CAP) })),
      createPlaylist: (name, tracks = []) => {
        const id = uid();
        const now = Date.now();
        set((s) => ({ playlists: [{ id, name: name.trim() || 'New playlist', tracks, createdAt: now, updatedAt: now }, ...s.playlists] }));
        return id;
      },
      addToPlaylist: (playlistId, tracks) =>
        set((s) => ({
          playlists: s.playlists.map((p) =>
            p.id === playlistId
              ? { ...p, tracks: [...p.tracks, ...tracks.filter((t) => !p.tracks.some((x) => x.id === t.id))], updatedAt: Date.now() }
              : p,
          ),
        })),
      removeFromPlaylist: (playlistId, index) =>
        set((s) => ({
          playlists: s.playlists.map((p) => (p.id === playlistId ? { ...p, tracks: p.tracks.filter((_, i) => i !== index), updatedAt: Date.now() } : p)),
        })),
      renamePlaylist: (playlistId, name) =>
        set((s) => ({ playlists: s.playlists.map((p) => (p.id === playlistId ? { ...p, name, updatedAt: Date.now() } : p)) })),
      deletePlaylist: (playlistId) => set((s) => ({ playlists: s.playlists.filter((p) => p.id !== playlistId) })),
      toggleSaved: (i) =>
        set((s) => {
          const key = i.kind === 'album' ? 'albums' : i.kind === 'artist' ? 'artists' : 'savedPlaylists';
          const map = { ...(s[key] as Record<string, unknown>) };
          if (map[i.id]) delete map[i.id];
          else map[i.id] = { item: i, at: Date.now() };
          return { [key]: map } as Partial<LibraryState>;
        }),
      isSaved: (id) => !!(get().albums[id] || get().artists[id] || get().savedPlaylists[id]),
      rememberSearch: (q) =>
        set((s) => ({ recentSearches: [q, ...s.recentSearches.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 12) })),
      clearSearches: () => set({ recentSearches: [] }),
    }),
    { name: 'lomu-library', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);
