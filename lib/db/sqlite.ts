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
import { readFileSync } from 'fs';

// Type-only import — erased at compile time, never pulls the native module in.
import type BetterSqlite3 from 'better-sqlite3';

export type Db = BetterSqlite3.Database;

// The data DB belongs to the workspace (cwd); the schema travels with the code
// (module-relative) so the bootstrap works regardless of the working directory.
const DB_DIR = () => path.join(process.cwd(), 'projects', '.driftgrid');
const DB_PATH = () => path.join(DB_DIR(), 'db.sqlite');
const SCHEMA_PATH = () => path.join(__dirname, 'schema-sqlite.sql');

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
  const schema = readFileSync(SCHEMA_PATH(), 'utf-8');
  db.exec(schema);

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
