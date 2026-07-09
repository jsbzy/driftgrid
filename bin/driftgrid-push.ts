#!/usr/bin/env tsx
/**
 * driftgrid push — headless project push to the cloud (driftgrid.ai).
 *
 * The browser Sync/Share flow needs a signed-in session. This CLI is its
 * headless counterpart: it authenticates with a personal access token
 * (`dg_pat_…`) instead of a browser popup, so an agent or CI job on a dev box
 * can mirror a project to the cloud and optionally mint a public share link.
 *
 * Usage:
 *   npm run push -- <client>/<project> [--share] [--include-media] [--force]
 *   tsx bin/driftgrid-push.ts <client>/<project> [--share]
 *
 * Auth (first found wins):
 *   • DRIFTGRID_PAT env var
 *   • .driftgrid-pat file at the repo root (gitignored)
 *
 * Overwrite guard: pushing mirrors local over cloud. To avoid destroying cloud
 * changes (web edits, another machine), the CLI records the manifest hash it
 * pushed in .driftgrid-sync.json inside the project dir, and refuses the next
 * push if the cloud manifest no longer matches — unless --force is passed.
 * See lib/sync-guard.ts.
 *
 * The target cloud defaults to https://driftgrid.ai, overridable with
 * NEXT_PUBLIC_DRIFTGRID_CLOUD_URL.
 */

import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import path from 'path';
import { collectFiles } from '../lib/cloud-files';
import { pushFilesToCloud, createCloudShare, verifyToken, getCloudManifestState } from '../lib/cloud-client';
import { decideSyncSafety, explainBlockedSync } from '../lib/sync-guard';
import { areValidSlugs } from '../lib/slug';

const SYNC_MARKER = '.driftgrid-sync.json';

const ROOT = path.resolve(__dirname, '..');
const PROJECTS_DIR = path.join(ROOT, 'projects');

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function loadPat(): Promise<string> {
  if (process.env.DRIFTGRID_PAT?.trim()) return process.env.DRIFTGRID_PAT.trim();
  try {
    const fromFile = (await fs.readFile(path.join(ROOT, '.driftgrid-pat'), 'utf-8')).trim();
    if (fromFile) return fromFile;
  } catch {
    // no file — fall through
  }
  fail('No access token. Set DRIFTGRID_PAT or create a .driftgrid-pat file.\n' +
    '  Mint one at driftgrid.ai/account → access tokens.');
}

/** Read the hash recorded by this machine's last push, or null. */
async function readSyncMarker(projectDir: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(projectDir, SYNC_MARKER), 'utf-8');
    const parsed = JSON.parse(raw);
    return typeof parsed.lastPushedManifestHash === 'string' ? parsed.lastPushedManifestHash : null;
  } catch {
    return null;
  }
}

async function writeSyncMarker(projectDir: string, hash: string): Promise<void> {
  const marker = { lastPushedManifestHash: hash, pushedAt: new Date().toISOString() };
  await fs.writeFile(path.join(projectDir, SYNC_MARKER), JSON.stringify(marker, null, 2) + '\n');
}

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('-'));
  const doShare = args.includes('--share');
  const includeMedia = args.includes('--include-media');
  const force = args.includes('--force');

  if (!target || !target.includes('/')) {
    fail('Usage: driftgrid push <client>/<project> [--share] [--include-media] [--force]');
  }

  const [client, project] = target.split('/');
  if (!areValidSlugs(client, project)) {
    fail(`Invalid client/project slug: ${target}`);
  }

  const projectDir = path.join(PROJECTS_DIR, client, project);
  try {
    await fs.stat(path.join(projectDir, 'manifest.json'));
  } catch {
    fail(`No project found at projects/${client}/${project} (missing manifest.json)`);
  }

  const pat = await loadPat();

  // Verify the credential up front so failures are clear, not buried in a batch.
  const verified = await verifyToken(pat).catch(() => null);
  if (!verified?.valid) {
    fail('Access token rejected by the cloud (invalid, expired, or revoked).');
  }
  console.log(`→ authenticated as ${verified.email || verified.userId} (${verified.tier})`);

  // --- Overwrite guard (see lib/sync-guard.ts) ---
  const localManifestBytes = await fs.readFile(path.join(projectDir, 'manifest.json'));
  const localManifestHash = createHash('sha256').update(localManifestBytes).digest('hex');

  const cloudState = await getCloudManifestState(pat, client, project).catch((e) => {
    // Fail closed: if we can't determine cloud state we must not blind-write.
    fail(`Could not check the cloud copy before pushing (${e instanceof Error ? e.message : e}). ` +
      'Re-run when the cloud is reachable, or pass --force to push anyway.');
  });

  const safety = decideSyncSafety(await readSyncMarker(projectDir), cloudState);
  if (!safety.safe) {
    if (!force) {
      fail(`${explainBlockedSync(safety.reason)}\n` +
        '  To inspect the cloud copy: open the project on driftgrid.ai first.\n' +
        '  To overwrite it anyway:   re-run with --force.');
    }
    console.log(`! overwriting cloud copy (--force, ${safety.reason})`);
  }

  // Collect the whole project directory (the sync marker is local bookkeeping — never uploaded).
  const { files: allFiles, skipped } = await collectFiles(projectDir, '', { includeMedia });
  const files = allFiles.filter((f) => f.path !== SYNC_MARKER);
  if (files.length === 0) {
    fail('No files to push.');
  }
  console.log(`→ pushing ${files.length} file(s) from projects/${client}/${project}…`);

  const result = await pushFilesToCloud(pat, client, project, files, (uploaded, total) => {
    process.stdout.write(`\r  ${uploaded}/${total} uploaded`);
  });
  process.stdout.write('\n');

  if (skipped.length > 0) {
    console.log(`  (skipped ${skipped.length} file(s): media/oversized — pass --include-media to include)`);
  }

  if (!result.success) {
    console.error(`✗ ${result.failed}/${result.total} file(s) failed:`);
    for (const e of result.errors ?? []) console.error(`    ${e}`);
    process.exit(1);
  }
  console.log(`✓ synced ${result.uploaded} file(s) to the cloud`);

  // Record what we pushed so the next push can detect cloud-side changes.
  await writeSyncMarker(projectDir, localManifestHash);

  if (doShare) {
    const share = await createCloudShare(pat, client, project);
    if ('error' in share) {
      fail(`Share failed: ${share.error}`);
    }
    console.log(`✓ public share: ${share.url}`);
  } else {
    console.log('  (run with --share to also mint a public client link)');
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
