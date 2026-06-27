#!/usr/bin/env tsx
/**
 * Phase 2 — backfill the local SQLite DB from manifest.json files, with
 * manifest-doctor-style parity validation.
 *
 * For each project it: reads the manifest via the FILE backend, writes it into
 * projects/.driftgrid/db.sqlite via the DB backend, reads it back, and verifies
 * the two are structurally equal (lib/db/parity). The file model is never
 * modified — this is a one-way backfill into the new DB plus a safety check.
 *
 * Usage:
 *   npx tsx bin/migrate-to-db.ts <client>/<project>
 *   npx tsx bin/migrate-to-db.ts --all            # every project (default)
 *   npx tsx bin/migrate-to-db.ts --all --check     # validate parity only, no write
 *
 * Exit code 0 if every project migrated + matched, 1 otherwise.
 *
 * NOTE: cloud (Postgres) migration is not implemented here — it waits on the
 * Postgres write backend (Phase 1 notes, open question #2). This tool covers the
 * local SQLite mirror only.
 */

import { getClients, getManifest } from '../lib/manifest';
import { writeManifestDb, getManifestDb } from '../lib/sqlite-storage';
import { compareManifests } from '../lib/db/parity';

interface Row {
  project: string;
  status: 'ok' | 'mismatch' | 'error';
  detail?: string;
}

async function migrateOne(client: string, project: string, checkOnly: boolean): Promise<Row> {
  const key = `${client}/${project}`;
  const fileManifest = await getManifest(client, project);
  if (!fileManifest) return { project: key, status: 'error', detail: 'file manifest not found' };

  try {
    if (!checkOnly) await writeManifestDb(client, project, fileManifest);
    const dbManifest = await getManifestDb(client, project);
    if (!dbManifest) return { project: key, status: 'error', detail: 'DB manifest missing after write (run without --check first?)' };

    const parity = compareManifests(fileManifest, dbManifest);
    if (parity.equal) return { project: key, status: 'ok' };
    return {
      project: key,
      status: 'mismatch',
      detail: `first diff @${parity.firstDiff}\n      file: …${parity.aContext}…\n      db:   …${parity.bContext}…`,
    };
  } catch (e) {
    return { project: key, status: 'error', detail: (e as Error).message };
  }
}

async function resolveTargets(arg: string | undefined): Promise<{ client: string; project: string }[]> {
  if (arg && arg !== '--all') {
    const [client, project] = arg.split('/');
    if (!client || !project) throw new Error(`expected <client>/<project>, got "${arg}"`);
    return [{ client, project }];
  }
  const clients = await getClients();
  return clients.flatMap((c) => c.projects.map((p) => ({ client: c.slug, project: p.slug })));
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const target = args.find((a) => a !== '--check' && a !== '--all');

  const targets = await resolveTargets(target ?? '--all');
  if (targets.length === 0) {
    console.log('No projects found.');
    process.exit(0);
  }

  console.log(`${checkOnly ? 'Validating' : 'Migrating'} ${targets.length} project(s) → local SQLite DB\n`);

  const rows: Row[] = [];
  for (const { client, project } of targets) {
    const row = await migrateOne(client, project, checkOnly);
    rows.push(row);
    const icon = row.status === 'ok' ? '✓' : row.status === 'mismatch' ? '✗' : '!';
    console.log(`  [${icon}] ${row.project}${row.detail ? `\n      ${row.detail}` : ''}`);
  }

  const ok = rows.filter((r) => r.status === 'ok').length;
  const mismatch = rows.filter((r) => r.status === 'mismatch').length;
  const error = rows.filter((r) => r.status === 'error').length;
  console.log(`\nTotal: ${ok} ok, ${mismatch} mismatch, ${error} error across ${rows.length} project(s)`);
  process.exit(mismatch + error > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
