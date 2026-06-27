/**
 * Postgres backend verification via PGlite (real Postgres, in-process, no Docker).
 *
 * Validates the risky NEW cloud logic without touching prod:
 *   - the write_manifest() plpgsql RPC (loaded verbatim from its migration)
 *   - the rows -> Manifest mapper on Postgres-native encodings (jsonb objects,
 *     native booleans/floats)
 *
 * The strongest assertion is CROSS-BACKEND PARITY: the same fixture written
 * through Postgres and through the proven SQLite backend reads back identical.
 *
 * NOT covered here (needs a real Supabase branch DB): auth.users FK, RLS
 * policies, and the thin supabase-js glue in lib/postgres-storage.ts. The test
 * schema below is the tables only (no auth/RLS) — exactly the surface the
 * service-role admin client operates on in prod.
 *
 * Run: npx tsx --test tests/postgres-storage.test.ts
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { rowsToManifest, type ManifestRowSet } from '../lib/db/manifest-mapper';
import { writeManifestDb, getManifestDb } from '../lib/sqlite-storage';
import { closeAll } from '../lib/db/sqlite';
import type { Manifest } from '../lib/types';

const TEST_USER = '00000000-0000-0000-0000-000000000001';

// Tables only — same columns/types as supabase/migrations/20260626000000_cloud_schema.sql,
// minus the auth.users FK and RLS (PGlite has no auth schema; the admin client
// bypasses RLS anyway). gen_random_uuid() is core in PG13+, no extension needed.
const PG_TEST_SCHEMA = `
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, client_slug text not null, project_slug text not null,
  name text not null, canvas text not null, output text,
  links jsonb not null default '{}'::jsonb, created text,
  extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, client_slug, project_slug)
);
create table rounds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  manifest_id text not null, ord int not null default 0, number int not null, name text not null,
  status text not null default 'open', note text, created text, closed_at text,
  selects jsonb not null default '[]'::jsonb, document_ids jsonb, summary_document_id text,
  extras jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique (project_id, manifest_id)
);
create table concepts (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references rounds(id) on delete cascade,
  manifest_id text not null, ord int not null default 0, slug text, label text not null,
  description text not null default '', position int not null default 0, visible boolean not null default true,
  branched_from jsonb, canvas jsonb, extras jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), unique (round_id, manifest_id)
);
create table versions (
  id uuid primary key default gen_random_uuid(),
  concept_id uuid not null references concepts(id) on delete cascade,
  manifest_id text not null, ord int not null default 0, number int not null, file_path text not null,
  parent_id text, changelog text not null default '', visible boolean not null default true,
  starred boolean not null default false, thumbnail text, created text,
  extras jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique (concept_id, manifest_id)
);
create table annotations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references versions(id) on delete cascade,
  manifest_id text not null, ord int not null default 0, x double precision, y double precision,
  element text, body text not null, author text not null,
  is_client boolean not null default false, is_agent boolean not null default false, resolved boolean not null default false,
  parent_id text, status text, submitted_at text, attachments jsonb, provider text, created text,
  extras jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique (version_id, manifest_id)
);
`;

let writeManifestSql: string;
let origCwd: string;
let tmpDir: string;

before(async () => {
  // Load the REAL function SQL (strip the leading comment banner is unnecessary —
  // create-or-replace executes fine with comments).
  writeManifestSql = await fs.readFile(
    path.join(process.cwd(), 'supabase', 'migrations', '20260627000000_write_manifest_rpc.sql'),
    'utf-8',
  );
  origCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-pg-test-'));
});

after(async () => {
  closeAll();
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function freshPg(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(PG_TEST_SCHEMA);
  await db.exec(writeManifestSql);
  return db;
}

/** Read a project's rows back out of PGlite and rebuild a Manifest. */
async function readManifestPg(db: PGlite, client: string, project: string): Promise<Manifest | null> {
  const p = (await db.query(`select * from projects where client_slug=$1 and project_slug=$2`, [client, project])).rows[0];
  if (!p) return null;
  const rounds = (await db.query(`select * from rounds`)).rows;
  const concepts = (await db.query(`select * from concepts`)).rows;
  const versions = (await db.query(`select * from versions`)).rows;
  const annotations = (await db.query(`select * from annotations`)).rows;
  return rowsToManifest({ project: p, rounds, concepts, versions, annotations } as unknown as ManifestRowSet);
}

async function writeManifestPg(db: PGlite, client: string, project: string, m: Manifest): Promise<void> {
  await db.query(`select write_manifest($1::uuid, $2, $3, $4::jsonb)`, [TEST_USER, client, project, JSON.stringify(m)]);
}

function fixture(): Manifest {
  const r1c1: any = {
    id: 'concept-open', slug: 'open', label: '01 · Open', description: 'title card',
    position: 0, visible: true, legacyConceptFlag: 'keepme',
    versions: [
      { id: 'v-open-1', number: 1, file: 'open/v1.html', parentId: null, changelog: 'wire', visible: true, starred: false, created: '2026-01-01T00:00:00.000Z', thumbnail: '.thumbs/concept-open-v-open-1.webp' },
      { id: 'v-open-2', number: 2, file: 'open/v2.html', parentId: 'v-open-1', changelog: 'karaoke', visible: true, starred: true, created: '2026-01-02T00:00:00.000Z', thumbnail: '.thumbs/concept-open-v-open-2.webp',
        annotations: [
          { id: 'a1', x: 0.5, y: 0.5, element: null, text: 'tighten', author: 'jeff', isClient: false, isAgent: false, created: '2026-01-02T01:00:00.000Z', resolved: false, parentId: null, provider: 'claude' },
          { id: 'a2', x: null, y: null, element: null, text: 'on it', author: 'claude', isClient: false, isAgent: true, created: '2026-01-02T02:00:00.000Z', resolved: true, parentId: 'a1', attachments: ['/tmp/shot.png'] },
        ] },
    ],
  };
  const r1c2: any = {
    id: 'concept-grid', slug: 'grid', label: '02 · Grid', description: 'mono grid', position: 1, visible: true,
    branchedFrom: { conceptId: 'concept-open', versionId: 'v-open-1' },
    canvas: { type: 'desktop', width: 1440, height: 'auto' },
    versions: [{ id: 'v-grid-1', number: 1, file: 'grid/v1.html', parentId: null, changelog: 'init', visible: true, starred: false, created: '2026-01-03T00:00:00.000Z', thumbnail: '.thumbs/concept-grid-v-grid-1.webp' }],
  };
  return {
    project: { name: 'Demo', slug: 'demo', client: 'acme', canvas: 'landscape-16-9', created: '2026-01-01T00:00:00.000Z', links: { figma: 'https://f' } },
    rounds: [
      { id: 'round-1', number: 1, name: 'Round 1', createdAt: '2026-01-01T00:00:00.000Z', closedAt: '2026-01-05T00:00:00.000Z', selects: [{ conceptId: 'concept-open', versionId: 'v-open-2' }], concepts: [r1c1, r1c2] } as any,
      { id: 'round-2', number: 2, name: 'Round 2', createdAt: '2026-01-06T00:00:00.000Z', selects: [], concepts: [{ id: 'concept-final', slug: 'final', label: '03 · Final', description: '', position: 0, visible: true, versions: [{ id: 'v-final-1', number: 1, file: 'final/v1.html', parentId: null, changelog: 'init', visible: true, starred: false, created: '2026-01-06T00:00:00.000Z', thumbnail: '' }] }] } as any,
    ],
    concepts: [], workingSets: [], comments: [], clientEdits: [],
  };
}

/** userId differs by construction (PG stores it, SQLite local doesn't) — strip for parity compare. */
function stripUserId(m: Manifest): Manifest { const c = JSON.parse(JSON.stringify(m)); delete c.project.userId; return c; }

test('write_manifest RPC: full structural round-trip', async () => {
  const db = await freshPg();
  await writeManifestPg(db, 'acme', 'demo', fixture());
  const got = await readManifestPg(db, 'acme', 'demo');
  assert.ok(got);
  assert.strictEqual(got!.rounds.length, 2);
  assert.deepStrictEqual(got!.rounds.map(r => r.id), ['round-1', 'round-2']);
  assert.strictEqual(got!.rounds[0].closedAt, '2026-01-05T00:00:00.000Z');
  assert.deepStrictEqual(got!.rounds[0].selects, [{ conceptId: 'concept-open', versionId: 'v-open-2' }]);
  const open = got!.rounds[0].concepts[0];
  assert.deepStrictEqual(open.versions.map(v => v.id), ['v-open-1', 'v-open-2']);
  assert.strictEqual(open.versions[1].starred, true);
  assert.strictEqual(open.versions[1].created, '2026-01-02T00:00:00.000Z'); // ISO string preserved exactly
  const anns = open.versions[1].annotations!;
  assert.strictEqual(anns[0].x, 0.5);            // float preserved as number
  assert.strictEqual(anns[1].x, null);
  assert.strictEqual(anns[1].parentId, 'a1');
  assert.deepStrictEqual(anns[1].attachments, ['/tmp/shot.png']);
  assert.deepStrictEqual(got!.rounds[0].concepts[1].canvas, { type: 'desktop', width: 1440, height: 'auto' });
  assert.strictEqual((got!.rounds[0].concepts[0] as any).legacyConceptFlag, 'keepme'); // extras lossless
  assert.strictEqual(got!.project.userId, TEST_USER);
});

test('CROSS-BACKEND PARITY: Postgres == SQLite for the same manifest', async () => {
  process.chdir(tmpDir);
  const m = fixture();
  // SQLite
  await writeManifestDb('acme', 'demo', m);
  const sqliteOut = await getManifestDb('acme', 'demo');
  // Postgres
  const db = await freshPg();
  await writeManifestPg(db, 'acme', 'demo', m);
  const pgOut = await readManifestPg(db, 'acme', 'demo');
  assert.ok(sqliteOut && pgOut);
  assert.deepStrictEqual(stripUserId(pgOut!), stripUserId(sqliteOut!));
});

test('write_manifest RPC: legacy top-level concepts wrap into round-1', async () => {
  const db = await freshPg();
  const legacy: any = {
    project: { name: 'Legacy', slug: 'leg', client: 'acme', canvas: 'desktop', created: '2026-02-01T00:00:00.000Z', links: {} },
    rounds: [],
    concepts: [{ id: 'concept-1', slug: 'c1', label: 'Concept 1', description: '', position: 0, visible: true,
      versions: [{ id: 'v1', number: 1, file: 'concept-1/v1.html', parentId: null, changelog: 'init', visible: true, starred: false, created: '2026-02-01T00:00:00.000Z', thumbnail: '' }] }],
    workingSets: [], comments: [], clientEdits: [],
  };
  await writeManifestPg(db, 'acme', 'leg', legacy);
  const got = await readManifestPg(db, 'acme', 'leg');
  assert.strictEqual(got!.rounds.length, 1);
  assert.strictEqual(got!.rounds[0].id, 'round-1');
  assert.deepStrictEqual(got!.rounds[0].concepts.map((c: any) => c.id), ['concept-1']);
});

test('write_manifest RPC: re-write prunes removed children (atomic upsert+prune)', async () => {
  const db = await freshPg();
  await writeManifestPg(db, 'acme', 'demo', fixture());
  const m = fixture();
  m.rounds[0].concepts[0].versions = m.rounds[0].concepts[0].versions.slice(0, 1); // drop v-open-2 (+anns)
  m.rounds[0].concepts = m.rounds[0].concepts.slice(0, 1);                          // drop concept-grid
  await writeManifestPg(db, 'acme', 'demo', m);
  const got = await readManifestPg(db, 'acme', 'demo');
  assert.deepStrictEqual(got!.rounds[0].concepts.map(c => c.id), ['concept-open']);
  assert.deepStrictEqual(got!.rounds[0].concepts[0].versions.map(v => v.id), ['v-open-1']);
  assert.strictEqual(got!.rounds[0].concepts[0].versions[0].annotations, undefined);
  // prune cascaded: only round-1's remaining concept survives, plus round-2 untouched
  assert.strictEqual(got!.rounds.length, 2);
});
