import 'server-only';

/* "Connect": the devices signed in to this account, what each one is playing, and a relay for
   remote-control commands (the Spotify Connect idea, for a single-owner server).

   A device is present while it holds an open server-sent-events connection (/api/connect/events);
   it reports its player state with POST /api/connect/state, and any device can send a command to
   another with POST /api/connect/command. Everything is in memory: it is live state, not data. */

export type Json = Record<string, unknown>;

export type RemoteState = {
  track: Json | null;
  playing: boolean;
  position: number; // seconds, at the moment of the report
  duration: number;
  volume: number; // 0..1
  shuffle: boolean;
  repeat: 'off' | 'all' | 'one';
  queueLen: number;
};

export type DeviceInfo = { id: string; name: string; kind: 'web' | 'android' } & Partial<RemoteState> & { stateAge: number | null };

type Send = (event: string, data: unknown) => void;
type Device = {
  id: string;
  name: string;
  kind: 'web' | 'android';
  conns: Set<Send>;
  state: RemoteState | null;
  stateAt: number;
  drop?: ReturnType<typeof setTimeout>;
};

const COMMANDS = new Set([
  'play', 'pause', 'toggle', 'next', 'prev', 'seek', 'volume', 'shuffle', 'repeat', // transport
  'load', // replace the queue: { tracks, index, position, play }
  'radio', // play a song and let radio carry on: { track }
  'enqueue', // add songs to the end: { tracks }
  'handoff', // "send your playback to device `to`"
]);

type G = typeof globalThis & { __lomuConnect?: Map<string, Device> };
const devices: Map<string, Device> = ((globalThis as G).__lomuConnect ??= new Map());

const GRACE_MS = 6000; // a reload reconnects within this and keeps its place in the list

function cleanState(s: Partial<RemoteState> | null | undefined): RemoteState | null {
  if (!s || typeof s !== 'object') return null;
  const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const track = s.track && typeof s.track === 'object' && typeof (s.track as Json).id === 'string' ? (s.track as Json) : null;
  return {
    track,
    playing: !!s.playing && !!track,
    position: Math.max(0, num(s.position)),
    duration: Math.max(0, num(s.duration)),
    volume: Math.min(1, Math.max(0, num(s.volume, 1))),
    shuffle: !!s.shuffle,
    repeat: s.repeat === 'all' || s.repeat === 'one' ? s.repeat : 'off',
    queueLen: Math.max(0, Math.round(num(s.queueLen))),
  };
}

export function snapshot() {
  const now = Date.now();
  const list: DeviceInfo[] = [...devices.values()].map((d) => ({
    id: d.id,
    name: d.name,
    kind: d.kind,
    ...(d.state ?? {}),
    // Progress is extrapolated to "now" so a controller does not have to guess the report's age.
    position: d.state ? d.state.position + (d.state.playing ? (now - d.stateAt) / 1000 : 0) : undefined,
    stateAge: d.state ? now - d.stateAt : null,
  }));
  list.sort((a, b) => a.name.localeCompare(b.name));
  // Active device: whoever is playing, else whoever reported most recently (within ten minutes).
  const playing = [...devices.values()].filter((d) => d.state?.playing).sort((a, b) => b.stateAt - a.stateAt)[0];
  const recent = [...devices.values()].filter((d) => d.state?.track && now - d.stateAt < 10 * 60_000).sort((a, b) => b.stateAt - a.stateAt)[0];
  return { devices: list, active: (playing ?? recent)?.id ?? null, now };
}

function broadcast() {
  const snap = snapshot();
  for (const d of devices.values()) for (const send of d.conns) send('devices', snap);
}

function sendTo(id: string, event: string, data: unknown): boolean {
  const d = devices.get(id);
  if (!d || !d.conns.size) return false;
  for (const send of d.conns) send(event, data);
  return true;
}

/** Registers a live connection; returns the function that removes it. */
export function connect(id: string, name: string, kind: 'web' | 'android', send: Send): () => void {
  let d = devices.get(id);
  if (!d) devices.set(id, (d = { id, name, kind, conns: new Set(), state: null, stateAt: 0 }));
  if (d.drop) clearTimeout(d.drop);
  d.name = name;
  d.kind = kind;
  d.conns.add(send);
  broadcast();
  return () => {
    const cur = devices.get(id);
    if (!cur) return;
    cur.conns.delete(send);
    if (cur.conns.size) return;
    cur.drop = setTimeout(() => {
      if (devices.get(id)?.conns.size === 0) {
        devices.delete(id);
        broadcast();
      }
    }, GRACE_MS);
  };
}

/** A device reports what it is playing. Starting to play pauses every other device. */
export function report(id: string, raw: Partial<RemoteState>): boolean {
  const d = devices.get(id);
  if (!d) return false;
  const was = d.state?.playing ?? false;
  d.state = cleanState(raw);
  d.stateAt = Date.now();
  if (d.state?.playing && !was) {
    for (const o of devices.values()) if (o.id !== id && o.state?.playing) sendTo(o.id, 'command', { from: id, cmd: { type: 'pause', reason: 'other-device' } });
  }
  broadcast();
  return true;
}

export function command(from: string, to: string, cmd: Json): 'ok' | 'offline' | 'invalid' {
  const type = typeof cmd?.type === 'string' ? cmd.type : '';
  if (!COMMANDS.has(type)) return 'invalid';
  if (JSON.stringify(cmd).length > 400_000) return 'invalid';
  return sendTo(to, 'command', { from, cmd }) ? 'ok' : 'offline';
}
