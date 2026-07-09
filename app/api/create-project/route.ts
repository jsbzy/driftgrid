import { NextResponse } from 'next/server';
import { CANVAS_PRESETS } from '@/lib/constants';
import { createProject, CreateProjectError } from '@/lib/create-project';
import { getUserId } from '@/lib/auth';

/**
 * POST /api/create-project — create a project in the caller's workspace.
 *
 * Local mode: scaffolds under projects/ on disk (historic behavior).
 * Cloud mode: writes to the signed-in user's Supabase Storage prefix — this is
 * what makes driftgrid.ai usable standalone (no local install). Free tier is
 * capped; see lib/create-project.ts.
 *
 * Body: { client, project, canvas }
 */
export async function POST(request: Request) {
  const { client, project, canvas } = await request.json();

  // Canvas is required — no default. Picking the wrong format causes designs
  // to be the wrong dimensions, which is hard to fix retroactively. Force the
  // caller to make this choice up front.
  if (!canvas || typeof canvas !== 'string') {
    return NextResponse.json(
      {
        error: 'canvas is required. Choose the format that matches your output.',
        valid: Object.keys(CANVAS_PRESETS),
        examples: {
          desktop: '1440px wide, scrollable — websites, dashboards',
          mobile: '375px wide, scrollable — app screens',
          'landscape-16-9': '1920×1080 — presentations, slides',
          'a4-portrait': '794×1123 — documents, one-pagers',
        },
      },
      { status: 400 },
    );
  }

  try {
    const userId = await getUserId();
    const result = await createProject(userId, client, project, canvas);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof CreateProjectError) {
      return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    }
    throw e;
  }
}
