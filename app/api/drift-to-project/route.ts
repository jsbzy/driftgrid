import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getManifest, writeManifest } from '@/lib/manifest';
import type { Manifest } from '@/lib/types';

const PROJECTS_DIR = path.join(process.cwd(), 'projects');

function generateId(): string {
  return Math.random().toString(36).substring(2, 10);
}

/**
 * POST /api/drift-to-project
 * Takes multiple versions (e.g., selects) and creates a new project.
 * Each version becomes concept-N/v1.html in the new project.
 */
export async function POST(request: Request) {
  const { client, project, versions, newProject, newCanvas } = await request.json() as {
    client: string;
    project: string;
    versions: { conceptId: string; versionId: string }[];
    newProject: string;
    newCanvas?: string;
  };

  if (!client || !project || !versions?.length || !newProject) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const sourceManifest = await getManifest(client, project);
  if (!sourceManifest) {
    return NextResponse.json({ error: 'Source project not found' }, { status: 404 });
  }

  const slug = newProject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const newProjectDir = path.join(PROJECTS_DIR, client, slug);

  try {
    await fs.stat(newProjectDir);
    return NextResponse.json({ error: `Project already exists: ${client}/${slug}` }, { status: 409 });
  } catch {
    // Good
  }

  await fs.mkdir(path.join(newProjectDir, '.thumbs'), { recursive: true });

  const canvas = newCanvas || sourceManifest.project.canvas;
  const now = new Date().toISOString();
  const projectName = newProject.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const concepts = [];

  for (let i = 0; i < versions.length; i++) {
    const { conceptId, versionId } = versions[i];
    const sourceConcept = sourceManifest.concepts.find(c => c.id === conceptId);
    const sourceVersion = sourceConcept?.versions.find(v => v.id === versionId);
    if (!sourceConcept || !sourceVersion) continue;

    const conceptFolder = `concept-${i + 1}`;
    const conceptDir = path.join(newProjectDir, conceptFolder);
    await fs.mkdir(conceptDir, { recursive: true });

    // Copy HTML file
    const sourceHtmlPath = path.join(PROJECTS_DIR, client, project, sourceVersion.file);
    const destHtmlPath = path.join(conceptDir, 'v1.html');
    await fs.copyFile(sourceHtmlPath, destHtmlPath);

    concepts.push({
      id: `concept-${generateId()}`,
      label: sourceConcept.label,
      description: `From ${sourceManifest.project.name} — v${sourceVersion.number}`,
      position: i,
      visible: true,
      canvas: sourceConcept.canvas,
      versions: [{
        id: `version-${generateId()}`,
        number: 1,
        file: `${conceptFolder}/v1.html`,
        parentId: null,
        changelog: `Drifted from ${project}`,
        visible: true,
        starred: false,
        created: now,
        thumbnail: '',
      }],
    });
  }

  if (concepts.length === 0) {
    return NextResponse.json({ error: 'No valid versions found' }, { status: 400 });
  }

  const manifest: Manifest = {
    project: {
      name: projectName,
      slug,
      client,
      canvas,
      created: now,
      links: {},
    },
    concepts,
    rounds: [],
    workingSets: [],
    comments: [],
    clientEdits: [],
  };

  await writeManifest(client, slug, manifest);

  return NextResponse.json({
    client,
    project: slug,
    conceptCount: concepts.length,
    url: `/admin/${client}/${slug}`,
  });
}
