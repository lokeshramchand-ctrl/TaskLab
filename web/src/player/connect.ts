'use client';
import { create } from 'zustand';
import { usePlayer, currentTrack, remoteRoute } from './store';
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
  /** The device this tab is steering (null = this tab plays). Sticky until changed, also while that device is paused. */
  target: string | null;
};

export const useConnect = create<ConnectState>(() => ({ self: '', devices: [], active: null, receivedAt: 0, online: false, target: null }));

/** The device being steered, if any. */
export const remoteDevice = (s: Pick<ConnectState, 'devices' | 'target'>): Device | null => (s.target ? s.devices.find((d) => d.id === s.target) ?? null : null);

let suppressLatchUntil = 0;
let executing = false; // true while running a command that was meant for this tab

function latch() {
  const s = useConnect.getState();
  if (s.target || usePlayer.getState().playing || Date.now() < suppressLatchUntil) return;
  const other = s.devices.find((d) => d.id !== s.self && d.playing);
  if (other) useConnect.setState({ target: other.id });
}

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
  // The Windows desktop app is Chromium inside, so it would read "Chrome on Windows": call it what it is.
  if (/Electron\//.test(ua)) return 'Windows';
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
  const { self, active, target } = useConnect.getState();
  if (id === self) {
    suppressLatchUntil = Date.now() + 6000;
    useConnect.setState({ target: null });
    const source = target ?? active;
    if (source && source !== self) sendCommand(source, { type: 'handoff', to: self });
    return;
  }
  // Steer `id` from here; if music plays somewhere else (here or on another device), move it over first.
  useConnect.setState({ target: id });
  const source = active ?? self;
  if (source === id) return;
  if (source === self) {
    if (usePlayer.getState().queue.length) handoffTo(id);
  } else sendCommand(source, { type: 'handoff', to: id });
}

// Song lists, the queue buttons and radio all call the store; while steering another device they go there.
const remoteId = () => (executing ? null : useConnect.getState().target);
remoteRoute.play = (tracks, start) => {
  const to = remoteId();
  if (!to) return false;
  const from = Math.max(0, start - 3);
  sendCommand(to, { type: 'load', tracks: tracks.slice(from, from + 300), index: start - from, position: 0, play: true });
  return true;
};
remoteRoute.radio = (track) => {
  const to = remoteId();
  if (!to) return false;
  sendCommand(to, { type: 'radio', track });
  return true;
};
remoteRoute.playNext = (track) => {
  const to = remoteId();
  if (!to) return false;
  sendCommand(to, { type: 'enqueue', tracks: [track], next: true });
  return true;
};
remoteRoute.enqueue = (tracks) => {
  const to = remoteId();
  if (!to) return false;
  sendCommand(to, { type: 'enqueue', tracks });
  return true;
};

function run(cmd: Record<string, any>, from: string) {
  executing = true;
  try {
    exec(cmd, from);
  } finally {
    executing = false;
  }
}

function exec(cmd: Record<string, any>, from: string) {
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
      useConnect.setState({ target: null }); // music plays here now
      P.play(tracks, Number(cmd.index) || 0, { source: 'remote' });
      if (Number(cmd.position) > 1) usePlayer.getState().seek(Number(cmd.position));
      if (cmd.play === false) setTimeout(() => usePlayer.getState().playing && usePlayer.getState().toggle(), 50);
      break;
    }
    case 'radio':
      useConnect.setState({ target: null });
      if (cmd.track?.id) P.playRadio(cmd.track as Track);
      break;
    case 'enqueue':
      if (Array.isArray(cmd.tracks)) {
        const ts = cmd.tracks as Track[];
        if (cmd.next) [...ts].reverse().forEach((t) => P.playNext(t));
        else P.enqueue(ts);
      }
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
let wasPlaying = false;
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
  // Starting to play here (not merely still playing) ends steering of another device.
  if (s.playing && !wasPlaying && useConnect.getState().target) useConnect.setState({ target: null });
  wasPlaying = s.playing;
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
      const t = useConnect.getState().target;
      useConnect.setState({ devices: d.devices, active: d.active, receivedAt: Date.now(), ...(t && !d.devices.some((x) => x.id === t) ? { target: null } : {}) });
      latch();
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
  useConnect.setState({ devices: [], active: null, online: false, target: null });
}
