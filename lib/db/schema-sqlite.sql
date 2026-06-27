-- ============================================================================
-- DriftGrid local mirror — SQLite schema (Phase 1)
-- ----------------------------------------------------------------------------
-- Same hierarchy as the Postgres cloud schema (supabase/migrations/
-- 20260626000000_cloud_schema.sql), shaped for the on-disk local workspace DB
-- at projects/.driftgrid/db.sqlite. Single-user, so there is no RLS and
-- user_id is nullable (local has no auth.users).
--
-- Type mapping vs Postgres:
--   uuid        -> TEXT  (app-generated via crypto.randomUUID())
--   timestamptz -> TEXT  (ISO-8601 strings, byte-for-byte from the manifest)
--   boolean     -> INTEGER (0/1)
--   jsonb       -> TEXT  (JSON.stringify'd)
--   numeric     -> REAL
--
-- Bootstrapped idempotently by lib/db/sqlite.ts (CREATE TABLE IF NOT EXISTS).
-- ============================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id           TEXT PRIMARY KEY,
  user_id      TEXT,                 -- null on local
  client_slug  TEXT NOT NULL,
  project_slug TEXT NOT NULL,
  name         TEXT NOT NULL,
  canvas       TEXT NOT NULL,
  output       TEXT,
  links        TEXT NOT NULL DEFAULT '{}',
  created      TEXT,                 -- manifest project.created
  extras       TEXT NOT NULL DEFAULT '{}',  -- { workingSets, documents, comments, clientEdits }
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  UNIQUE (client_slug, project_slug)
);

CREATE TABLE IF NOT EXISTS rounds (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  manifest_id         TEXT NOT NULL,
  ord                 INTEGER NOT NULL DEFAULT 0,  -- source array index (display fidelity)
  number              INTEGER NOT NULL,
  name                TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  note                TEXT,
  created             TEXT,
  closed_at           TEXT,
  selects             TEXT NOT NULL DEFAULT '[]',
  document_ids        TEXT,
  summary_document_id TEXT,
  extras              TEXT NOT NULL DEFAULT '{}',  -- untyped manifest keys (lossless overflow)
  created_at          TEXT NOT NULL,
  UNIQUE (project_id, manifest_id)
);
CREATE INDEX IF NOT EXISTS rounds_project_idx ON rounds (project_id, number);

CREATE TABLE IF NOT EXISTS concepts (
  id            TEXT PRIMARY KEY,
  round_id      TEXT NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  manifest_id   TEXT NOT NULL,
  ord           INTEGER NOT NULL DEFAULT 0,  -- source array index (display fidelity)
  slug          TEXT,
  label         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 0,
  visible       INTEGER NOT NULL DEFAULT 1,
  branched_from TEXT,
  canvas        TEXT,
  extras        TEXT NOT NULL DEFAULT '{}',  -- untyped manifest keys (lossless overflow)
  created_at    TEXT NOT NULL,
  UNIQUE (round_id, manifest_id)
);
CREATE INDEX IF NOT EXISTS concepts_round_idx ON concepts (round_id, position);

CREATE TABLE IF NOT EXISTS versions (
  id          TEXT PRIMARY KEY,
  concept_id  TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  manifest_id TEXT NOT NULL,
  ord         INTEGER NOT NULL DEFAULT 0,  -- source array index (display fidelity)
  number      INTEGER NOT NULL,
  file_path   TEXT NOT NULL,
  parent_id   TEXT,                 -- parent version's manifest_id
  changelog   TEXT NOT NULL DEFAULT '',
  visible     INTEGER NOT NULL DEFAULT 1,
  starred     INTEGER NOT NULL DEFAULT 0,
  thumbnail   TEXT,
  created     TEXT,
  extras      TEXT NOT NULL DEFAULT '{}',  -- untyped manifest keys (lossless overflow)
  created_at  TEXT NOT NULL,
  UNIQUE (concept_id, manifest_id)
);
CREATE INDEX IF NOT EXISTS versions_concept_idx ON versions (concept_id, number, created);

CREATE TABLE IF NOT EXISTS annotations (
  id           TEXT PRIMARY KEY,
  version_id   TEXT NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  manifest_id  TEXT NOT NULL,
  ord          INTEGER NOT NULL DEFAULT 0,  -- source array index (display fidelity)
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
  extras       TEXT NOT NULL DEFAULT '{}',  -- untyped manifest keys (lossless overflow)
  created_at   TEXT NOT NULL,
  UNIQUE (version_id, manifest_id)
);
CREATE INDEX IF NOT EXISTS annotations_version_idx ON annotations (version_id, created);
