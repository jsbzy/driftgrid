/**
 * DriftGrid local mirror — SQLite schema (Phase 1), as an inlined string.
 *
 * Inlined (rather than read from a .sql file at runtime) so the bootstrap works
 * in every runtime: tsx CLIs, Next dev/prod (Turbopack/webpack bundle the lib —
 * `__dirname` becomes a virtual path and a sibling .sql can't be read), and the
 * Tauri desktop build. This is the single source of truth for the local schema.
 *
 * Mirrors the Postgres cloud schema (supabase/migrations/20260626000000_cloud_schema.sql).
 * Type mapping vs Postgres: uuid→TEXT (app-generated), timestamptz→TEXT (ISO-8601),
 * boolean→INTEGER (0/1), jsonb→TEXT (JSON), numeric→REAL. Single-user, so no RLS
 * and user_id is nullable. Bootstrapped idempotently (CREATE TABLE IF NOT EXISTS).
 */

export const SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,
  client_slug  TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  name         TEXT NOT NULL,
  canvas       TEXT NOT NULL,
  output       TEXT,
  links        TEXT NOT NULL DEFAULT '{}',
  created      TEXT,
  extras       TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (client_slug, project_slug)
);

CREATE TABLE IF NOT EXISTS rounds (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  manifest_id         TEXT NOT NULL,
  ord                 INTEGER NOT NULL DEFAULT 0,
  number              INTEGER NOT NULL,
  name                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  note                TEXT,
  created             TEXT,
  closed_at           TEXT,
  selects             TEXT NOT NULL DEFAULT '[]',
  document_ids        TEXT,
  summary_document_id TEXT,
  extras              TEXT NOT NULL DEFAULT '{}',
  created_at          TEXT NOT NULL,
  UNIQUE (project_id, manifest_id)
);
CREATE INDEX IF NOT EXISTS rounds_project_idx ON rounds (project_id, number);

CREATE TABLE IF NOT EXISTS concepts (
  id            TEXT PRIMARY KEY,
  round_id      TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  manifest_id   TEXT NOT NULL,
  ord           INTEGER NOT NULL DEFAULT 0,
  slug          TEXT,
  label         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 0,
  visible       INTEGER NOT NULL DEFAULT 1,
  branched_from TEXT,
  canvas        TEXT,
  extras        TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL,
  UNIQUE (round_id, manifest_id)
);
CREATE INDEX IF NOT EXISTS concepts_round_idx ON concepts (round_id, position);

CREATE TABLE IF NOT EXISTS versions (
  id          TEXT PRIMARY KEY,
  concept_id  TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  manifest_id TEXT NOT NULL,
  ord         INTEGER NOT NULL DEFAULT 0,
  number      INTEGER NOT NULL,
  file_path   TEXT NOT NULL,
  parent_id   TEXT,
  changelog   TEXT NOT NULL DEFAULT '',
  visible     INTEGER NOT NULL DEFAULT 1,
  starred     INTEGER NOT NULL DEFAULT 0,
  thumbnail   TEXT,
  created     TEXT,
  extras      TEXT NOT NULL DEFAULT '{}',
  created_at  TEXT NOT NULL,
  UNIQUE (concept_id, manifest_id)
);
CREATE INDEX IF NOT EXISTS versions_concept_idx ON versions (concept_id, number, created);

CREATE TABLE IF NOT EXISTS annotations (
  id           TEXT PRIMARY KEY,
  version_id   TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  manifest_id  TEXT NOT NULL,
  ord          INTEGER NOT NULL DEFAULT 0,
  x            REAL,
  y            REAL,
  element      TEXT,
  body         TEXT NOT NULL,
  author       TEXT NOT NULL,
  is_client    INTEGER NOT NULL DEFAULT 0,
  is_agent     INTEGER NOT NULL DEFAULT 0,
  resolved     INTEGER NOT NULL DEFAULT 0,
  parent_id    TEXT,
  status       TEXT CHECK (status IS NULL OR status IN ('running')),
  submitted_at TEXT,
  attachments  TEXT,
  provider     TEXT,
  created      TEXT,
  extras       TEXT NOT NULL DEFAULT '{}',
  created_at   TEXT NOT NULL,
  UNIQUE (version_id, manifest_id)
);
CREATE INDEX IF NOT EXISTS annotations_version_idx ON annotations (version_id, created);
`;
