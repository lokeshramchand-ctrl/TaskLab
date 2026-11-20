'use client';
import { create } from 'zustand';
import { usePlayer } from './store';
import type { Track } from '@/lib/types';

/* Queue sync: one document ("queue" / "current") holding what the most recently active device was playing.
   Other devices never apply it by themselves (that would cut off what is playing); they offer
   "Continue listening" and the user takes it over. Same shape as the Android client (sync/SyncClient.kt). */

export type RemoteQueue = { device: string; tracks: Track[]; index: number; positionMs: number; at: number };
type QueueValue = { tracks?: Track[]; index?: number; positionMs?: number; at?: number; dev?: string; device?: string };
type RowLike = { kind: string; key: string; value: unknown | null; deleted?: boolean };
type Doc = { kind: string; key: string; value: unknown | null; updated: number; deleted?: boolean };

export const useRemoteQueue = create<{ q: RemoteQueue | null }>(() => ({ q: null }));

const ID_KEY = 'lomu-device';
const AT_KEY = 'lomu-queue-at'; // when this browser last published its own queue
const SEEN_KEY = 'lomu-queue-seen'; // newest remote queue already taken over or dismissed
const WINDOW = 100;

const num = (k: string) => Number(localStorage.getItem(k) ?? 0) || 0;

export function deviceId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 16);
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

/** Called with every batch of documents pulled from the server. */
export function noteQueueRows(rows: RowLike[]) {
  for (const r of rows) {
    if (r.kind !== 'queue' || r.key !== 'current') continue;
    const v = r.value as QueueValue | null;
    if (r.deleted || !v) {
      useRemoteQueue.setState({ q: null });
      continue;
    }
    if (v.dev === deviceId() || !Array.isArray(v.tracks) || !v.tracks.length) continue;
    const at = Number(v.at) || 0;
    if (at <= Math.max(num(AT_KEY), num(SEEN_KEY))) continue; // ours, or already handled, is newer
    const index = Math.max(0, Math.min(Number(v.index) || 0, v.tracks.length - 1));
    useRemoteQueue.setState({ q: { device: v.device ?? 'another device', tracks: v.tracks, index, positionMs: Number(v.positionMs) || 0, at } });
  }
}

export function dismissRemote() {
  const q = useRemoteQueue.getState().q;
  if (q) localStorage.setItem(SEEN_KEY, String(q.at));
  useRemoteQueue.setState({ q: null });
}

export function resumeRemote() {
  const q = useRemoteQueue.getState().q;
  if (!q) return;
  dismissRemote();
  const p = usePlayer.getState();
  p.play(q.tracks, q.index);
  if (q.positionMs > 2000) setTimeout(() => usePlayer.getState().seek(q.positionMs / 1000), 400);
}

const sigOf = (s: { queue: Track[]; index: number }) => `${s.index}:${s.queue.map((t) => t.id).join(',')}`;

/** Publishes this browser's queue (via [post]) when it changes, and every 30 s while playing. Returns a stop function. */
export function startQueueSync(post: (doc: Doc) => Promise<void>): () => void {
  // The queue restored at page load is not fresh activity: only changes after this point are published.
  let sig = sigOf(usePlayer.getState());
  let lastPost = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const s = usePlayer.getState();
    if (!s.queue.length) return;
    const now = Date.now();
    const next = sigOf(s);
    if (next === sig && (!s.playing || now - lastPost < 30_000)) return;
    const from = s.queue.length <= WINDOW ? 0 : Math.max(0, Math.min(s.index - 10, s.queue.length - WINDOW));
    const value: QueueValue = {
      tracks: s.queue.slice(from, from + WINDOW),
      index: s.index - from,
      positionMs: Math.round(s.position * 1000),
      at: now,
      dev: deviceId(),
      device: 'web',
    };
    const prev = sig;
    sig = next;
    lastPost = now;
    localStorage.setItem(AT_KEY, String(now));
    post({ kind: 'queue', key: 'current', value, updated: now }).catch(() => {
      sig = prev; // server away: try again on the next change
    });
  };

  const unsub = usePlayer.subscribe(() => {
    if (!timer) timer = setTimeout(flush, 5000);
  });
  return () => {
    unsub();
    if (timer) clearTimeout(timer);
  };
}
