#!/usr/bin/env tsx
/**
 * Read-only manifest sanity check.
 *
 * Walks every round/concept/version in `projects/<client>/<project>/manifest.json`
 * and reports any of:
 *   - version.file is missing from disk
 *   - version.thumbnail is set but doesn't match the canonical form
 *     `.thumbs/${concept.id}-${version.id}.webp`
 *   - version.thumbnail file doesn't exist on disk
 *   - duplicate concept.id within a single round
 *   - duplicate version.id within a single concept
 *   - concept missing required fields (label, slug, id)
 *
 * Does NOT modify anything. Run before and after risky agent sessions to
 * verify the manifest is sane.
 *
 * Usage:
 *   npx tsx bin/manifest-doctor.ts <client>/<project>
 *   npx tsx bin/manifest-doctor.ts recovryai/demo-v4
 *   npx tsx bin/manifest-doctor.ts --all          # all projects
 *
 * Exit code 0 if clean, 1 if any issues found.
 */

import { promises as fs } from 'fs';
import path from 'path';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

type Issue = {
  severity: 'error' | 'warn';
  round: string;
  concept: string;
  version?: string;
  field?: string;
  message: string;
  suggested?: string;
};

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function auditProject(client: string, project: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  const projectDir = path.join(PROJECTS_DIR, client, project);
  const manifestPath = path.join(projectDir, 'manifest.json');

  let raw: string;
  try {
    raw = await fs.readFile(manifestPath, 'utf-8');
  } catch {
    return [{ severity: 'error', round: '-', concept: '-', message: `manifest.json not found at ${manifestPath}` }];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let manifest: any;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    return [{ severity: 'error', round: '-', concept: '-', message: `manifest.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}` }];
  }

  // Audit each round (treat legacy top-level concepts as round-1)
  const rounds = manifest.rounds?.length
    ? manifest.rounds
    : [{ id: 'legacy', number: 0, name: 'Legacy (top-level)', concepts: manifest.concepts ?? [] }];

  for (const round of rounds) {
    const seenConcepts = new Set<string>();

    for (const concept of round.concepts ?? []) {
      // Missing required fields
      if (!concept.id) issues.push({ severity: 'error', round: round.id, concept: '(missing id)', message: 'concept has no id' });
      if (!concept.label) issues.push({ severity: 'warn', round: round.id, concept: concept.id ?? '?', message: 'concept has no label' });
      if (!concept.slug) issues.push({ severity: 'warn', round: round.id, concept: concept.id ?? '?', message: 'concept has no slug' });

      // Duplicate concept.id within round
      if (concept.id && seenConcepts.has(concept.id)) {
        issues.push({
          severity: 'error',
          round: round.id,
          concept: concept.id,
          message: `duplicate concept.id within round ${round.id}`,
        });
      }
      if (concept.id) seenConcepts.add(concept.id);

      const seenVersions = new Set<string>();
      for (const version of concept.versions ?? []) {
        if (!version.id) {
          issues.push({ severity: 'error', round: round.id, concept: concept.id ?? '?', message: 'version has no id' });
          continue;
        }

        if (seenVersions.has(version.id)) {
          issues.push({
            severity: 'error',
            round: round.id,
            concept: concept.id ?? '?',
            version: version.id,
            message: 'duplicate version.id within concept',
          });
        }
        seenVersions.add(version.id);

        // version.file existence
        if (version.file) {
          const fileAbs = path.resolve(projectDir, version.file);
          if (!(await exists(fileAbs))) {
            issues.push({
              severity: 'error',
              round: round.id,
              concept: concept.id,
              version: version.id,
              field: 'file',
              message: `version.file points to missing file: ${version.file}`,
            });
          }
        } else {
          issues.push({
            severity: 'error',
            round: round.id,
            concept: concept.id,
            version: version.id,
            field: 'file',
            message: 'version.file is empty',
          });
        }

        // version.thumbnail must match the canonical convention
        const canonical = `.thumbs/${concept.id}-${version.id}.webp`;
        if (version.thumbnail) {
          if (version.thumbnail !== canonical && version.thumbnail !== `.thumbs/${concept.id}-${version.id}.png`) {
            issues.push({
              severity: 'error',
              round: round.id,
              concept: concept.id,
              version: version.id,
              field: 'thumbnail',
              message: `thumbnail does not match canonical form (got "${version.thumbnail}")`,
              suggested: canonical,
            });
          } else {
            // Field is canonical — check the underlying file exists
            const thumbAbs = path.resolve(projectDir, version.thumbnail);
            if (!(await exists(thumbAbs))) {
              issues.push({
                severity: 'warn',
                round: round.id,
                concept: concept.id,
                version: version.id,
                field: 'thumbnail',
                message: `thumbnail file missing on disk: ${version.thumbnail} (will regenerate on next view)`,
              });
            }
          }
        }
      }
    }
  }

  return issues;
}

async function listAllProjects(): Promise<Array<{ client: string; project: string }>> {
  const out: Array<{ client: string; project: string }> = [];
  const clients = await fs.readdir(PROJECTS_DIR).catch(() => []);
  for (const client of clients) {
    if (client.startsWith('.') || client === '__smoke__') continue;
    const clientDir = path.join(PROJECTS_DIR, client);
    if (!(await fs.stat(clientDir).catch(() => null))?.isDirectory()) continue;
    const projects = await fs.readdir(clientDir).catch(() => []);
    for (const project of projects) {
      if (project === 'brand' || project.startsWith('.')) continue;
      const projDir = path.join(clientDir, project);
      if (!(await fs.stat(projDir).catch(() => null))?.isDirectory()) continue;
      if (await exists(path.join(projDir, 'manifest.json'))) {
        out.push({ client, project });
      }
    }
  }
  return out;
}

function formatIssue(client: string, project: string, issue: Issue): string {
  const sev = issue.severity === 'error' ? 'ERROR' : 'WARN ';
  const ctx = [`r=${issue.round}`, `c=${issue.concept}`];
  if (issue.version) ctx.push(`v=${issue.version}`);
  if (issue.field) ctx.push(`field=${issue.field}`);
  const suggest = issue.suggested ? `\n      → suggested: ${issue.suggested}` : '';
  return `  [${sev}] ${client}/${project} [${ctx.join(' ')}] ${issue.message}${suggest}`;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    process.stdout.write('Usage: npx tsx bin/manifest-doctor.ts <client>/<project> | --all\n');
    process.exit(args.length === 0 ? 1 : 0);
  }

  let targets: Array<{ client: string; project: string }>;
  if (args[0] === '--all') {
    targets = await listAllProjects();
  } else {
    const parts = args[0].split('/');
    if (parts.length !== 2) {
      process.stderr.write('Expected <client>/<project>\n');
      process.exit(1);
    }
    targets = [{ client: parts[0], project: parts[1] }];
  }

  let totalErrors = 0;
  let totalWarns = 0;

  for (const { client, project } of targets) {
    const issues = await auditProject(client, project);
    const errors = issues.filter(i => i.severity === 'error').length;
    const warns = issues.filter(i => i.severity === 'warn').length;
    totalErrors += errors;
    totalWarns += warns;

    if (issues.length === 0) {
      process.stdout.write(`✓ ${client}/${project} — clean\n`);
    } else {
      process.stdout.write(`✗ ${client}/${project} — ${errors} error(s), ${warns} warning(s)\n`);
      for (const issue of issues) {
        process.stdout.write(formatIssue(client, project, issue) + '\n');
      }
    }
  }

  process.stdout.write(`\nTotal: ${totalErrors} error(s), ${totalWarns} warning(s) across ${targets.length} project(s)\n`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

main().catch(err => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(2);
});
