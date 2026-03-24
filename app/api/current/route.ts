import { NextResponse } from 'next/server';

// In-memory store of what the user is currently viewing
// This survives across requests in the same dev server process
let currentView: {
  client: string;
  project: string;
  conceptId: string;
  conceptLabel: string;
  versionId: string;
  versionNumber: number;
  file: string;
  absolutePath: string;
  viewMode: 'grid' | 'frame';
  updatedAt: string;
} | null = null;

/**
 * GET /api/current
 * Returns what the user is currently viewing in DriftGrid.
 * Agents can call this to know which file to target.
 */
export async function GET() {
  if (!currentView) {
    return NextResponse.json({ error: 'No active view' }, { status: 404 });
  }
  return NextResponse.json(currentView);
}

/**
 * POST /api/current
 * Called by the Viewer component when navigation changes.
 */
export async function POST(request: Request) {
  const body = await request.json();
  currentView = {
    ...body,
    updatedAt: new Date().toISOString(),
  };
  return NextResponse.json({ ok: true });
}
