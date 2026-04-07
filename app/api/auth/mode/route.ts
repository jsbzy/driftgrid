import { NextResponse } from 'next/server';

/** Returns the current auth mode so the login page knows which form to show. */
export async function GET() {
  const mode = process.env.DRIFTGRID_MODE || 'local';
  return NextResponse.json({ mode });
}
