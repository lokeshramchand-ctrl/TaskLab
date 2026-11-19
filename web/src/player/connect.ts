'use client';
import { create } from 'zustand';
import { usePlayer, currentTrack } from './store';
import type { Track } from '@/lib/types';
import { toast } from '@/components/Toast';

/* Connect client: shows the devices signed in to this account and lets them control each other.
   This tab reports what it is playing and executes commands sent by other devices (see
   server/connect.ts for the protocol). */

export type Device = {
  id: string;
  name: string;
  kind: 'web' | 'android';
  track?: Track | null;
  playing?: boolean;
  position?: number;
  duration?: number;
  volume?: number;
  shuffle?: boolean;
  repeat?: 'off' | 'all' | 'one';
  queueLen?: number;
};

type ConnectState = {
  self: string;
  devices: Device[];
  active: string | null;
  receivedAt: number; // local clock when `devices` last arrived (to extrapolate progress)
  online: boolean;
};

export const useConnect = create<ConnectState>(() => ({ self: '', devices: [], active: null, receivedAt: 0, online: false }));

function deviceId(): string {
  try {
    let id = sessionStorage.getItem('lomu-device');
    if (!id) {
      id = `web-${crypto.randomUUID()}`;
      sessionStorage.setItem('lomu-device', id);
    }
    return id;
  } catch {
    return `web-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

function deviceName(): string {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return `${browser}${os ? ` on ${os}` : ''}`;
}

const post = (path: string, body: unknown) =>
  fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export async function sendCommand(to: string, cmd: Record<string, unknown>): Promise<boolean> {
  try {
    const r = await post('/api/connect/command', { from: useConnect.getState().self, to, cmd });
    if (!r.ok) toast(r.status === 404 ? 'That device is offline' : 'Could not reach that device');
    return r.ok;
  } catch {
    toast('Could not reach that device');
    return false;
  }
}

/** Sends this tab's queue to `to` and pauses here. */
function handoffTo(to: string) {
  const P = usePlayer.getState();
  const from = Math.max(0, P.index - 3);
  const tracks = P.queue.slice(from, from + 300);
  if (!tracks.length) return;
  sendCommand(to, { type: 'load', tracks, index: P.index - from, position: P.position, play: true }).then((ok) => {
    if (ok && P.playing) usePlayer.getState().toggle();
  });
}

/** Spotify-style "play on this device": move playback from wherever it is to `id`. */
export function transferTo(id: string) {
  const { self, active } = useConnect.getState();
  if (id === active) return;
  const source = active ?? self;
  if (source === id) return;
  if (source === self) handoffTo(id);
  else sendCommand(source, { type: 'handoff', to: id });
}

function run(cmd: Record<string, any>, from: string) {
  const P = usePlayer.getState();
  switch (cmd.type) {
    case 'play':
      if (!P.playing) P.toggle();
      break;
    case 'pause':
      if (P.playing) P.toggle();
      break;
    case 'toggle':
      P.toggle();
      break;
    case 'next':
      P.next();
      break;
    case 'prev':
      P.prev();
      break;
    case 'seek':
      if (typeof cmd.position === 'number') P.seek(cmd.position);
      break;
    case 'volume':
      if (typeof cmd.volume === 'number') P.setVolume(Math.min(1, Math.max(0, cmd.volume)));
      break;
    case 'shuffle':
      if (typeof cmd.on !== 'boolean' || cmd.on !== P.shuffle) P.toggleShuffle();
      break;
    case 'repeat':
      for (let i = 0; i < 3 && typeof cmd.mode === 'string' && usePlayer.getState().repeat !== cmd.mode; i++) usePlayer.getState().cycleRepeat();
      if (typeof cmd.mode !== 'string') P.cycleRepeat();
      break;
    case 'load': {
      const tracks = Array.isArray(cmd.tracks) ? (cmd.tracks as Track[]).filter((t) => t && typeof t.id === 'string') : [];
      if (!tracks.length) break;
      P.play(tracks, Number(cmd.index) || 0, { source: 'remote' });
      if (Number(cmd.position) > 1) usePlayer.getState().seek(Number(cmd.position));
      if (cmd.play === false) setTimeout(() => usePlayer.getState().playing && usePlayer.getState().toggle(), 50);
      break;
    }
    case 'radio':
      if (cmd.track?.id) P.playRadio(cmd.track as Track);
      break;
    case 'enqueue':
      if (Array.isArray(cmd.tracks)) P.enqueue(cmd.tracks as Track[]);
      break;
    case 'handoff':
      if (typeof cmd.to === 'string' && cmd.to !== useConnect.getState().self) handoffTo(cmd.to);
      break;
  }
  void from;
}

// ---------------------------------------------------------------- engine

let events: EventSource | null = null;
let unsub: (() => void) | null = null;
let beat: ReturnType<typeof setInterval> | null = null;
let debounce: ReturnType<typeof setTimeout> | null = null;
let retry: ReturnType<typeof setTimeout> | null = null;
let running = false;
let lastKey = '';
let lastPos = { at: 0, pos: 0 };

function stateBody() {
  const s = usePlayer.getState();
  const track = currentTrack(s) ?? null;
  return {
    track,
    playing: s.playing && !!track,
    position: s.position,
    duration: s.duration || track?.duration || 0,
    volume: s.muted ? 0 : s.volume,
    shuffle: s.shuffle,
    repeat: s.repeat,
    queueLen: s.queue.length,
  };
}

function report() {
  const id = useConnect.getState().self;
  if (!id || !useConnect.getState().online) return;
  const body = stateBody();
  lastPos = { at: Date.now(), pos: body.position };
  post('/api/connect/state', { id, state: body }).catch(() => {});
}

function onPlayerChange() {
  const s = usePlayer.getState();
  const t = currentTrack(s);
  const key = [t?.id, s.playing, s.shuffle, s.repeat, s.volume, s.muted, s.queue.length].join('|');
  // A jump in position that playback alone cannot explain is a seek: tell the others.
  const jumped = Math.abs(s.position - (lastPos.pos + (s.playing ? (Date.now() - lastPos.at) / 1000 : 0))) > 2.5;
  if (key === lastKey && !jumped) return;
  lastKey = key;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(report, 150);
}

export function startConnect() {
  if (running || typeof window === 'undefined') return;
  running = true;
  const self = deviceId();
  useConnect.setState({ self });

  const open = () => {
    const q = new URLSearchParams({ id: self, name: deviceName(), kind: 'web' });
    events = new EventSource(`/api/connect/events?${q}`);
    events.onopen = () => {
      useConnect.setState({ online: true });
      lastKey = '';
      report();
    };
    events.addEventListener('devices', (e) => {
      const d = JSON.parse((e as MessageEvent).data) as { devices: Device[]; active: string | null };
      useConnect.setState({ devices: d.devices, active: d.active, receivedAt: Date.now() });
    });
    events.addEventListener('command', (e) => {
      const { from, cmd } = JSON.parse((e as MessageEvent).data) as { from: string; cmd: Record<string, unknown> };
      try {
        run(cmd, from);
      } catch {
        /* a bad command must not break the stream */
      }
    });
    events.onerror = () => {
      events?.close();
      useConnect.setState({ online: false });
      if (running) retry = setTimeout(open, 4000);
    };
  };
  open();
  unsub = usePlayer.subscribe(onPlayerChange);
  beat = setInterval(() => usePlayer.getState().playing && report(), 5000);
}

export function stopConnect() {
  running = false;
  unsub?.();
  events?.close();
  if (beat) clearInterval(beat);
  if (debounce) clearTimeout(debounce);
  if (retry) clearTimeout(retry);
  useConnect.setState({ devices: [], active: null, online: false });
}
