/**
 * Local SQLite connection for the DriftGrid local-workspace mirror (Phase 1).
 *
 * The DB lives at projects/.driftgrid/db.sqlite and holds the relational
 * structure (projects/rounds/concepts/versions/annotations). HTML content stays
 * in files on disk — this DB only mirrors the manifest hierarchy.
 *
 * better-sqlite3 is a native module and is ONLY loaded when the SQLite backend
 * is actually selected (DRIFTGRID_DB_BACKEND=sqlite). It is lazy-imported here
 * so the default file/cloud paths and the Vercel build never touch it.
 */

import path from 'path';
import { promises as fs } from 'fs';

// Type-only import — erased at compile time, never pulls the native module in.
import type BetterSqlite3 from 'better-sqlite3';
import { SQLITE_SCHEMA } from './schema-sqlite';

export type Db = BetterSqlite3.Database;

// The data DB belongs to the workspace (cwd). The schema is inlined (imported),
// so there is no filesystem read at bootstrap — works under Next/Turbopack
// bundling and from any cwd.
const DB_DIR = () => path.join(process.cwd(), 'projects', '.driftgrid');
const DB_PATH = () => path.join(DB_DIR(), 'db.sqlite');

// One connection per process, keyed by resolved path (future: per workspace).
const connections = new Map<string, Db>();

/**
 * Open (creating if needed) the local SQLite DB, bootstrap the schema, and
 * return a ready connection. Idempotent — repeated calls reuse the cached
 * handle. Async only because better-sqlite3 is lazy-imported; the DB API
 * itself is synchronous.
 */
export async function getDb(): Promise<Db> {
  const dbPath = DB_PATH();
  const existing = connections.get(dbPath);
  if (existing) return existing;

  await fs.mkdir(DB_DIR(), { recursive: true });

  const Database = (await import('better-sqlite3')).default;
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Bootstrap the schema (CREATE TABLE IF NOT EXISTS ... — safe to re-run).
  db.exec(SQLITE_SCHEMA);

  connections.set(dbPath, db);
  return db;
}

/** Close all open connections (tests / shutdown). */
export function closeAll(): void {
  for (const db of connections.values()) {
    try { db.close(); } catch { /* already closed */ }
  }
  connections.clear();
}
