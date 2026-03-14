import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { getManifest } from '@/lib/manifest';
import { CANVAS_PRESETS } from '@/lib/constants';
import { exportPdf, mergePdfs } from '@/lib/export-pdf';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { client, project, format, versionId, workingSetId } = body as {
    client: string;
    project: string;
    format: 'pdf' | 'html';
    versionId?: string;
    workingSetId?: string;
  };

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const preset = CANVAS_PRESETS[manifest.project.canvas];
  const width = typeof preset?.width === 'number' ? preset.width : 1440;
  const height: number | 'auto' = typeof preset?.height === 'number' ? preset.height : 'auto';
  const projectDir = path.join(process.cwd(), 'projects', client, project);

  // Raw HTML download
  if (format === 'html') {
    if (!versionId) {
      return NextResponse.json({ error: 'versionId required for HTML export' }, { status: 400 });
    }
    const version = manifest.concepts.flatMap(c => c.versions).find(v => v.id === versionId);
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }
    const htmlPath = path.resolve(projectDir, version.file);
    const htmlContent = await fs.readFile(htmlPath, 'utf-8');
    return new NextResponse(htmlContent, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${version.id}.html"`,
      },
    });
  }

  // PDF export
  if (format === 'pdf') {
    // Single version
    if (versionId && !workingSetId) {
      const version = manifest.concepts.flatMap(c => c.versions).find(v => v.id === versionId);
      if (!version) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }

      // Try pre-built PDF first (works on Vercel)
      const prebuiltPath = path.join(projectDir, '.exports', `${version.id}.pdf`);
      try {
        const data = await fs.readFile(prebuiltPath);
        return new NextResponse(data, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${version.id}.pdf"`,
          },
        });
      } catch {
        // No pre-built PDF — generate live (local only)
        if (process.env.VERCEL) {
          return NextResponse.json(
            { error: 'PDF not available. Run `npm run build-exports` locally and push.' },
            { status: 404 }
          );
        }
        const htmlPath = path.resolve(projectDir, version.file);
        const buffer = await exportPdf(htmlPath, width, height);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${version.id}.pdf"`,
          },
        });
      }
    }

    // Working set PDF
    if (workingSetId) {
      const ws = manifest.workingSets.find(s => s.id === workingSetId);
      if (!ws) {
        return NextResponse.json({ error: 'Working set not found' }, { status: 404 });
      }

      if (process.env.VERCEL) {
        // On Vercel, merge pre-built PDFs
        const pdfBuffers: Buffer[] = [];
        for (const sel of ws.selections) {
          const concept = manifest.concepts.find(c => c.id === sel.conceptId);
          const version = concept?.versions.find(v => v.id === sel.versionId);
          if (!version) continue;
          const prebuiltPath = path.join(projectDir, '.exports', `${version.id}.pdf`);
          try {
            pdfBuffers.push(await fs.readFile(prebuiltPath));
          } catch {
            return NextResponse.json(
              { error: `PDF for ${version.id} not found. Run build-exports locally.` },
              { status: 404 }
            );
          }
        }
        const merged = await mergePdfs(pdfBuffers);
        return new NextResponse(new Uint8Array(merged), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${client}-${project}-${ws.name}.pdf"`,
          },
        });
      }

      // Local: generate live
      const slides: string[] = [];
      for (const sel of ws.selections) {
        const concept = manifest.concepts.find(c => c.id === sel.conceptId);
        const version = concept?.versions.find(v => v.id === sel.versionId);
        if (concept && version) {
          slides.push(path.resolve(projectDir, version.file));
        }
      }
      const pdfBuffers: Buffer[] = [];
      for (const htmlPath of slides) {
        pdfBuffers.push(await exportPdf(htmlPath, width, height));
      }
      const merged = await mergePdfs(pdfBuffers);
      return new NextResponse(new Uint8Array(merged), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${client}-${project}-${ws.name}.pdf"`,
        },
      });
    }
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}
