import path from 'path';
import { promises as fs } from 'fs';
import { getManifest } from '../lib/manifest';
import { CANVAS_PRESETS } from '../lib/constants';
import { exportPng } from '../lib/export-png';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));

if (positional.length < 2) {
  console.error('Usage: npx tsx scripts/export-png.ts <client> <project> [versionId]');
  process.exit(1);
}

const [client, project, targetVersionId] = positional;
const projectDir = path.join(process.cwd(), 'projects', client, project);

async function main() {
  const manifest = await getManifest(client, project);
  if (!manifest) {
    console.error(`Manifest not found for ${client}/${project}`);
    process.exit(1);
  }

  const preset = CANVAS_PRESETS[manifest.project.canvas];
  const width = typeof preset?.width === 'number' ? preset.width : 1440;
  const height: number | 'auto' = typeof preset?.height === 'number' ? preset.height : 'auto';

  const outDir = path.join(process.cwd(), `${client}-${project}-export`);
  await fs.mkdir(outDir, { recursive: true });

  const versions = manifest.concepts.flatMap(c =>
    c.versions.map(v => ({ concept: c, version: v }))
  );

  const targets = targetVersionId
    ? versions.filter(v => v.version.id === targetVersionId)
    : versions;

  if (targets.length === 0) {
    console.error(`No versions found${targetVersionId ? ` matching "${targetVersionId}"` : ''}`);
    process.exit(1);
  }

  for (const { concept, version } of targets) {
    const htmlPath = path.resolve(projectDir, version.file);
    console.log(`  ${concept.label} / v${version.number}...`);
    const buf = await exportPng(htmlPath, width, height);
    await fs.writeFile(path.join(outDir, `${version.id}.png`), buf);
  }

  console.log(`Done: ${outDir}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
