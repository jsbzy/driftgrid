import path from 'path';
import { promises as fs } from 'fs';
import { getManifest } from '../lib/manifest';
import { CANVAS_PRESETS } from '../lib/constants';
import { exportPdf } from '../lib/export-pdf';

const args = process.argv.slice(2);
const force = args.includes('--force');

if (args.filter(a => !a.startsWith('--')).length < 2) {
  console.error('Usage: npx tsx scripts/build-exports.ts <client> <project> [--force]');
  process.exit(1);
}

const [client, project] = args.filter(a => !a.startsWith('--'));
const projectDir = path.join(process.cwd(), 'projects', client, project);
const exportsDir = path.join(projectDir, '.exports');

async function main() {
  const manifest = await getManifest(client, project);
  if (!manifest) {
    console.error(`Manifest not found for ${client}/${project}`);
    process.exit(1);
  }

  const preset = CANVAS_PRESETS[manifest.project.canvas];
  const width = typeof preset?.width === 'number' ? preset.width : 1440;
  const height: number | 'auto' = typeof preset?.height === 'number' ? preset.height : 'auto';

  await fs.mkdir(exportsDir, { recursive: true });

  let generated = 0;
  let skipped = 0;

  for (const concept of manifest.concepts) {
    for (const version of concept.versions) {
      const pdfPath = path.join(exportsDir, `${version.id}.pdf`);

      if (!force) {
        try {
          await fs.access(pdfPath);
          skipped++;
          continue;
        } catch {}
      }

      const htmlPath = path.resolve(projectDir, version.file);
      console.log(`  ${version.id}...`);
      const buf = await exportPdf(htmlPath, width, height);
      await fs.writeFile(pdfPath, buf);
      generated++;
    }
  }

  console.log(`Done. ${generated} generated, ${skipped} skipped.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
