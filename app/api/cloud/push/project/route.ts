import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/cloud/push/project
 * Registers or updates a project's manifest in the cloud database.
 * Called by `driftgrid push` before uploading files.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Cloud mode not configured' }, { status: 501 });
  }

  const { workspaceId, clientSlug, projectSlug, manifest } = await request.json();

  if (!workspaceId || !clientSlug || !projectSlug || !manifest) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Upsert the project
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .upsert({
      workspace_id: workspaceId,
      client_slug: clientSlug,
      project_slug: projectSlug,
      name: manifest.project?.name || projectSlug,
      canvas: manifest.project?.canvas || 'desktop',
      links: manifest.project?.links || {},
    }, {
      onConflict: 'workspace_id,client_slug,project_slug',
    })
    .select()
    .single();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }

  return NextResponse.json({
    projectId: project.id,
    status: 'ready',
  });
}
