import 'server-only';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import { Innertube, Platform, Log, UniversalCache } from 'youtubei.js';
import { db } from './db';

// youtubei.js needs a JS runtime to run YouTube's stream-URL transform. It is
// evaluated in an isolated vm context with a hard timeout so player code never
// touches this process's globals.
Platform.shim.eval = (data) =>
  vm.runInNewContext(
    `(function(){\n${data.output}\n})()`,
    { URL, URLSearchParams, TextEncoder, TextDecoder },
    { timeout: 5000 },
  );

Log.setLevel(Log.Level.NONE);

type G = typeof globalThis & { __lomuYt?: Promise<Innertube>; __lomuYtAt?: number };
const g = globalThis as G;
const SESSION_TTL = 6 * 60 * 60 * 1000; // refresh the player/session a few times a day

async function create(): Promise<Innertube> {
  return Innertube.create({
    generate_session_locally: false, // a YouTube-issued visitor id is far less likely to be bot-flagged
    retrieve_player: true,
    location: process.env.LOMU_REGION || 'IN',
    lang: 'en',
    // Outside the project tree: writes inside it would retrigger the dev bundler.
    cache: new UniversalCache(true, process.env.LOMU_CACHE_DIR || path.join(os.tmpdir(), 'lomu-yt-cache')),
  });
}

export function yt(): Promise<Innertube> {
  const stale = !g.__lomuYtAt || Date.now() - g.__lomuYtAt > SESSION_TTL;
  if (!g.__lomuYt || stale) {
    g.__lomuYtAt = Date.now();
    g.__lomuYt = create().catch((e) => {
      g.__lomuYt = undefined;
      throw e;
    });
  }
  return g.__lomuYt;
}

/** Forces a fresh session on the next call (used after stream failures). */
export function resetYt() {
  g.__lomuYt = undefined;
  g.__lomuYtAt = 0;
}

// Small in-memory TTL cache for catalogue pages.
type Entry = { at: number; ttl: number; value: unknown };
const memo: Map<string, Entry> = ((globalThis as any).__lomuMemo ??= new Map());

/**
 * Memoises [fn] for [ttlMs]. Every good answer is also kept in the database, and if [fn] fails later (no internet,
 * YouTube refusing) the last good answer is served instead, however old: a page that was seen once still opens.
 */
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  let value: T;
  try {
    value = await fn();
  } catch (e) {
    const old = readStale<T>(key);
    if (old !== undefined) return old;
    throw e;
  }
  writeStale(key, value);
  memo.set(key, { at: Date.now(), ttl: ttlMs, value });
  if (memo.size > 800) {
    const oldest = [...memo.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, 200);
    for (const [k] of oldest) memo.delete(k);
  }
  return value;
}

// ---- last-good-answer store (see cached)

export function readStale<T>(key: string): T | undefined {
  try {
    const row = db().prepare('SELECT v FROM cache WHERE k = ?').get(key) as { v: string } | undefined;
    return row ? (JSON.parse(row.v) as T) : undefined;
  } catch {
    return undefined;
  }
}

let writes = 0;
export function writeStale(key: string, value: unknown) {
  try {
    const json = JSON.stringify(value);
    if (!json || json.length > 2_000_000) return;
    const d = db();
    d.prepare('INSERT INTO cache (k, v, at) VALUES (?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, at = excluded.at').run(key, json, Date.now());
    // Keep it bounded: forget answers nobody has refreshed for a month, and cap the row count.
    if (++writes % 200 === 0) {
      d.prepare('DELETE FROM cache WHERE at < ?').run(Date.now() - 30 * 86400_000);
      d.prepare('DELETE FROM cache WHERE k NOT IN (SELECT k FROM cache ORDER BY at DESC LIMIT 3000)').run();
    }
  } catch {
    /* the cache is best-effort */
  }
}
