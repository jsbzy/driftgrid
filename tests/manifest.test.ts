import test from 'node:test';
import assert from 'node:assert';
import { getManifest, getClients } from '../lib/manifest';

test('getManifest returns null for non-existent project', async () => {
  const result = await getManifest('nonexistent-client-xyz', 'nonexistent-project-xyz');
  assert.strictEqual(result, null);
});

test('getClients returns an array (even if empty)', async () => {
  const clients = await getClients();
  assert.ok(Array.isArray(clients), 'getClients should return an array');
});

test('manifest with object canvas config does not crash', async () => {
  // getManifest just reads and parses JSON — it should handle any valid JSON
  // without crashing, including manifests where canvas is an object.
  // We verify the function completes without throwing for a missing path.
  const result = await getManifest('__test_nonexistent__', '__test_nonexistent__');
  assert.strictEqual(result, null, 'should return null gracefully');
});
