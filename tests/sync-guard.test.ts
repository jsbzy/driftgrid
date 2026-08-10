import test from 'node:test';
import assert from 'node:assert';
import { decideSyncSafety, explainBlockedSync } from '../lib/sync-guard';

test('first publish: no cloud copy is always safe', () => {
  const r = decideSyncSafety(null, { exists: false, hash: null });
  assert.deepStrictEqual(r, { safe: true, reason: 'first-publish' });
  // Even with a stale marker (cloud copy was deleted), pushing is safe.
  const r2 = decideSyncSafety('abc', { exists: false, hash: null });
  assert.deepStrictEqual(r2, { safe: true, reason: 'first-publish' });
});

test('cloud unchanged since our last push is safe', () => {
  const r = decideSyncSafety('abc', { exists: true, hash: 'abc' });
  assert.deepStrictEqual(r, { safe: true, reason: 'cloud-unchanged' });
});

test('cloud changed since our last push blocks', () => {
  const r = decideSyncSafety('abc', { exists: true, hash: 'def' });
  assert.deepStrictEqual(r, { safe: false, reason: 'cloud-changed' });
});

test('cloud exists but this machine never pushed blocks (unknown provenance)', () => {
  const r = decideSyncSafety(null, { exists: true, hash: 'abc' });
  assert.deepStrictEqual(r, { safe: false, reason: 'unknown-provenance' });
});

test('blocked reasons have human-readable explanations', () => {
  assert.match(explainBlockedSync('cloud-changed'), /changed since/i);
  assert.match(explainBlockedSync('unknown-provenance'), /never pushed/i);
});
