'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'system' | 'light' | 'dark' | 'blue';

/** Home page sections the owner can switch on and off. */
export const HOME_SECTIONS = [
  { id: 'quick', label: 'Quick picks', hint: 'Your most recent songs, one tap away' },
  { id: 'stats', label: 'Your week', hint: 'Minutes listened, streak, top artist' },
  { id: 'mixes', label: 'Made for you', hint: 'Mixes built from what you play and like' },
  { id: 'artists', label: 'Your artists', hint: 'The artists you play most' },
  { id: 'moods', label: 'Moods', hint: 'Jump into a mood' },
  { id: 'trending', label: 'Trending', hint: 'What is popular right now' },
  { id: 'newReleases', label: 'New releases', hint: 'Fresh albums and singles' },
  { id: 'youtube', label: 'From YouTube Music', hint: 'The rest of the YouTube Music feed' },
] as const;
export type HomeSectionId = (typeof HOME_SECTIONS)[number]['id'];

type Settings = {
  theme: Theme;
  sideMini: boolean;
  home: Record<HomeSectionId, boolean>;
  /** Developer flags: features that are off by default. */
  dev: { explore: boolean; streamInfo: boolean; artistEnrichment: boolean };
  setTheme: (t: Theme) => void;
  setSideMini: (v: boolean) => void;
  setHome: (id: HomeSectionId, v: boolean) => void;
  setDev: (k: keyof Settings['dev'], v: boolean) => void;
};

const defaultHome = Object.fromEntries(HOME_SECTIONS.map((s) => [s.id, s.id !== 'youtube'])) as Record<HomeSectionId, boolean>;

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'system',
      sideMini: false,
      home: defaultHome,
      dev: { explore: true, streamInfo: false, artistEnrichment: true },
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      setSideMini: (sideMini) => set({ sideMini }),
      setHome: (id, v) => set((s) => ({ home: { ...s.home, [id]: v } })),
      setDev: (k, v) => set((s) => ({ dev: { ...s.dev, [k]: v } })),
    }),
    {
      name: 'lomu-settings',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      migrate: (old: unknown) => ({ ...(old as object), sideMini: false, home: defaultHome }) as Settings,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Settings>;
        return { ...current, ...p, home: { ...defaultHome, ...(p.home ?? {}) } };
      },
      onRehydrateStorage: () => (s) => s && applyTheme(s.theme),
    },
  ),
);

export function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}
