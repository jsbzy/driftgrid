/**
 * Sync tests: the pure mergeManifests core (union + LWW semantics) and the
 * syncProject orchestrator (convergence + winner selection + idempotency).
 *
 * Run: npx tsx --test tests/sync.test.ts
 */

import test from 'node:test';
import assert from 'node:assert';
import { mergeManifests, syncProject, type SyncStore } from '../lib/sync';
import type { Manifest, Version, Concept, Round } from '../lib/types';

// ---- tiny builders --------------------------------------------------------
const v = (id: string, number: number, over: Partial<Version> = {}): Version => ({
  id, number, file: `${id}.html`, parentId: null, changelog: 'c', visible: true, starred: false,
  created: `2026-01-0${number}T00:00:00.000Z`, thumbnail: '', ...over,
});
const c = (id: string, label: string, versions: Version[], over: Partial<Concept> = {}): Concept => ({
  id, label, description: '', position: 0, visible: true, versions, ...over,
});
const r = (id: string, number: number, concepts: Concept[], over: Partial<Round> = {}): Round => ({
  id, number, name: `Round ${number}`, createdAt: '2026-01-01T00:00:00.000Z', selects: [], concepts, ...over,
});
const man = (rounds: Round[], over: Partial<Manifest> = {}): Manifest => ({
  project: { name: 'Demo', slug: 'demo', client: 'acme', canvas: 'desktop', created: '2026-01-01T00:00:00.000Z', links: {} },
  rounds, concepts: rounds.length ? rounds[rounds.length - 1].concepts : [],
  workingSets: [], comments: [], clientEdits: [], ...over,
});

// ===========================================================================
// mergeManifests — pure
// ===========================================================================

test('merge: null handling', () => {
  const m = man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1)])])]);
  assert.strictEqual(mergeManifests(null, null, { preferA: true }), null);
  assert.deepStrictEqual(mergeManifests(m, null, { preferA: true }), m);
  assert.deepStrictEqual(mergeManifests(null, m, { preferA: false }), m);
});

test('merge: APPEND-MOSTLY version union — no design ever lost', () => {
  const a = man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1), v('v2', 2)])])]);
  const b = man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1), v('v3', 3)])])]);
  const merged = mergeManifests(a, b, { preferA: true })!;
  assert.deepStrictEqual(merged.rounds[0].concepts[0].versions.map(x => x.id), ['v1', 'v2', 'v3']);
});

test('merge: cloud-only concept AND cloud-only round are preserved', () => {
  const a = man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1)])])]);
  const b = man([
    r('round-1', 1, [c('c1', 'C1', [v('v1', 1)]), c('c2', 'C2', [v('v9', 1)])]),
    r('round-2', 2, [c('c3', 'C3', [v('v10', 1)])]),
  ]);
  const merged = mergeManifests(a, b, { preferA: true })!;
  assert.deepStrictEqual(merged.rounds.map(x => x.id), ['round-1', 'round-2']);
  assert.deepStrictEqual(merged.rounds[0].concepts.map(x => x.id), ['c1', 'c2']);
});

test('merge: metadata LWW — winner decides shared mutable fields (label, star)', () => {
  const a = man([r('round-1', 1, [c('c1', 'Renamed-A', [v('v1', 1, { starred: false })])], { name: 'R1-A' })]);
  const b = man([r('round-1', 1, [c('c1', 'Old-B', [v('v1', 1, { starred: true })])], { name: 'R1-B' })]);

  const winA = mergeManifests(a, b, { preferA: true })!;
  assert.strictEqual(winA.rounds[0].name, 'R1-A');
  assert.strictEqual(winA.rounds[0].concepts[0].label, 'Renamed-A');
  assert.strictEqual(winA.rounds[0].concepts[0].versions[0].starred, false); // A (winner) not starred

  const winB = mergeManifests(a, b, { preferA: false })!;
  assert.strictEqual(winB.rounds[0].concepts[0].label, 'Old-B');
  assert.strictEqual(winB.rounds[0].concepts[0].versions[0].starred, true);  // B (winner) starred
});

test('merge: a unique version keeps its own metadata (star survives on the side that has it)', () => {
  const a = man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1)])])]);
  const b = man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1), v('v2', 2, { starred: true })])])]);
  // A wins metadata, but v2 only exists on B → its star is preserved
  const merged = mergeManifests(a, b, { preferA: true })!;
  const v2 = merged.rounds[0].concepts[0].versions.find(x => x.id === 'v2')!;
  assert.strictEqual(v2.starred, true);
});

test('merge: annotations union + resolved LWW', () => {
  const annA = { id: 'a1', x: null, y: null, element: null, text: 'fix', author: 'jeff', isClient: false, isAgent: false, created: '2026-01-02T00:00:00.000Z', resolved: true, parentId: null };
  const annB = { id: 'a1', x: null, y: null, element: null, text: 'fix', author: 'jeff', isClient: false, isAgent: false, created: '2026-01-02T00:00:00.000Z', resolved: false, parentId: null };
  const annB2 = { ...annB, id: 'a2', text: 'also this' };
  const a = man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1, { annotations: [annA] })])])]);
  const b = man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1, { annotations: [annB, annB2] })])])]);
  const merged = mergeManifests(a, b, { preferA: true })!;
  const anns = merged.rounds[0].concepts[0].versions[0].annotations!;
  assert.deepStrictEqual(anns.map(x => x.id).sort(), ['a1', 'a2']);
  assert.strictEqual(anns.find(x => x.id === 'a1')!.resolved, true); // A (winner) resolved
});

test('merge: versions always sorted by number after union', () => {
  const a = man([r('round-1', 1, [c('c1', 'C1', [v('v3', 3)])])]);
  const b = man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1), v('v2', 2)])])]);
  const merged = mergeManifests(a, b, { preferA: true })!;
  assert.deepStrictEqual(merged.rounds[0].concepts[0].versions.map(x => x.number), [1, 2, 3]);
});

// ===========================================================================
// syncProject — orchestration over two stores
// ===========================================================================

function memStore(label: string, seed?: Manifest, t = 0): SyncStore & { data: Manifest | null; t: number } {
  return {
    label,
    data: seed ?? null,
    t,
    async read() { return this.data; },
    async write(_c, _p, m) { this.data = m; },
    async modifiedAt() { return this.data ? this.t : null; },
  };
}

test('sync: both sides converge to the union; newer side wins metadata', async () => {
  const local = memStore('local', man([r('round-1', 1, [c('c1', 'Local-name', [v('v1', 1), v('v2', 2)])])]), 2000);
  const cloud = memStore('cloud', man([r('round-1', 1, [c('c1', 'Cloud-name', [v('v1', 1), v('v3', 3)])])]), 1000);

  const res = await syncProject(local, cloud, 'acme', 'demo');
  assert.strictEqual(res.preferred, 'local');           // local newer (t=2000)
  assert.strictEqual(res.after, 3);                       // v1,v2,v3
  assert.deepStrictEqual(local.data!.rounds[0].concepts[0].versions.map(v => v.id), ['v1', 'v2', 'v3']);
  assert.deepStrictEqual(cloud.data!.rounds[0].concepts[0].versions.map(v => v.id), ['v1', 'v2', 'v3']);
  assert.strictEqual(local.data!.rounds[0].concepts[0].label, 'Local-name');  // winner
  assert.strictEqual(cloud.data!.rounds[0].concepts[0].label, 'Local-name');  // converged
});

test('sync: first push to an empty cloud (one-sided)', async () => {
  const local = memStore('local', man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1)])])]), 5000);
  const cloud = memStore('cloud', undefined, 0);
  const res = await syncProject(local, cloud, 'acme', 'demo');
  assert.strictEqual(res.preferred, 'local');
  assert.strictEqual(cloud.data!.rounds[0].concepts[0].versions.length, 1);
});

test('sync: is idempotent — second run changes nothing', async () => {
  const local = memStore('local', man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1), v('v2', 2)])])]), 2000);
  const cloud = memStore('cloud', man([r('round-1', 1, [c('c1', 'C1', [v('v1', 1), v('v3', 3)])])]), 1000);
  await syncProject(local, cloud, 'acme', 'demo');
  const res2 = await syncProject(local, cloud, 'acme', 'demo');
  assert.strictEqual(res2.changed, false);
  assert.strictEqual(res2.after, 3);
});
