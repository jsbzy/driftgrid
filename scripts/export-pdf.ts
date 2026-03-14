import path from 'path';
import { promises as fs } from 'fs';
import { getManifest } from '../lib/manifest';
import { CANVAS_PRESETS } from '../lib/constants';
import { exportPdf, mergePdfs } from '../lib/export-pdf';

const args = process.argv.slice(2);
const positional = args.filter(a => !a.startsWith('--'));
const setFlag = args.find(a => a.startsWith('--set='))?.split('=')[1]
  || (args.includes('--set') ? args[args.indexOf('--set') + 1] : undefined);

if (positional.length < 2) {
  console.error('Usage: npx tsx scripts/export-pdf.ts <client> <project> [--set <name>]');
  process.exit(1);
}

const [client, project] = positional;
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

  if (setFlag) {
    // Export a working set as multi-page PDF
    const ws = manifest.workingSets.find(s => s.name === setFlag || s.id === setFlag);
    if (!ws) {
      console.error(`Working set "${setFlag}" not found. Available: ${manifest.workingSets.map(s => s.name).join(', ') || '(none)'}`);
      process.exit(1);
    }

    console.log(`Exporting working set "${ws.name}" (${ws.selections.length} pages)...`);
    const pdfBuffers: Buffer[] = [];

    for (const sel of ws.selections) {
      const concept = manifest.concepts.find(c => c.id === sel.conceptId);
      const version = concept?.versions.find(v => v.id === sel.versionId);
      if (!concept || !version) continue;

      const htmlPath = path.resolve(projectDir, version.file);
      console.log(`  ${concept.label} / v${version.number}...`);
      const buf = await exportPdf(htmlPath, width, height);
      pdfBuffers.push(buf);
    }

    const merged = await mergePdfs(pdfBuffers);
    const outPath = path.join(process.cwd(), `${client}-${project}-${ws.name}.pdf`);
    await fs.writeFile(outPath, merged);
    console.log(`Done: ${outPath}`);
  } else {
    // Export all versions as individual PDFs
    const outDir = path.join(process.cwd(), `${client}-${project}-export`);
    await fs.mkdir(outDir, { recursive: true });

    for (const concept of manifest.concepts) {
      for (const version of concept.versions) {
        const htmlPath = path.resolve(projectDir, version.file);
        console.log(`  ${concept.label} / v${version.number}...`);
        const buf = await exportPdf(htmlPath, width, height);
        await fs.writeFile(path.join(outDir, `${version.id}.pdf`), buf);
      }
    }
    console.log(`Done: ${outDir}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
