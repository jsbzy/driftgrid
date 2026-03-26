import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';
import { getManifest } from '@/lib/manifest';
import { resolveCanvas } from '@/lib/constants';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

/**
 * GET /api/export-doc?client=x&project=y&conceptId=z&versionId=w
 *
 * Extracts text content from an HTML version and returns it as
 * formatted plain text suitable for pasting into Google Docs.
 *
 * If no conceptId/versionId, exports ALL selects or all latest versions.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const client = url.searchParams.get('client');
  const project = url.searchParams.get('project');
  const conceptId = url.searchParams.get('conceptId');
  const versionId = url.searchParams.get('versionId');

  if (!client || !project) {
    return NextResponse.json({ error: 'Missing client/project' }, { status: 400 });
  }

  const manifest = await getManifest(client, project);
  if (!manifest) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const resolved = resolveCanvas(manifest.project.canvas);
  const projectDir = path.join(PROJECTS_DIR, client, project);

  // Determine which versions to export
  let versionsToExport: { concept: string; version: string; file: string }[] = [];

  if (conceptId && versionId) {
    // Single version
    const concept = manifest.concepts.find(c => c.id === conceptId);
    const version = concept?.versions.find(v => v.id === versionId);
    if (concept && version) {
      versionsToExport.push({ concept: concept.label, version: `v${version.number}`, file: version.file });
    }
  } else {
    // All concepts — latest version of each
    for (const concept of manifest.concepts) {
      if (concept.versions.length > 0) {
        const latest = concept.versions[concept.versions.length - 1];
        versionsToExport.push({ concept: concept.label, version: `v${latest.number}`, file: latest.file });
      }
    }
  }

  // Extract text from each HTML file
  const sections: string[] = [];
  sections.push(`# ${manifest.project.name}`);
  sections.push(`Canvas: ${resolved.label} (${resolved.width}${typeof resolved.height === 'number' ? `×${resolved.height}` : ' × auto'})`);
  sections.push('');

  for (const item of versionsToExport) {
    const htmlPath = path.join(projectDir, item.file);
    try {
      const html = await fs.readFile(htmlPath, 'utf-8');
      const text = extractTextFromHtml(html);

      sections.push(`---`);
      sections.push(`## ${item.concept}`);
      sections.push('');
      sections.push(`**Visual:** ${describeVisual(html)}`);
      sections.push('');
      sections.push(text);
      sections.push('');
    } catch {
      sections.push(`## ${item.concept}`);
      sections.push('(file not found)');
      sections.push('');
    }
  }

  const doc = sections.join('\n');

  return new NextResponse(doc, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

/**
 * Extract readable text from HTML, stripping tags and cleaning whitespace
 */
function extractTextFromHtml(html: string): string {
  // Remove everything before <body>
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const body = bodyMatch ? bodyMatch[1] : html;

  // Remove script and style tags
  let text = body.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Replace block elements with newlines
  text = text.replace(/<\/?(div|p|h[1-6]|li|br|hr|section|article|header|footer|tr)[^>]*>/gi, '\n');

  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');

  // Decode HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#039;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&middot;/g, '·');

  // Clean whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();

  // Remove empty lines at start
  text = text.replace(/^\n+/, '');

  return text;
}

/**
 * Generate a brief visual description based on HTML structure
 */
function describeVisual(html: string): string {
  const hints: string[] = [];

  if (/<img/i.test(html)) hints.push('image');
  if (/<video/i.test(html)) hints.push('video');
  if (/<svg/i.test(html)) hints.push('illustration');
  if (/phone|mobile|device/i.test(html)) hints.push('phone mockup');
  if (/dashboard/i.test(html)) hints.push('dashboard');
  if (/chart|graph/i.test(html)) hints.push('chart');
  if (/grid/i.test(html) && /card/i.test(html)) hints.push('card grid');
  if (/background.*#[0-9a-f]{3,6}|background.*rgb/i.test(html)) {
    const dark = /background[^;]*(?:#[0-3][0-9a-f]{5}|#[0-2][0-9a-f]{2}|rgb\s*\(\s*[0-4]\d)/i.test(html);
    if (dark) hints.push('dark background');
  }

  if (hints.length === 0) return 'Text-based layout';
  return hints.join(', ');
}
