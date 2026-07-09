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
 *   npm run push -- <client>/<project> [--share] [--include-media]
 *   tsx bin/driftgrid-push.ts <client>/<project> [--share]
 *
 * Auth (first found wins):
 *   • DRIFTGRID_PAT env var
 *   • .driftgrid-pat file at the repo root (gitignored)
 *
 * The target cloud defaults to https://driftgrid.ai, overridable with
 * NEXT_PUBLIC_DRIFTGRID_CLOUD_URL.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { collectFiles } from '../lib/cloud-files';
import { pushFilesToCloud, createCloudShare, verifyToken } from '../lib/cloud-client';
import { areValidSlugs } from '../lib/slug';

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

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('-'));
  const doShare = args.includes('--share');
  const includeMedia = args.includes('--include-media');

  if (!target || !target.includes('/')) {
    fail('Usage: driftgrid push <client>/<project> [--share] [--include-media]');
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

  // Collect the whole project directory.
  const { files, skipped } = await collectFiles(projectDir, '', { includeMedia });
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
