/**
 * Cloud verification against a REAL (test) Supabase project — the manual check
 * PGlite can't do: auth.users FK, live PostgREST, and tenant isolation. Creates
 * two throwaway auth users, round-trips a manifest, checks pruning + scoping,
 * and deletes the users (cascading their data) on the way out.
 *
 * Usage (against a NON-prod project only):
 *   set -a && . ./.env.local && set +a   # NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + DRIFT_CLOUD=1
 *   npx tsx bin/cloud-verify.ts
 */
import assert from 'node:assert';
import { getSupabaseAdmin } from '../lib/supabase';
import { writeManifestPg, getManifestPg, getClientsPg } from '../lib/postgres-storage';
import type { Manifest } from '../lib/types';

async function main() {
const sb = getSupabaseAdmin();
const log = (s: string) => console.log(s);

function fixture(): Manifest {
  const concept: any = {
    id: 'concept-open', slug: 'open', label: '01 · Open', description: 'title', position: 0, visible: true,
    versions: [
      { id: 'v-open-1', number: 1, file: 'open/v1.html', parentId: null, changelog: 'wire', visible: true, starred: false, created: '2026-01-01T00:00:00.000Z', thumbnail: '.thumbs/concept-open-v-open-1.webp' },
      { id: 'v-open-2', number: 2, file: 'open/v2.html', parentId: 'v-open-1', changelog: 'v2', visible: true, starred: true, created: '2026-01-02T00:00:00.000Z', thumbnail: '.thumbs/concept-open-v-open-2.webp',
        annotations: [{ id: 'a1', x: 0.5, y: 0.25, element: null, text: 'tighten', author: 'jeff', isClient: false, isAgent: false, created: '2026-01-02T01:00:00.000Z', resolved: false, parentId: null }] },
    ],
  };
  return {
    project: { name: 'Demo', slug: 'demo', client: 'acme', canvas: 'landscape-16-9', created: '2026-01-01T00:00:00.000Z', links: {} },
    rounds: [{ id: 'round-1', number: 1, name: 'Round 1', createdAt: '2026-01-01T00:00:00.000Z', selects: [{ conceptId: 'concept-open', versionId: 'v-open-2' }], concepts: [concept] } as any],
    concepts: [], workingSets: [], comments: [], clientEdits: [],
  };
}

async function mkUser(): Promise<string> {
  const email = `dgtest-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: 'Test-pw-123456', email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  return data.user!.id;
}

const created: string[] = [];
try {
  log('connecting to ' + process.env.NEXT_PUBLIC_SUPABASE_URL);

  const user1 = await mkUser(); created.push(user1);
  log('✓ created test user 1');

  await writeManifestPg(user1, 'acme', 'demo', fixture());
  log('✓ writeManifestPg — manifest saved via write_manifest RPC');

  const got = await getManifestPg(user1, 'acme', 'demo');
  assert.ok(got, 'read back null');
  assert.strictEqual(got!.rounds.length, 1, 'round count');
  assert.strictEqual(got!.rounds[0].concepts.length, 1, 'concept count');
  const vs = got!.rounds[0].concepts[0].versions;
  assert.deepStrictEqual(vs.map(v => v.id), ['v-open-1', 'v-open-2'], 'version order');
  assert.strictEqual(vs[1].starred, true, 'starred preserved');
  assert.strictEqual(vs[1].created, '2026-01-02T00:00:00.000Z', 'ISO timestamp exact');
  assert.strictEqual(vs[1].annotations![0].x, 0.5, 'float coord preserved');
  assert.deepStrictEqual(got!.rounds[0].selects, [{ conceptId: 'concept-open', versionId: 'v-open-2' }], 'selects preserved');
  assert.strictEqual(got!.project.userId, user1, 'owner stamped');
  log('✓ getManifestPg — read back, full structural parity (timestamps, floats, stars, selects)');

  const clients = await getClientsPg(user1);
  assert.strictEqual(clients.length, 1, 'client count');
  assert.strictEqual(clients[0].projects.length, 1, 'project count');
  assert.strictEqual(clients[0].projects[0].versionCount, 2, 'version count in listing');
  log(`✓ getClientsPg — dashboard listing correct (${clients[0].slug}, ${clients[0].projects[0].versionCount} versions)`);

  // re-write with a version removed → prune must drop it (atomic upsert+prune)
  const m2 = fixture();
  m2.rounds[0].concepts[0].versions = m2.rounds[0].concepts[0].versions.slice(0, 1);
  await writeManifestPg(user1, 'acme', 'demo', m2);
  const after = await getManifestPg(user1, 'acme', 'demo');
  assert.deepStrictEqual(after!.rounds[0].concepts[0].versions.map(v => v.id), ['v-open-1'], 'prune removed v-open-2');
  log('✓ re-write prunes removed children (atomic)');

  // tenant scoping: a different user must NOT see user1's project
  const user2 = await mkUser(); created.push(user2);
  const leak = await getManifestPg(user2, 'acme', 'demo');
  assert.strictEqual(leak, null, 'TENANT LEAK: user2 read user1 project!');
  const leak2 = await getClientsPg(user2);
  assert.strictEqual(leak2.length, 0, 'TENANT LEAK: user2 listing shows user1 projects!');
  log('✓ tenant scoping — user 2 sees NOTHING of user 1 (isolation holds)');

  log('\n🎉 ALL CLOUD CHECKS PASSED against real Supabase.');
} finally {
  for (const id of created) {
    await sb.auth.admin.deleteUser(id).catch(() => {});
  }
  log(`(cleaned up ${created.length} test users + their data via cascade)`);
}

}

main().catch((e) => { console.error(e); process.exit(1); });
