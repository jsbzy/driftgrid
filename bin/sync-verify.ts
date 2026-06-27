/**
 * Sync verification — REAL local SQLite ↔ REAL (test) cloud Postgres.
 * Proves syncProject converges the two actual backends, with append-mostly
 * version union surviving divergence on both sides.
 *
 * Usage (NON-prod Supabase only):
 *   set -a && . ./.env.local && set +a
 *   npx tsx bin/sync-verify.ts
 */
import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSupabaseAdmin } from '../lib/supabase';
import { getManifestDb, writeManifestDb } from '../lib/sqlite-storage';
import { getManifestPg, writeManifestPg } from '../lib/postgres-storage';
import { getDb } from '../lib/db/sqlite';
import { syncProject, type SyncStore } from '../lib/sync';
import type { Manifest, Version } from '../lib/types';

const log = (s: string) => console.log(s);
const sb = getSupabaseAdmin();

const v = (id: string, n: number, over: Partial<Version> = {}): Version => ({
  id, number: n, file: `${id}.html`, parentId: null, changelog: 'c', visible: true, starred: false,
  created: `2026-01-0${n}T00:00:00.000Z`, thumbnail: '', ...over,
});
const seed = (versions: Version[]): Manifest => ({
  project: { name: 'Demo', slug: 'demo', client: 'acme', canvas: 'desktop', created: '2026-01-01T00:00:00.000Z', links: {} },
  rounds: [{ id: 'round-1', number: 1, name: 'Round 1', createdAt: '2026-01-01T00:00:00.000Z', selects: [], concepts: [{ id: 'c1', slug: 'c1', label: 'C1', description: '', position: 0, visible: true, versions }] } as any],
  concepts: [], workingSets: [], comments: [], clientEdits: [],
});

const localStore: SyncStore = {
  label: 'local',
  read: (c, p) => getManifestDb(c, p),
  write: (c, p, m) => writeManifestDb(c, p, m),
  async modifiedAt(c, p) {
    const db = await getDb();
    const row = db.prepare('select updated_at from projects where client_slug=? and project_slug=?').get(c, p) as { updated_at: string } | undefined;
    return row ? Date.parse(row.updated_at) : null;
  },
};

function cloudStore(userId: string): SyncStore {
  return {
    label: 'cloud',
    read: (c, p) => getManifestPg(userId, c, p),
    write: (c, p, m) => writeManifestPg(userId, c, p, m),
    async modifiedAt(c, p) {
      const { data } = await sb.from('projects').select('updated_at')
        .eq('user_id', userId).eq('client_slug', c).eq('project_slug', p).maybeSingle();
      return data?.updated_at ? Date.parse(data.updated_at) : null;
    },
  };
}

async function mkUser(): Promise<string> {
  const email = `dgsync-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const { data, error } = await sb.auth.admin.createUser({ email, password: 'Test-pw-123456', email_confirm: true });
  if (error) throw new Error('createUser: ' + error.message);
  return data.user!.id;
}

const vids = (m: Manifest | null) => (m?.rounds[0].concepts[0].versions ?? []).map((x) => x.id).sort();

async function main() {
  const created: string[] = [];
  const cwd0 = process.cwd();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'dg-sync-'));
  process.chdir(tmp);  // isolate the SQLite DB under tmp/projects/.driftgrid
  try {
    log('connecting to ' + process.env.NEXT_PUBLIC_SUPABASE_URL);
    const user = await mkUser(); created.push(user);
    const cloud = cloudStore(user);

    // 1) Local-only project → first sync pushes it up
    await writeManifestDb('acme', 'demo', seed([v('v1', 1)]));
    let res = await syncProject(localStore, cloud, 'acme', 'demo');
    assert.deepStrictEqual(vids(await getManifestPg(user, 'acme', 'demo')), ['v1'], 'push: cloud got v1');
    log(`✓ first sync pushed local→cloud (preferred=${res.preferred}, after=${res.after})`);

    // 2) Diverge: local drifts to v2, cloud drifts to v3 (different ids)
    await writeManifestDb('acme', 'demo', seed([v('v1', 1), v('v2', 2)]));
    await writeManifestPg(user, 'acme', 'demo', seed([v('v1', 1), v('v3', 3)]));

    // 3) Sync → append-mostly union: BOTH sides converge to v1,v2,v3
    res = await syncProject(localStore, cloud, 'acme', 'demo');
    assert.deepStrictEqual(vids(await getManifestDb('acme', 'demo')), ['v1', 'v2', 'v3'], 'union: local has all 3');
    assert.deepStrictEqual(vids(await getManifestPg(user, 'acme', 'demo')), ['v1', 'v2', 'v3'], 'union: cloud has all 3');
    log(`✓ divergent drift on both sides → union converged to v1,v2,v3 (no design lost)`);

    // 4) Idempotent: a second sync changes nothing
    res = await syncProject(localStore, cloud, 'acme', 'demo');
    assert.strictEqual(res.changed, false, 'second sync is a no-op');
    log('✓ re-sync is idempotent (no-op)');

    log('\n🎉 SYNC VERIFIED — real local SQLite ↔ real cloud Postgres converge.');
  } finally {
    process.chdir(cwd0);
    for (const id of created) await sb.auth.admin.deleteUser(id).catch(() => {});
    await fs.rm(tmp, { recursive: true, force: true });
    log(`(cleaned up ${created.length} test user + local temp)`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
