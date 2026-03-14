import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { getManifest } from '@/lib/manifest';
import { CANVAS_PRESETS } from '@/lib/constants';
import { exportPng } from '@/lib/export-png';
import { exportPdf, mergePdfs } from '@/lib/export-pdf';
import { exportPptx } from '@/lib/export-pptx';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { client, project, format, versionId, workingSetId } = body as {
    client: string;
    project: string;
    format: 'pdf' | 'png' | 'pptx' | 'html';
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

  // Block non-HTML exports on Vercel (requires Playwright)
  if (process.env.VERCEL && format !== 'html') {
    return NextResponse.json(
      { error: 'PDF/PNG/PPTX exports are only available locally' },
      { status: 403 }
    );
  }

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

  // Working set export (multi-page PDF or PPTX)
  if (workingSetId) {
    const ws = manifest.workingSets.find(s => s.id === workingSetId);
    if (!ws) {
      return NextResponse.json({ error: 'Working set not found' }, { status: 404 });
    }

    // Resolve each selection to an HTML file path
    const slides: { label: string; htmlPath: string }[] = [];
    for (const sel of ws.selections) {
      const concept = manifest.concepts.find(c => c.id === sel.conceptId);
      const version = concept?.versions.find(v => v.id === sel.versionId);
      if (concept && version) {
        slides.push({
          label: concept.label,
          htmlPath: path.resolve(projectDir, version.file),
        });
      }
    }

    if (format === 'pptx') {
      const buffer = await exportPptx(
        slides.map(s => ({ ...s, width, height })),
        `${manifest.project.name} — ${ws.name}`
      );
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${client}-${project}-${ws.name}.pptx"`,
        },
      });
    }

    // Multi-page PDF
    const pdfBuffers: Buffer[] = [];
    for (const slide of slides) {
      const buf = await exportPdf(slide.htmlPath, width, height);
      pdfBuffers.push(buf);
    }
    const merged = await mergePdfs(pdfBuffers);
    return new NextResponse(new Uint8Array(merged), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${client}-${project}-${ws.name}.pdf"`,
      },
    });
  }

  // Single version export
  if (!versionId) {
    return NextResponse.json({ error: 'versionId or workingSetId required' }, { status: 400 });
  }

  const version = manifest.concepts.flatMap(c => c.versions).find(v => v.id === versionId);
  if (!version) {
    return NextResponse.json({ error: 'Version not found' }, { status: 404 });
  }
  const htmlPath = path.resolve(projectDir, version.file);

  if (format === 'png') {
    const buffer = await exportPng(htmlPath, width, height);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${version.id}.png"`,
      },
    });
  }

  // Single PDF
  const buffer = await exportPdf(htmlPath, width, height);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${version.id}.pdf"`,
    },
  });
}
