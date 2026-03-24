import test from 'node:test';
import assert from 'node:assert';
import { filterVisibleManifest } from '../lib/filterManifest';
import type { Manifest, Concept, Version } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVersion(id: string, visible: boolean): Version {
  return {
    id,
    number: 1,
    file: `concept/v1.html`,
    parentId: null,
    changelog: 'Initial',
    visible,
    starred: false,
    created: new Date().toISOString(),
    thumbnail: '',
  };
}

function makeConcept(id: string, visible: boolean, versions: Version[]): Concept {
  return {
    id,
    label: id,
    description: `${id} description`,
    position: 0,
    visible,
    versions,
  };
}

function makeManifest(concepts: Concept[]): Manifest {
  return {
    project: {
      name: 'Test Project',
      slug: 'test-project',
      client: 'test-client',
      canvas: 'desktop',
      created: new Date().toISOString(),
      links: {},
    },
    concepts,
    workingSets: [],
    comments: [],
    clientEdits: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('filterVisibleManifest removes hidden concepts', () => {
  const manifest = makeManifest([
    makeConcept('visible-concept', true, [makeVersion('v1', true)]),
    makeConcept('hidden-concept', false, [makeVersion('v2', true)]),
  ]);

  const filtered = filterVisibleManifest(manifest);

  assert.strictEqual(filtered.concepts.length, 1, 'should have 1 visible concept');
  assert.strictEqual(filtered.concepts[0].id, 'visible-concept');
});

test('filterVisibleManifest removes hidden versions', () => {
  const manifest = makeManifest([
    makeConcept('concept-1', true, [
      makeVersion('v1', true),
      makeVersion('v2', false),
      makeVersion('v3', true),
    ]),
  ]);

  const filtered = filterVisibleManifest(manifest);

  assert.strictEqual(filtered.concepts.length, 1, 'concept should remain');
  assert.strictEqual(filtered.concepts[0].versions.length, 2, 'should have 2 visible versions');

  const versionIds = filtered.concepts[0].versions.map(v => v.id);
  assert.ok(versionIds.includes('v1'), 'v1 should be present');
  assert.ok(!versionIds.includes('v2'), 'v2 should be filtered out');
  assert.ok(versionIds.includes('v3'), 'v3 should be present');
});

test('filterVisibleManifest removes concept when all versions are hidden', () => {
  const manifest = makeManifest([
    makeConcept('all-hidden', true, [
      makeVersion('v1', false),
      makeVersion('v2', false),
    ]),
    makeConcept('has-visible', true, [
      makeVersion('v3', true),
    ]),
  ]);

  const filtered = filterVisibleManifest(manifest);

  assert.strictEqual(filtered.concepts.length, 1, 'should remove concept with all hidden versions');
  assert.strictEqual(filtered.concepts[0].id, 'has-visible');
});

test('filterVisibleManifest keeps visible items intact', () => {
  const manifest = makeManifest([
    makeConcept('concept-1', true, [
      makeVersion('v1', true),
      makeVersion('v2', true),
    ]),
    makeConcept('concept-2', true, [
      makeVersion('v3', true),
    ]),
  ]);

  const filtered = filterVisibleManifest(manifest);

  assert.strictEqual(filtered.concepts.length, 2, 'all concepts should remain');
  assert.strictEqual(filtered.concepts[0].versions.length, 2, 'all versions in concept-1 should remain');
  assert.strictEqual(filtered.concepts[1].versions.length, 1, 'all versions in concept-2 should remain');

  // Project metadata should be preserved
  assert.strictEqual(filtered.project.name, 'Test Project');
  assert.strictEqual(filtered.project.slug, 'test-project');
});
