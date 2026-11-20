import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { parseRange, proxyAudio, type Codec } from './stream';

/* Audio kept on disk (desktop app only, enabled by LOMU_AUDIO_CACHE_DIR). A song you actually listen to is
   downloaded in full in the background; from then on it plays from the file, which works with no internet and
   with the homelab off. The oldest files are removed once the folder passes LOMU_AUDIO_CACHE_MB (default 2 GB). */

const dir = () => process.env.LOMU_AUDIO_CACHE_DIR || '';
export const audioCacheEnabled = () => !!dir();
const limitBytes = () => (Number(process.env.LOMU_AUDIO_CACHE_MB) || 2048) * 1024 * 1024;
const MIME: Record<Codec, string> = { opus: 'audio/webm', aac: 'audio/mp4' };

type G = typeof globalThis & { __lomuFilling?: Set<string>; __lomuLastStream?: string };
const g = globalThis as G;
const filling: Set<string> = (g.__lomuFilling ??= new Set());

const file = (id: string, codec: Codec) => path.join(dir(), `${id}.${codec}`);

/** The cached file for this song, if it is complete. Touching it keeps it fresh for eviction. */
export function cachedFile(id: string, codec: Codec): string | null {
  if (!audioCacheEnabled() || !/^[\w-]{11}$/.test(id)) return null;
  const f = file(id, codec);
  try {
    if (!fs.statSync(f).isFile()) return null;
    const now = new Date();
    fs.utimesSync(f, now, now);
    return f;
  } catch {
    return null;
  }
}

/** Serves a cached file with the same 200/206 behaviour as the live proxy. */
export function serveFile(f: string, codec: Codec, rangeHeader: string | null): Response {
  const len = fs.statSync(f).size;
  const range = parseRange(rangeHeader, len);
  if (rangeHeader && !range) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${len}` } });
  const start = range?.start ?? 0;
  const end = range?.end ?? len - 1;
  const body = Readable.toWeb(fs.createReadStream(f, { start, end })) as ReadableStream<Uint8Array>;
  const headers = new Headers({
    'content-type': MIME[codec],
    'content-length': String(end - start + 1),
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600, no-transform',
    'x-lomu-client': 'disk',
    'x-lomu-length': String(len),
  });
  if (range) headers.set('content-range', `bytes ${start}-${end}/${len}`);
  return new Response(body, { status: range ? 206 : 200, headers });
}

/**
 * Called for every live stream request. If the same song is still the one being listened to a few seconds
 * later (skipping through a list does not count), download it in full in the background.
 */
export function maybeFill(id: string, codec: Codec) {
  if (!audioCacheEnabled()) return;
  g.__lomuLastStream = id;
  const key = `${id}.${codec}`;
  if (filling.has(key) || cachedFile(id, codec)) return;
  setTimeout(() => {
    if (g.__lomuLastStream !== id || filling.has(key) || cachedFile(id, codec)) return;
    filling.add(key);
    fill(id, codec)
      .catch((e) => console.error('[audio-cache]', id, e instanceof Error ? e.message : e))
      .finally(() => filling.delete(key));
  }, 12_000);
}

async function fill(id: string, codec: Codec) {
  fs.mkdirSync(dir(), { recursive: true });
  const part = file(id, codec) + '.part';
  const res = await proxyAudio(id, codec, null, new AbortController().signal);
  if (!res.ok || !res.body) throw new Error(`upstream ${res.status}`);
  const total = Number(res.headers.get('x-lomu-length'));
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(part));
  if (!total || fs.statSync(part).size !== total) {
    fs.rmSync(part, { force: true });
    throw new Error('incomplete download');
  }
  fs.renameSync(part, file(id, codec));
  evict();
}

/** Deletes the least recently used files until the folder fits the limit; also clears leftovers of interrupted downloads. */
function evict() {
  try {
    const entries = fs.readdirSync(dir()).map((n) => {
      const p = path.join(dir(), n);
      const st = fs.statSync(p);
      return { p, n, size: st.size, at: st.mtimeMs };
    });
    for (const e of entries) if (e.n.endsWith('.part') && Date.now() - e.at > 3600_000) fs.rmSync(e.p, { force: true });
    const files = entries.filter((e) => !e.n.endsWith('.part')).sort((a, b) => a.at - b.at);
    let total = files.reduce((s, f) => s + f.size, 0);
    for (const f of files) {
      if (total <= limitBytes()) break;
      fs.rmSync(f.p, { force: true });
      total -= f.size;
    }
  } catch {
    /* best effort */
  }
}

export function audioCacheStats(): { files: number; bytes: number } {
  try {
    const list = fs.readdirSync(dir()).filter((n) => !n.endsWith('.part'));
    return { files: list.length, bytes: list.reduce((s, n) => s + fs.statSync(path.join(dir(), n)).size, 0) };
  } catch {
    return { files: 0, bytes: 0 };
  }
}
