import 'server-only';
import { EventEmitter } from 'node:events';
import { db } from './db';

/* Document sync. Every synced object ("doc") is (kind, key) -> JSON value, last write wins by the
   client-supplied `updated` timestamp. Each accepted write gets the next `seq`; clients ask for
   everything above the seq they last saw, so a sync is incremental. Deletes are tombstones. */

export type Doc = { kind: string; key: string; value: unknown | null; updated: number; deleted?: boolean };
export type Row = { kind: string; key: string; value: unknown | null; updated: number; deleted: boolean; seq: number };

const KINDS = new Set(['like', 'playlist', 'saved', 'play', 'search', 'queue']);

type G = typeof globalThis & { __lomuBus?: EventEmitter };
const bus: EventEmitter = ((globalThis as G).__lomuBus ??= new EventEmitter());
bus.setMaxListeners(50);
export const onChange = (fn: (seq: number) => void) => {
  bus.on('seq', fn);
  return () => bus.off('seq', fn);
};

export function currentSeq(): number {
  const r = db().prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM docs').get() as { s: number };
  return r.s;
}

export function pull(since: number, limit = 2000): { seq: number; docs: Row[] } {
  const rows = db()
    .prepare('SELECT kind, key, value, updated, deleted, seq FROM docs WHERE seq > ? ORDER BY seq LIMIT ?')
    .all(since, limit) as { kind: string; key: string; value: string | null; updated: number; deleted: number; seq: number }[];
  const docs = rows.map((r) => ({ ...r, deleted: !!r.deleted, value: r.value ? JSON.parse(r.value) : null }));
  return { seq: docs.length ? docs[docs.length - 1].seq : since, docs };
}

export function push(docs: Doc[]): { seq: number; applied: number } {
  const d = db();
  let seq = currentSeq();
  let applied = 0;
  const get = d.prepare('SELECT updated, value, deleted FROM docs WHERE kind = ? AND key = ?');
  const put = d.prepare(
    `INSERT INTO docs (kind, key, value, updated, deleted, seq) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, key) DO UPDATE SET value = excluded.value, updated = excluded.updated, deleted = excluded.deleted, seq = excluded.seq`,
  );
  d.exec('BEGIN');
  try {
    for (const doc of docs.slice(0, 5000)) {
      if (!KINDS.has(doc.kind) || typeof doc.key !== 'string' || !doc.key || doc.key.length > 200) continue;
      const updated = Number(doc.updated) || Date.now();
      const cur = get.get(doc.kind, doc.key) as { updated: number; value: string | null; deleted: number } | undefined;
      if (cur && cur.updated > updated) continue; // an newer write already won
      const json = doc.deleted || doc.value == null ? null : JSON.stringify(doc.value);
      if (json && json.length > 200_000) continue;
      const del = doc.deleted || json === null ? 1 : 0;
      // A client that re-offers its whole library (every start-up does) must not re-stamp documents that did not
      // change: that would make every other device pull the whole log again.
      if (cur && cur.updated === updated && cur.value === json && cur.deleted === del) continue;
      put.run(doc.kind, doc.key, json, updated, del, ++seq);
      applied++;
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  if (applied) bus.emit('seq', seq);
  return { seq, applied };
}

/**
 * Applies documents that came from another server (the sync hub). Same last-write-wins rule as [push], but an
 * equal timestamp counts as already known, so a write that bounces back is not applied twice.
 * Returns the local seq before and after, so the caller can tell its own bookkeeping apart from new local edits.
 */
export function applyRemote(rows: { kind: string; key: string; value: unknown | null; updated: number; deleted?: boolean }[]): { before: number; after: number; applied: number } {
  const d = db();
  const before = currentSeq();
  let seq = before;
  let applied = 0;
  const get = d.prepare('SELECT updated FROM docs WHERE kind = ? AND key = ?');
  const put = d.prepare(
    `INSERT INTO docs (kind, key, value, updated, deleted, seq) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, key) DO UPDATE SET value = excluded.value, updated = excluded.updated, deleted = excluded.deleted, seq = excluded.seq`,
  );
  d.exec('BEGIN');
  try {
    for (const r of rows) {
      if (!KINDS.has(r.kind) || typeof r.key !== 'string' || !r.key || r.key.length > 200) continue;
      const updated = Number(r.updated) || 0;
      const cur = get.get(r.kind, r.key) as { updated: number } | undefined;
      if (cur && cur.updated >= updated) continue;
      const json = r.deleted || r.value == null ? null : JSON.stringify(r.value);
      if (json && json.length > 200_000) continue;
      put.run(r.kind, r.key, json, updated, r.deleted || json === null ? 1 : 0, ++seq);
      applied++;
    }
    d.exec('COMMIT');
  } catch (e) {
    d.exec('ROLLBACK');
    throw e;
  }
  if (applied) bus.emit('seq', seq);
  return { before, after: seq, applied };
}

/** All live docs of a kind (used by the recommendation engine). */
export function all(kind: string, limit = 5000): { key: string; value: any; updated: number }[] {
  return (db()
    .prepare('SELECT key, value, updated FROM docs WHERE kind = ? AND deleted = 0 ORDER BY updated DESC LIMIT ?')
    .all(kind, limit) as { key: string; value: string; updated: number }[]).map((r) => ({ ...r, value: JSON.parse(r.value) }));
}
