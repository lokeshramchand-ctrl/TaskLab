import 'server-only';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// The data directory lives outside the project tree (writes inside it would retrigger the dev
// bundler) and is the only thing that needs backing up: one SQLite file.
const dir = process.env.LOMU_DATA_DIR || path.join(os.homedir(), '.lomu');

type G = typeof globalThis & { __lomuDb?: DatabaseSync };
const g = globalThis as G;

export function db(): DatabaseSync {
  if (g.__lomuDb) return g.__lomuDb;
  fs.mkdirSync(dir, { recursive: true });
  const d = new DatabaseSync(path.join(dir, 'lomu.db'));
  d.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK (id = 1), username TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS refresh (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL, device TEXT);
    -- One row per synced object. seq is the position in the global change log: a client that
    -- remembers the highest seq it saw asks only for rows above it.
    CREATE TABLE IF NOT EXISTS docs (
      kind TEXT NOT NULL, key TEXT NOT NULL, value TEXT, updated INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, seq INTEGER NOT NULL,
      PRIMARY KEY (kind, key)
    );
    CREATE INDEX IF NOT EXISTS docs_seq ON docs (seq);
    -- Last good answer for catalogue pages and recommendations, served when YouTube cannot be reached.
    CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT NOT NULL, at INTEGER NOT NULL);
  `);
  g.__lomuDb = d;
  return d;
}

export function getSetting(k: string): string | undefined {
  const row = db().prepare('SELECT v FROM settings WHERE k = ?').get(k) as { v: string } | undefined;
  return row?.v;
}
export function setSetting(k: string, v: string) {
  db().prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, v);
}

/** Closes the connection (tests, graceful shutdown). */
export function closeDb() {
  g.__lomuDb?.close();
  g.__lomuDb = undefined;
}
