/**
 * driftgrid push — Upload a local project to DriftGrid Cloud
 *
 * Reads a local project's manifest and HTML files, then pushes
 * them to the cloud via the API.
 *
 * Usage:
 *   driftgrid push                    # push all projects
 *   driftgrid push <client>/<project> # push a specific project
 */

import { promises as fs } from 'fs';
import path from 'path';

const CONFIG_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.driftgrid');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');
const PROJECTS_DIR = path.join(process.cwd(), 'projects');

interface CloudConfig {
  url: string;
  apiKey: string;
  workspaceId: string;
  workspaceName: string;
}

interface PushStats {
  projects: number;
  files: number;
  bytes: number;
  errors: string[];
}

async function loadConfig(): Promise<CloudConfig> {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    console.error('  Not logged in. Run `driftgrid login` first.\n');
    process.exit(1);
  }
}

async function collectFiles(dir: string, base: string): Promise<{ relative: string; absolute: string }[]> {
  const files: { relative: string; absolute: string }[] = [];

  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = path.join(base, entry.name);

    // Skip hidden dirs and thumbs (they get regenerated)
    if (entry.name.startsWith('.')) continue;

    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolute, relative));
    } else {
      files.push({ relative, absolute });
    }
  }

  return files;
}

async function pushProject(
  config: CloudConfig,
  clientSlug: string,
  projectSlug: string,
  stats: PushStats,
): Promise<void> {
  const projectDir = path.join(PROJECTS_DIR, clientSlug, projectSlug);

  // Read manifest
  let manifest;
  try {
    const data = await fs.readFile(path.join(projectDir, 'manifest.json'), 'utf-8');
    manifest = JSON.parse(data);
  } catch {
    stats.errors.push(`${clientSlug}/${projectSlug}: No manifest.json found`);
    return;
  }

  console.log(`  Pushing ${clientSlug}/${projectSlug}...`);

  // Ensure project exists on cloud
  const createRes = await fetch(`${config.url}/api/cloud/push/project`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      workspaceId: config.workspaceId,
      clientSlug,
      projectSlug,
      manifest,
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({ error: 'Unknown error' }));
    stats.errors.push(`${clientSlug}/${projectSlug}: ${err.error}`);
    return;
  }

  // Collect all files in the project directory
  const files = await collectFiles(projectDir, '');

  // Upload each file
  let fileCount = 0;
  let byteCount = 0;

  for (const file of files) {
    // Skip manifest (already sent above)
    if (file.relative === 'manifest.json') continue;

    try {
      const data = await fs.readFile(file.absolute);
      const filePath = path.join(clientSlug, projectSlug, file.relative);

      const uploadRes = await fetch(`${config.url}/api/cloud/push/file`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'X-File-Path': filePath,
          'Content-Type': 'application/octet-stream',
        },
        body: data,
      });

      if (uploadRes.ok) {
        fileCount++;
        byteCount += data.length;
        process.stdout.write(`    ${fileCount}/${files.length - 1} files\r`);
      } else {
        stats.errors.push(`${filePath}: Upload failed (${uploadRes.status})`);
      }
    } catch (err) {
      stats.errors.push(`${file.relative}: ${err instanceof Error ? err.message : 'Read error'}`);
    }
  }

  console.log(`    ${fileCount} files (${formatBytes(byteCount)})`);

  // Push brand assets too
  const brandDir = path.join(PROJECTS_DIR, clientSlug, 'brand');
  try {
    const brandFiles = await collectFiles(brandDir, '');
    let brandCount = 0;

    for (const file of brandFiles) {
      try {
        const data = await fs.readFile(file.absolute);
        const filePath = path.join(clientSlug, 'brand', file.relative);

        await fetch(`${config.url}/api/cloud/push/file`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'X-File-Path': filePath,
            'Content-Type': 'application/octet-stream',
          },
          body: data,
        });

        brandCount++;
        byteCount += data.length;
      } catch {
        // Brand file upload failure is non-critical
      }
    }

    if (brandCount > 0) {
      console.log(`    + ${brandCount} brand assets`);
    }
  } catch {
    // No brand directory — fine
  }

  stats.projects++;
  stats.files += fileCount;
  stats.bytes += byteCount;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function main() {
  const config = await loadConfig();
  const target = process.argv[2]; // optional: client/project

  console.log(`\n  DriftGrid Push → ${config.url}`);
  console.log(`  Workspace: ${config.workspaceName}\n`);

  const stats: PushStats = { projects: 0, files: 0, bytes: 0, errors: [] };

  if (target) {
    // Push a specific project
    const [clientSlug, projectSlug] = target.split('/');
    if (!clientSlug || !projectSlug) {
      console.error('  Usage: driftgrid push <client>/<project>\n');
      process.exit(1);
    }
    await pushProject(config, clientSlug, projectSlug, stats);
  } else {
    // Push all projects
    try {
      const clientDirs = await fs.readdir(PROJECTS_DIR);

      for (const clientSlug of clientDirs) {
        const clientPath = path.join(PROJECTS_DIR, clientSlug);
        const clientStat = await fs.stat(clientPath);
        if (!clientStat.isDirectory()) continue;

        const projectDirs = await fs.readdir(clientPath);
        for (const projectSlug of projectDirs) {
          if (projectSlug === 'brand') continue;
          const projectPath = path.join(clientPath, projectSlug);
          const projectStat = await fs.stat(projectPath);
          if (!projectStat.isDirectory()) continue;

          await pushProject(config, clientSlug, projectSlug, stats);
        }
      }
    } catch {
      console.error('  No projects directory found.\n');
      process.exit(1);
    }
  }

  // Summary
  console.log(`\n  Done: ${stats.projects} project(s), ${stats.files} files, ${formatBytes(stats.bytes)}`);

  if (stats.errors.length > 0) {
    console.log(`\n  Errors (${stats.errors.length}):`);
    stats.errors.forEach(e => console.log(`    - ${e}`));
  }

  console.log('');
}

main();
