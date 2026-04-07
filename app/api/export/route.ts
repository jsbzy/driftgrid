import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { getManifest } from '@/lib/manifest';
import { CANVAS_PRESETS } from '@/lib/constants';
import { exportPdf, exportPdfFromHtml, exportPng, mergePdfs } from '@/lib/export-pdf';
import { injectViewportLock } from '@/lib/viewport-lock';
import { getStorage } from '@/lib/storage';

// Allow up to 30s for PDF generation with headless Chrome
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { client, project, format, versionId, workingSetId, htmlContent } = body as {
    client: string;
    project: string;
    format: 'pdf' | 'png' | 'html' | 'pptx';
    versionId?: string;
    workingSetId?: string;
    htmlContent?: string;
  };

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Resolve canvas dimensions — check concept-level override first, then project-level
  let canvas: string | { type?: string; width?: number; height?: number | 'auto' } = manifest.project.canvas;
  if (versionId) {
    for (const concept of manifest.concepts) {
      if (concept.versions.some(v => v.id === versionId) && concept.canvas) {
        canvas = concept.canvas;
        break;
      }
    }
  }
  let width: number;
  let height: number | 'auto';
  if (typeof canvas === 'object' && canvas !== null) {
    width = (canvas as any).width ?? 1440;
    height = (canvas as any).height ?? 'auto';
  } else {
    const preset = CANVAS_PRESETS[canvas];
    width = typeof preset?.width === 'number' ? preset.width : 1440;
    height = typeof preset?.height === 'number' ? preset.height : 'auto';
  }

  const storage = getStorage();
  const projectRelative = path.join(client, project);

  // Raw HTML download
  if (format === 'html') {
    if (!versionId) {
      return NextResponse.json({ error: 'versionId required for HTML export' }, { status: 400 });
    }
    const version = manifest.concepts.flatMap(c => c.versions).find(v => v.id === versionId);
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }
    let content = await storage.readTextFile(path.join(projectRelative, version.file));
    content = injectViewportLock(content, width, height);
    return new NextResponse(content, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="${version.id}.html"`,
      },
    });
  }

  // PNG export — requires absolute path for Puppeteer
  if (format === 'png') {
    if (!versionId) {
      return NextResponse.json({ error: 'versionId required for PNG export' }, { status: 400 });
    }
    const version = manifest.concepts.flatMap(c => c.versions).find(v => v.id === versionId);
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }
    const htmlAbsolute = storage.resolvePath(path.join(projectRelative, version.file));
    if (!htmlAbsolute) {
      return NextResponse.json({ error: 'PNG export requires local mode' }, { status: 501 });
    }
    const buffer = await exportPng(htmlAbsolute, width, height);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': `attachment; filename="${version.id}.png"`,
      },
    });
  }

  // PDF export
  if (format === 'pdf') {
    // Edited HTML content — write to temp file so relative image paths resolve
    if (htmlContent) {
      try {
        const firstVersion = manifest.concepts.flatMap(c => c.versions)[0];
        const sourceDir = firstVersion
          ? storage.resolvePath(path.join(projectRelative, path.dirname(firstVersion.file)))
          : storage.resolvePath(projectRelative);
        if (!sourceDir) {
          return NextResponse.json({ error: 'PDF export requires local mode' }, { status: 501 });
        }
        const buffer = await exportPdfFromHtml(htmlContent, width, height, sourceDir);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${client}-${project}-alt.pdf"`,
          },
        });
      } catch (err) {
        console.error('PDF export error:', err);
        return NextResponse.json(
          { error: `PDF generation failed: ${err instanceof Error ? err.message : 'Unknown error'}` },
          { status: 500 }
        );
      }
    }

    // Single version
    if (versionId && !workingSetId) {
      const version = manifest.concepts.flatMap(c => c.versions).find(v => v.id === versionId);
      if (!version) {
        return NextResponse.json({ error: 'Version not found' }, { status: 404 });
      }

      // Try pre-built PDF first (works on Vercel)
      const prebuiltRelative = path.join(projectRelative, '.exports', `${version.id}.pdf`);
      if (await storage.exists(prebuiltRelative)) {
        const data = await storage.readFile(prebuiltRelative);
        return new NextResponse(new Uint8Array(data), {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${version.id}.pdf"`,
          },
        });
      }

      // No pre-built PDF — generate live (local only)
      if (process.env.VERCEL) {
        return NextResponse.json(
          { error: 'PDF not available. Run `npm run build-exports` locally and push.' },
          { status: 404 }
        );
      }

      const htmlAbsolute = storage.resolvePath(path.join(projectRelative, version.file));
      if (!htmlAbsolute) {
        return NextResponse.json({ error: 'PDF export requires local mode' }, { status: 501 });
      }
      const buffer = await exportPdf(htmlAbsolute, width, height);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${version.id}.pdf"`,
        },
      });
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
          const prebuiltRelative = path.join(projectRelative, '.exports', `${version.id}.pdf`);
          if (await storage.exists(prebuiltRelative)) {
            pdfBuffers.push(Buffer.from(await storage.readFile(prebuiltRelative)));
          } else {
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
      const pdfBuffers: Buffer[] = [];
      for (const sel of ws.selections) {
        const concept = manifest.concepts.find(c => c.id === sel.conceptId);
        const version = concept?.versions.find(v => v.id === sel.versionId);
        if (concept && version) {
          const htmlAbsolute = storage.resolvePath(path.join(projectRelative, version.file));
          if (htmlAbsolute) {
            pdfBuffers.push(await exportPdf(htmlAbsolute, width, height));
          }
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
  }

  // PPTX export — screenshot the HTML and embed as a slide image
  if (format === 'pptx') {
    if (!versionId) {
      return NextResponse.json({ error: 'versionId required for PPTX export' }, { status: 400 });
    }
    const version = manifest.concepts.flatMap(c => c.versions).find(v => v.id === versionId);
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 });
    }

    try {
      const htmlAbsolute = storage.resolvePath(path.join(projectRelative, version.file));
      if (!htmlAbsolute) {
        return NextResponse.json({ error: 'PPTX export requires local mode' }, { status: 501 });
      }
      const pngBuffer = await exportPng(htmlAbsolute, width, height);
      const base64 = Buffer.from(pngBuffer).toString('base64');

      const PptxGenJS = (await import('pptxgenjs')).default;
      const pptx = new PptxGenJS();

      // Set slide dimensions to match canvas
      const slideW = 10; // inches
      const slideH = typeof height === 'number' ? (slideW * height) / width : 5.625; // default 16:9
      pptx.defineLayout({ name: 'CUSTOM', width: slideW, height: slideH });
      pptx.layout = 'CUSTOM';

      const slide = pptx.addSlide();
      slide.addImage({
        data: `image/png;base64,${base64}`,
        x: 0,
        y: 0,
        w: slideW,
        h: slideH,
      });

      const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' }) as Buffer;
      return new NextResponse(new Uint8Array(pptxBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename="${version.id}.pptx"`,
        },
      });
    } catch (err) {
      console.error('PPTX export error:', err);
      return NextResponse.json({ error: 'PPTX export failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
}
