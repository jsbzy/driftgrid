import test from 'node:test';
import assert from 'node:assert';
import {
  computeCanvasLayout,
  getColumnBounds,
  getCardBounds,
} from '../lib/hooks/useCanvasLayout';
import type { Concept } from '../lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConcept(id: string, label: string, versionCount: number): Concept {
  const versions = Array.from({ length: versionCount }, (_, i) => ({
    id: `${id}-v${i + 1}`,
    number: i + 1,
    file: `${id}/v${i + 1}.html`,
    parentId: i > 0 ? `${id}-v${i}` : null,
    changelog: `Version ${i + 1}`,
    visible: true,
    starred: false,
    created: new Date().toISOString(),
    thumbnail: '',
  }));

  return {
    id,
    label,
    description: `${label} concept`,
    position: 0,
    visible: true,
    versions,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('computeCanvasLayout with empty concepts returns zero dimensions', () => {
  const layout = computeCanvasLayout([], '16 / 9');

  assert.strictEqual(layout.cards.length, 0, 'should have no cards');
  assert.strictEqual(layout.labels.length, 0, 'should have no labels');
  // totalWidth and totalHeight should still include padding (CANVAS_PADDING * 2 = 160)
  assert.strictEqual(layout.totalWidth, 160, 'totalWidth should be 2 * padding');
  assert.strictEqual(layout.totalHeight, 160, 'totalHeight should be 2 * padding');
});

test('computeCanvasLayout with one concept produces correct card positions', () => {
  const concepts = [makeConcept('concept-1', 'Concept 1', 2)];
  const layout = computeCanvasLayout(concepts, '16 / 9');

  assert.strictEqual(layout.cards.length, 2, 'should have 2 cards');
  assert.strictEqual(layout.labels.length, 1, 'should have 1 label');
  assert.strictEqual(layout.cardWidth, 440, 'card width should be 440');

  // Card positions should have positive x, y
  for (const card of layout.cards) {
    assert.ok(card.x > 0, `card x (${card.x}) should be positive`);
    assert.ok(card.y > 0, `card y (${card.y}) should be positive`);
  }

  // totalWidth > 0 and totalHeight > 0
  assert.ok(layout.totalWidth > 0, 'totalWidth should be positive');
  assert.ok(layout.totalHeight > 0, 'totalHeight should be positive');
});

test('cards are positioned with latest version at top (reversed)', () => {
  const concepts = [makeConcept('concept-1', 'Concept 1', 3)];
  const layout = computeCanvasLayout(concepts, '16 / 9');

  // The card at the top (smallest y) should have the highest versionIndex (latest)
  const sorted = [...layout.cards].sort((a, b) => a.y - b.y);

  // First card (top) should be the latest version (versionIndex = 2)
  assert.strictEqual(sorted[0].versionIndex, 2, 'top card should be latest version (index 2)');
  // Last card (bottom) should be the earliest version (versionIndex = 0)
  assert.strictEqual(sorted[sorted.length - 1].versionIndex, 0, 'bottom card should be earliest version (index 0)');
});

test('getColumnBounds returns valid bounds', () => {
  const concepts = [
    makeConcept('concept-1', 'Concept 1', 2),
    makeConcept('concept-2', 'Concept 2', 3),
  ];
  const layout = computeCanvasLayout(concepts, '16 / 9');

  const bounds = getColumnBounds(layout, 0);
  assert.ok(bounds.w > 0, 'column width should be positive');
  assert.ok(bounds.h > 0, 'column height should be positive');

  // Non-existent column should return zeroed bounds
  const empty = getColumnBounds(layout, 99);
  assert.strictEqual(empty.w, 0, 'non-existent column should have 0 width');
  assert.strictEqual(empty.h, 0, 'non-existent column should have 0 height');
});

test('getCardBounds returns valid bounds', () => {
  const concepts = [makeConcept('concept-1', 'Concept 1', 2)];
  const layout = computeCanvasLayout(concepts, '16 / 9');

  const bounds = getCardBounds(layout, 0, 0);
  assert.ok(bounds.w > 0, 'card width should be positive');
  assert.ok(bounds.h > 0, 'card height should be positive');

  // Non-existent card should return zeroed bounds
  const empty = getCardBounds(layout, 0, 99);
  assert.strictEqual(empty.w, 0, 'non-existent card should have 0 width');
  assert.strictEqual(empty.h, 0, 'non-existent card should have 0 height');
});
