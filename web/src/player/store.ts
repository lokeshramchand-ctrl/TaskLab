'use client';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Track } from '@/lib/types';
import { api } from '@/lib/api';
import { artistNames } from '@/lib/format';
import { useLibrary } from './library';
import { warm } from '@/lib/warm';

export type Repeat = 'off' | 'all' | 'one';
type Panel = 'lyrics' | 'queue' | null;

type PlayerState = {
  queue: Track[];
  original: Track[] | null; // pre-shuffle order
  index: number;
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: Repeat;
  autoplay: boolean;
  expanded: boolean;
  panel: Panel;
  error: string | null;
  source: string | null;

  play: (tracks: Track[], start?: number, opts?: { source?: string; shuffle?: boolean }) => void;
  playRadio: (t: Track) => void;
  toggle: () => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  jump: (i: number) => void;
  seek: (s: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  playNext: (t: Track) => void;
  enqueue: (t: Track[]) => void;
  removeAt: (i: number) => void;
  move: (from: number, to: number) => void;
  setExpanded: (v: boolean) => void;
  setPanel: (p: Panel) => void;
};

const shuffled = <T,>(a: T[]) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};

/** While this tab steers another device, "play this" goes there instead (installed by player/connect.ts). */
export const remoteRoute: {
  play?: (tracks: Track[], start: number) => boolean;
  radio?: (t: Track) => boolean;
  enqueue?: (t: Track[]) => boolean;
} = {};

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      original: null,
      index: 0,
      playing: false,
      buffering: false,
      position: 0,
      duration: 0,
      volume: 1,
      muted: false,
      shuffle: false,
      repeat: 'off',
      autoplay: true,
      expanded: false,
      panel: null,
      error: null,
      source: null,

      play: (tracks, start = 0, opts) => {
        if (!tracks.length) return;
        if (remoteRoute.play?.(tracks, start)) return;
        let queue = tracks;
        let index = Math.max(0, Math.min(start, tracks.length - 1));
        const doShuffle = opts?.shuffle ?? false;
        if (doShuffle) {
          const first = tracks[index];
          queue = [first, ...shuffled(tracks.filter((_, i) => i !== index))];
          index = 0;
        }
        set({ queue, index, original: doShuffle ? tracks : null, shuffle: doShuffle, source: opts?.source ?? null, error: null });
        engine.load(queue[index], true);
      },
      playRadio: (t) => {
        if (remoteRoute.radio?.(t)) return;
        set({ queue: [t], index: 0, original: null, shuffle: false, source: `radio:${t.id}`, error: null });
        engine.load(t, true);
        engine.extendWithRadio(t, true);
      },
      toggle: () => {
        const { queue } = get();
        if (!queue.length) return;
        engine.toggle();
      },
      next: (auto = false) => {
        const { queue, index, repeat } = get();
        if (!queue.length) return;
        if (auto && repeat === 'one') {
          engine.restart();
          return;
        }
        if (index < queue.length - 1) {
          set({ index: index + 1 });
          engine.load(queue[index + 1], true);
        } else if (repeat === 'all') {
          set({ index: 0 });
          engine.load(queue[0], true);
        } else if (auto) {
          set({ playing: false });
        }
      },
      prev: () => {
        const { queue, index } = get();
        if (!queue.length) return;
        if (engine.currentTime() > 4 || index === 0) {
          engine.seek(0);
          return;
        }
        set({ index: index - 1 });
        engine.load(queue[index - 1], true);
      },
      jump: (i) => {
        const { queue } = get();
        if (!queue[i]) return;
        set({ index: i });
        engine.load(queue[i], true);
      },
      seek: (s) => engine.seek(s),
      setVolume: (v) => {
        set({ volume: v, muted: v === 0 });
        engine.volume(v, v === 0);
      },
      toggleMute: () => {
        const muted = !get().muted;
        set({ muted });
        engine.volume(get().volume, muted);
      },
      toggleShuffle: () => {
        const { shuffle, queue, index, original } = get();
        const cur = queue[index];
        if (!shuffle) {
          const rest = shuffled(queue.filter((_, i) => i !== index));
          set({ shuffle: true, original: queue, queue: cur ? [cur, ...rest] : rest, index: 0 });
        } else {
          const base = original ?? queue;
          const i = cur ? base.findIndex((t) => t.id === cur.id) : 0;
          set({ shuffle: false, original: null, queue: base, index: Math.max(0, i) });
        }
      },
      cycleRepeat: () => set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
      playNext: (t) => {
        const { queue, index } = get();
        if (!queue.length) return get().play([t]);
        const q = queue.filter((x, i) => i <= index || x.id !== t.id);
        q.splice(index + 1, 0, t);
        set({ queue: q });
      },
      enqueue: (ts) => {
        if (remoteRoute.enqueue?.(ts)) return;
        const { queue } = get();
        if (!queue.length) return get().play(ts);
        const ids = new Set(queue.map((t) => t.id));
        set({ queue: [...queue, ...ts.filter((t) => !ids.has(t.id))] });
      },
      removeAt: (i) => {
        const { queue, index } = get();
        if (i === index) return;
        set({ queue: queue.filter((_, j) => j !== i), index: i < index ? index - 1 : index });
      },
      move: (from, to) => {
        const { queue, index } = get();
        const q = [...queue];
        const [t] = q.splice(from, 1);
        q.splice(to, 0, t);
        let ni = index;
        if (from === index) ni = to;
        else if (from < index && to >= index) ni--;
        else if (from > index && to <= index) ni++;
        set({ queue: q, index: ni });
      },
      setExpanded: (v) => set({ expanded: v }),
      setPanel: (p) => set((s) => ({ panel: s.panel === p ? null : p })),
    }),
    {
      name: 'lomu-player',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        queue: s.queue.slice(0, 500),
        index: s.index,
        position: s.position,
        volume: s.volume,
        muted: s.muted,
        shuffle: s.shuffle,
        repeat: s.repeat,
        autoplay: s.autoplay,
        original: s.original?.slice(0, 500) ?? null,
        source: s.source,
      }),
    },
  ),
);

export const currentTrack = (s: Pick<PlayerState, 'queue' | 'index'>) => s.queue[s.index];

/* ------------------------------------------------------------------ */
/* Audio engine: one <audio> element for the whole app.               */
/* ------------------------------------------------------------------ */

type Session = { track: Track; startedAt: number; listenedMs: number; lastTick: number; logged: boolean };

const engine = (() => {
  let audio: HTMLAudioElement | null = null;
  let codec: 'opus' | 'aac' = 'opus';
  let session: Session | null = null;
  let loadedId: string | null = null;
  let triedAac = false;
  let extending = false;

  const S = () => usePlayer.getState();
  const set = (p: Partial<PlayerState>) => usePlayer.setState(p);

  function el(): HTMLAudioElement {
    if (audio) return audio;
    audio = new Audio();
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    codec = audio.canPlayType('audio/webm; codecs="opus"') ? 'opus' : 'aac';
    const a = audio;
    a.volume = S().muted ? 0 : S().volume;
    a.addEventListener('play', () => set({ playing: true }));
    a.addEventListener('pause', () => set({ playing: false }));
    a.addEventListener('waiting', () => set({ buffering: true }));
    a.addEventListener('playing', () => set({ buffering: false, error: null }));
    a.addEventListener('canplay', () => set({ buffering: false }));
    a.addEventListener('durationchange', () => set({ duration: Number.isFinite(a.duration) ? a.duration : 0 }));
    a.addEventListener('timeupdate', () => {
      set({ position: a.currentTime });
      tick();
      mediaPosition();
      const { queue, index, autoplay } = S();
      if (autoplay && index >= queue.length - 2 && a.currentTime > 10) extendWithRadio(queue[index]);
    });
    a.addEventListener('ended', () => {
      finish(true);
      S().next(true);
    });
    a.addEventListener('error', () => {
      const t = currentTrack(S());
      if (!t) return;
      if (!triedAac && codec === 'opus') {
        triedAac = true;
        a.src = streamUrl(t.id, 'aac');
        a.play().catch(() => {});
        return;
      }
      set({ error: `Couldn't play “${t.title}”`, buffering: false });
      setTimeout(() => {
        if (currentTrack(S())?.id === t.id) S().next(true);
      }, 1800);
    });
    setupMediaSession();
    return a;
  }

  const streamUrl = (id: string, c = codec) => `/api/stream/${id}?codec=${c}`;

  function tick() {
    if (!session || !audio) return;
    const now = performance.now();
    if (!audio.paused) session.listenedMs += Math.min(now - session.lastTick, 1500);
    session.lastTick = now;
  }

  function finish(completed: boolean) {
    if (!session || session.logged) return;
    tick();
    const dur = (session.track.duration ?? audio?.duration ?? 0) * 1000;
    const done = completed || (dur > 0 && session.listenedMs > dur * 0.85);
    if (session.listenedMs > 5000 || done) {
      useLibrary.getState().logPlay({
        track: session.track,
        at: session.startedAt,
        playedMs: Math.round(session.listenedMs),
        completed: done,
        skipped: !done && session.listenedMs < 30_000,
      });
    }
    session.logged = true;
  }

  function load(t: Track | undefined, autoplay: boolean, at = 0) {
    if (!t) return;
    const a = el();
    finish(false);
    triedAac = false;
    loadedId = t.id;
    session = { track: t, startedAt: Date.now(), listenedMs: 0, lastTick: performance.now(), logged: false };
    set({ position: at, duration: t.duration ?? 0, buffering: autoplay, error: null });
    a.src = streamUrl(t.id);
    if (at) a.currentTime = at;
    mediaMetadata(t);
    if (autoplay) a.play().catch(() => set({ playing: false, buffering: false }));
    warmNext();
  }

  function warmNext() {
    const { queue, index } = S();
    // The next two songs, a little after this one starts so it gets the bandwidth first.
    [queue[index + 1], queue[index + 2]].forEach((n, i) => n && setTimeout(() => warm(n.id), 1500 + i * 2500));
  }

  async function extendWithRadio(seed: Track | undefined, immediate = false) {
    if (!seed || extending) return;
    extending = true;
    try {
      const { queue } = S();
      // Adaptive autoplay: the server ranks YouTube's radio by what you like and skip; plain radio is the fallback.
      const radio = await api.nextUp(seed.id, queue.slice(-30).map((t) => t.id)).catch(() => api.radio(seed.id));
      const ids = new Set(queue.map((t) => t.id));
      const recent = new Set(useLibrary.getState().history.slice(0, 40).map((p) => p.track.id));
      const fresh = radio.filter((t) => !ids.has(t.id) && !t.video);
      const preferred = [...fresh.filter((t) => !recent.has(t.id)), ...fresh.filter((t) => recent.has(t.id))].slice(0, 25);
      if (preferred.length) usePlayer.setState({ queue: [...S().queue, ...preferred] });
    } catch {
      /* radio is best-effort */
    } finally {
      setTimeout(() => (extending = false), immediate ? 0 : 15_000);
    }
  }

  function toggle() {
    const a = el();
    const t = currentTrack(S());
    if (!t) return;
    if (loadedId !== t.id) {
      load(t, true, S().position || 0);
      return;
    }
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }

  function mediaMetadata(t: Track) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: artistNames(t.artists),
      album: t.album?.name ?? '',
      artwork: t.thumb ? [{ src: t.thumb, sizes: '544x544', type: 'image/jpeg' }] : [],
    });
  }

  function mediaPosition() {
    if (!audio || !('mediaSession' in navigator) || !Number.isFinite(audio.duration)) return;
    try {
      navigator.mediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: 1 });
    } catch {
      /* ignore */
    }
  }

  function setupMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    ms.setActionHandler('play', () => toggle());
    ms.setActionHandler('pause', () => audio?.pause());
    ms.setActionHandler('nexttrack', () => S().next());
    ms.setActionHandler('previoustrack', () => S().prev());
    ms.setActionHandler('seekto', (d) => d.seekTime != null && seek(d.seekTime));
    ms.setActionHandler('seekbackward', (d) => seek(Math.max(0, (audio?.currentTime ?? 0) - (d.seekOffset ?? 10))));
    ms.setActionHandler('seekforward', (d) => seek((audio?.currentTime ?? 0) + (d.seekOffset ?? 10)));
  }

  function seek(s: number) {
    const a = el();
    const t = currentTrack(S());
    if (t && loadedId !== t.id) {
      load(t, false, s);
      return;
    }
    a.currentTime = Math.max(0, s);
    set({ position: a.currentTime });
  }

  return {
    load,
    toggle,
    seek,
    extendWithRadio,
    restart: () => {
      finish(true);
      const t = currentTrack(S());
      if (t) load(t, true);
    },
    currentTime: () => audio?.currentTime ?? 0,
    volume: (v: number, muted: boolean) => {
      el().volume = muted ? 0 : v;
    },
  };
})();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const s = usePlayer.getState();
    usePlayer.setState({ position: s.position });
  });
}
