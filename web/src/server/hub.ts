import 'server-only';
import { getSetting, setSetting } from './db';
import { applyRemote, currentSeq, onChange, pull, type Row } from './sync';

/* Hub sync, used by the Windows desktop app. The desktop app runs a full LoMu server of its own (its own
   SQLite file, its own YouTube access), so it works with no network at all. This worker mirrors that local
   document log with a "hub" LoMu server (the homelab / Coolify one) using the same /api/sync protocol the phone
   uses: pull what the hub has newer, push what happened here. Everything is queued in the local database, so
   a power cut or an outage at the hub only delays the sync; nothing is lost and nothing needs retrying by hand. */

export type HubStatus = {
  local: boolean;
  url: string | null;
  user: string | null;
  state: 'off' | 'syncing' | 'online' | 'offline' | 'error';
  lastSync: number | null;
  pending: number; // local changes not yet at the hub
  error: string | null;
};

type Runtime = {
  state: HubStatus['state'];
  lastSync: number | null;
  error: string | null;
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  failures: number;
  started: boolean;
  refreshing: Promise<boolean> | null;
};
type G = typeof globalThis & { __lomuHub?: Runtime };
const rt: Runtime = ((globalThis as G).__lomuHub ??= {
  state: 'off', lastSync: null, error: null, timer: null, running: false, failures: 0, started: false, refreshing: null,
});

const num = (k: string) => Number(getSetting(k) ?? 0) || 0;
const POLL = 20_000;
const MAX_BACKOFF = 5 * 60_000;

export function hubStatus(): HubStatus {
  const url = getSetting('hub_url') || null;
  return {
    local: !!process.env.LOMU_LOCAL_TOKEN,
    url,
    user: getSetting('hub_user') || null,
    state: url ? rt.state : 'off',
    lastSync: rt.lastSync,
    pending: url ? Math.max(0, currentSeq() - num('hub_pushed')) : 0,
    error: rt.error,
  };
}

const base = () => (getSetting('hub_url') ?? '').replace(/\/+$/, '');

async function hubFetch(path: string, init: RequestInit = {}, auth = true, timeoutMs: number | null = 25_000): Promise<Response> {
  const go = () =>
    fetch(base() + path, {
      ...init,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        'x-lomu-device': 'desktop',
        ...(auth && getSetting('hub_access') ? { authorization: `Bearer ${getSetting('hub_access')}` } : {}),
      },
      signal: init.signal ?? (timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined),
    });
  let r = await go();
  if (r.status === 401 && auth && (await refreshTokens())) r = await go();
  return r;
}

/**
 * Connect (the devices list and remote control) lives on the hub, because that is where the phone connects. The desktop
 * app runs a server of its own, so without this it would register on a server nobody else can see: the phone would never list
 * the PC, and could not control it. When a hub is set up, the local /api/connect/* routes hand their requests to the hub
 * instead, as this PC's own signed-in session. Returns null when there is no hub or it cannot be reached, and the caller then
 * falls back to the local relay (so the app still works on its own).
 */
export async function hubConnect(path: string, init: RequestInit = {}, stream = false): Promise<Response | null> {
  if (!process.env.LOMU_LOCAL_TOKEN || !getSetting('hub_url') || rt.state === 'error') return null;
  try {
    const r = await hubFetch('/api/connect/' + path, init, true, stream ? null : 10_000);
    return r.ok || r.status === 404 || r.status === 409 || r.status === 400 ? r : null;
  } catch {
    return null;
  }
}

/** One refresh at a time: the hub rotates refresh tokens, so two parallel refreshes would invalidate each other. */
function refreshTokens(): Promise<boolean> {
  rt.refreshing ??= (async () => {
    try {
      const refresh = getSetting('hub_refresh');
      if (!refresh) return false;
      const r = await fetch(base() + '/api/auth/refresh', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-lomu-device': 'desktop' },
        body: JSON.stringify({ refresh }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) return false;
      const t = (await r.json()) as { access: string; refresh: string };
      setSetting('hub_access', t.access);
      setSetting('hub_refresh', t.refresh);
      return true;
    } catch {
      return false;
    } finally {
      rt.refreshing = null;
    }
  })();
  return rt.refreshing;
}

/** Signs in to the hub and starts syncing. Throws a message fit for the UI. */
export async function connectHub(url: string, username: string, password: string): Promise<void> {
  const u = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(u)) throw new Error('Start the address with https://');
  let r: Response;
  try {
    r = await fetch(u + '/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-lomu-device': 'desktop' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    console.error('[hub] could not reach', u, (e as { cause?: unknown }).cause ?? e);
    throw new Error("Can't reach that server. Check the address and your internet connection.");
  }
  const j = (await r.json().catch(() => ({}))) as { access?: string; refresh?: string; error?: string };
  if (!r.ok || !j.access || !j.refresh) throw new Error(j.error ?? `The server answered ${r.status}. Is this the LoMu address?`);
  setSetting('hub_url', u);
  setSetting('hub_user', username.trim());
  setSetting('hub_access', j.access);
  setSetting('hub_refresh', j.refresh);
  setSetting('hub_seq', '0'); // first sync pulls everything the hub has...
  setSetting('hub_pushed', '0'); // ...and offers everything this PC has
  rt.error = null;
  rt.failures = 0;
  rt.state = 'syncing';
  kick(0);
}

/** Sync right now (the app calls this when the network comes back or the PC wakes up). */
export function syncNow() {
  if (getSetting('hub_url') && !rt.running) kick(0);
}

export function disconnectHub() {
  for (const k of ['hub_url', 'hub_user', 'hub_access', 'hub_refresh', 'hub_seq', 'hub_pushed']) setSetting(k, '');
  if (rt.timer) clearTimeout(rt.timer);
  rt.timer = null;
  rt.state = 'off';
  rt.error = null;
}

/** One full round: pull what the hub has, then push what is new here. Never throws. */
export async function syncHub(): Promise<void> {
  if (rt.running || !getSetting('hub_url')) return;
  rt.running = true;
  rt.state = 'syncing';
  try {
    // Pull
    for (;;) {
      const since = num('hub_seq');
      const r = await hubFetch(`/api/sync?since=${since}`);
      if (r.status === 401) throw new HubAuthError();
      if (!r.ok) throw new Error(`hub answered ${r.status}`);
      const { seq, docs } = (await r.json()) as { seq: number; docs: Row[] };
      if (!docs.length) break;
      const { before, after } = applyRemote(docs);
      // What we just wrote came from the hub: do not send it straight back (unless local edits were already waiting).
      if (before === num('hub_pushed')) setSetting('hub_pushed', String(after));
      setSetting('hub_seq', String(seq));
      if (docs.length < 2000) break;
    }
    // Push
    for (;;) {
      const from = num('hub_pushed');
      const { docs } = pull(from, 1000);
      if (!docs.length) break;
      const r = await hubFetch('/api/sync', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ docs: docs.map((d) => ({ kind: d.kind, key: d.key, value: d.value, updated: d.updated, deleted: d.deleted })) }),
      });
      if (r.status === 401) throw new HubAuthError();
      if (!r.ok) throw new Error(`hub answered ${r.status}`);
      const res = (await r.json()) as { seq: number; applied: number };
      setSetting('hub_pushed', String(docs[docs.length - 1].seq));
      // Our own writes are the next hub seqs: skip them instead of pulling them back.
      if (res.seq - num('hub_seq') === res.applied) setSetting('hub_seq', String(res.seq));
      if (docs.length < 1000) break;
    }
    rt.state = 'online';
    rt.lastSync = Date.now();
    rt.error = null;
    rt.failures = 0;
  } catch (e) {
    rt.failures++;
    if (e instanceof HubAuthError) {
      rt.state = 'error';
      rt.error = 'Signed out of the hub. Sign in again in Settings.';
    } else if (e instanceof Error && (e.name === 'TimeoutError' || /fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|network/i.test(e.message + String((e as { cause?: unknown }).cause ?? '')))) {
      rt.state = 'offline';
      rt.error = null;
    } else {
      rt.state = 'error';
      rt.error = e instanceof Error ? e.message : String(e);
    }
  } finally {
    rt.running = false;
    if (getSetting('hub_url')) kick(rt.state === 'online' ? POLL : Math.min(MAX_BACKOFF, POLL * 2 ** Math.min(rt.failures, 5)));
  }
}

class HubAuthError extends Error {}

function kick(delay: number) {
  if (rt.timer) clearTimeout(rt.timer);
  rt.timer = setTimeout(() => {
    rt.timer = null;
    void syncHub();
  }, delay);
}

/** Called once when the desktop server boots: resumes a saved hub connection and syncs soon after local edits. */
export function startHub() {
  if (rt.started) return;
  rt.started = true;
  onChange(() => {
    if (getSetting('hub_url') && !rt.running && rt.state !== 'offline') kick(1500); // when offline the backoff timer (or syncNow) decides
  });
  if (getSetting('hub_url')) kick(2000);
}
