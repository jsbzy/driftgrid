/**
 * Round-trip / parity tests for the SQLite DB backend (Phase 1-3 foundation).
 *
 * Guards the property the whole DB model rests on: a Manifest written via
 * writeManifestDb and read back via getManifestDb is structurally identical
 * (the "manifest IS the row hierarchy" invariant). Also covers the legacy
 * top-level-concepts wrap, prune-on-removal, array-order (ord), and the
 * `extras` lossless overflow.
 *
 * Isolated: chdir into a temp dir so the DB lands in a throwaway
 * <tmp>/projects/.driftgrid/db.sqlite, never the real workspace.
 *
 * Run: npx tsx --test tests/sqlite-storage.test.ts
 */

import test, { before, after } from 'node:test';
import assert from 'node:assert';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { writeManifestDb, getManifestDb } from '../lib/sqlite-storage';
import { closeAll } from '../lib/db/sqlite';
import type { Manifest } from '../lib/types';

let origCwd: string;
let tmpDir: string;

before(async () => {
  origCwd = process.cwd();
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-sqlite-test-'));
  process.chdir(tmpDir);
});

after(async () => {
  closeAll();
  process.chdir(origCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** A representative manifest: 2 rounds, branched concept, multi-version,
 *  annotations with threading, selects, object canvas, and legacy/untyped
 *  keys at every level (must survive via `extras`). */
function fixture(): Manifest {
  const r1c1: any = {
    id: 'concept-open', slug: 'open', label: '01 · Open', description: 'title card',
    position: 0, visible: true,
    // legacy untyped key — must round-trip via extras
    legacyConceptFlag: 'keepme',
    versions: [
      { id: 'v-open-1', number: 1, file: 'open/v1.html', parentId: null, changelog: 'wire',
        visible: true, starred: false, created: '2026-01-01T00:00:00.000Z', thumbnail: '.thumbs/concept-open-v-open-1.webp' },
      { id: 'v-open-2', number: 2, file: 'open/v2.html', parentId: 'v-open-1', changelog: 'karaoke',
        visible: true, starred: true, created: '2026-01-02T00:00:00.000Z', thumbnail: '.thumbs/concept-open-v-open-2.webp',
        annotations: [
          { id: 'a1', x: 0.5, y: 0.5, element: null, text: 'tighten', author: 'jeff', isClient: false, isAgent: false, created: '2026-01-02T01:00:00.000Z', resolved: false, parentId: null, provider: 'claude' },
          { id: 'a2', x: null, y: null, element: null, text: 'on it', author: 'claude', isClient: false, isAgent: true, created: '2026-01-02T02:00:00.000Z', resolved: true, parentId: 'a1', attachments: ['/tmp/shot.png'] },
        ] },
    ],
  };
  const r1c2: any = {
    id: 'concept-grid', slug: 'grid', label: '02 · Grid', description: 'mono grid',
    position: 1, visible: true,
    branchedFrom: { conceptId: 'concept-open', versionId: 'v-open-1' },
    canvas: { type: 'desktop', width: 1440, height: 'auto' },
    versions: [
      { id: 'v-grid-1', number: 1, file: 'grid/v1.html', parentId: null, changelog: 'init',
        visible: true, starred: false, created: '2026-01-03T00:00:00.000Z', thumbnail: '.thumbs/concept-grid-v-grid-1.webp' },
    ],
  };
  return {
    project: { name: 'Demo', slug: 'demo', client: 'acme', canvas: 'landscape-16-9', created: '2026-01-01T00:00:00.000Z', links: { figma: 'https://f' } },
    rounds: [
      { id: 'round-1', number: 1, name: 'Round 1', createdAt: '2026-01-01T00:00:00.000Z', closedAt: '2026-01-05T00:00:00.000Z',
        selects: [{ conceptId: 'concept-open', versionId: 'v-open-2' }], concepts: [r1c1, r1c2] } as any,
      { id: 'round-2', number: 2, name: 'Round 2', createdAt: '2026-01-06T00:00:00.000Z', selects: [],
        concepts: [{ id: 'concept-final', slug: 'final', label: '03 · Final', description: '', position: 0, visible: true,
          versions: [{ id: 'v-final-1', number: 1, file: 'final/v1.html', parentId: null, changelog: 'init', visible: true, starred: false, created: '2026-01-06T00:00:00.000Z', thumbnail: '' }] }] } as any,
    ],
    concepts: [],
    workingSets: [],
    comments: [],
    clientEdits: [],
  };
}

test('round-trips a full manifest structurally', async () => {
  const m = fixture();
  await writeManifestDb('acme', 'demo', m);
  const got = await getManifestDb('acme', 'demo');
  assert.ok(got, 'manifest read back');

  // project
  assert.strictEqual(got!.project.name, 'Demo');
  assert.strictEqual(got!.project.canvas, 'landscape-16-9');
  assert.deepStrictEqual(got!.project.links, { figma: 'https://f' });

  // rounds: count + order + close state + selects
  assert.strictEqual(got!.rounds.length, 2);
  assert.deepStrictEqual(got!.rounds.map(r => r.id), ['round-1', 'round-2']);
  assert.strictEqual(got!.rounds[0].closedAt, '2026-01-05T00:00:00.000Z');
  assert.deepStrictEqual(got!.rounds[0].selects, [{ conceptId: 'concept-open', versionId: 'v-open-2' }]);

  // concepts: order + branchedFrom + object canvas
  const r1 = got!.rounds[0];
  assert.deepStrictEqual(r1.concepts.map(c => c.id), ['concept-open', 'concept-grid']);
  assert.deepStrictEqual(r1.concepts[1].branchedFrom, { conceptId: 'concept-open', versionId: 'v-open-1' });
  assert.deepStrictEqual(r1.concepts[1].canvas, { type: 'desktop', width: 1440, height: 'auto' });

  // versions: order, starred, parentId
  const open = r1.concepts[0];
  assert.deepStrictEqual(open.versions.map(v => v.id), ['v-open-1', 'v-open-2']);
  assert.strictEqual(open.versions[1].starred, true);
  assert.strictEqual(open.versions[1].parentId, 'v-open-1');

  // annotations: threading + flags + attachments
  const anns = open.versions[1].annotations!;
  assert.strictEqual(anns.length, 2);
  assert.strictEqual(anns[0].text, 'tighten');
  assert.strictEqual(anns[1].parentId, 'a1');
  assert.strictEqual(anns[1].isAgent, true);
  assert.strictEqual(anns[1].resolved, true);
  assert.deepStrictEqual(anns[1].attachments, ['/tmp/shot.png']);

  // alias points at latest round
  assert.deepStrictEqual(got!.concepts.map(c => c.id), ['concept-final']);
});

test('preserves untyped legacy keys via extras (lossless)', async () => {
  const got = await getManifestDb('acme', 'demo');
  const open = got!.rounds[0].concepts[0] as any;
  assert.strictEqual(open.legacyConceptFlag, 'keepme', 'untyped concept key survived round-trip');
});

test('wraps legacy top-level concepts into round-1', async () => {
  const legacy: any = {
    project: { name: 'Legacy', slug: 'leg', client: 'acme', canvas: 'desktop', created: '2026-02-01T00:00:00.000Z', links: {} },
    rounds: [],
    concepts: [{ id: 'concept-1', slug: 'c1', label: 'Concept 1', description: '', position: 0, visible: true,
      versions: [{ id: 'v1', number: 1, file: 'concept-1/v1.html', parentId: null, changelog: 'init', visible: true, starred: false, created: '2026-02-01T00:00:00.000Z', thumbnail: '' }] }],
    workingSets: [], comments: [], clientEdits: [],
  };
  await writeManifestDb('acme', 'leg', legacy);
  const got = await getManifestDb('acme', 'leg');
  assert.strictEqual(got!.rounds.length, 1, 'top-level concepts wrapped into one round');
  assert.strictEqual(got!.rounds[0].id, 'round-1');
  assert.deepStrictEqual(got!.rounds[0].concepts.map((c: any) => c.id), ['concept-1']);
});

test('prunes removed children on rewrite', async () => {
  // Remove v-open-2 (and its annotations) + drop concept-grid; rewrite.
  const m = fixture();
  m.rounds[0].concepts[0].versions = m.rounds[0].concepts[0].versions.slice(0, 1); // keep only v-open-1
  m.rounds[0].concepts = m.rounds[0].concepts.slice(0, 1);                          // drop concept-grid
  await writeManifestDb('acme', 'demo', m);
  const got = await getManifestDb('acme', 'demo');
  const r1 = got!.rounds[0];
  assert.deepStrictEqual(r1.concepts.map(c => c.id), ['concept-open'], 'concept-grid pruned');
  assert.deepStrictEqual(r1.concepts[0].versions.map(v => v.id), ['v-open-1'], 'v-open-2 pruned');
  assert.strictEqual(r1.concepts[0].versions[0].annotations, undefined, 'no annotations remain');
});

test('preserves array order after reorder (ord)', async () => {
  const m = fixture();
  // swap concept order in round-1
  m.rounds[0].concepts = [m.rounds[0].concepts[1], m.rounds[0].concepts[0]];
  await writeManifestDb('acme', 'demo', m);
  const got = await getManifestDb('acme', 'demo');
  assert.deepStrictEqual(got!.rounds[0].concepts.map(c => c.id), ['concept-grid', 'concept-open'], 'reorder persisted via ord');
});

test('returns null for unknown project', async () => {
  const got = await getManifestDb('nope', 'nope');
  assert.strictEqual(got, null);
});
