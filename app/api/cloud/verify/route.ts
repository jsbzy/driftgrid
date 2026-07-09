import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';
import { resolveCloudUser } from '@/lib/cloud-auth-server';

/**
 * GET /api/cloud/verify — validate a credential and return user profile info.
 *
 * Accepts either a Supabase JWT or a DriftGrid personal access token
 * (`dg_pat_…`) in the Authorization header. Used by the local DriftGrid
 * instance to check if stored credentials are still valid.
 * Returns: { valid: true, email, userId, tier }
 */
export async function GET(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  const resolved = await resolveCloudUser(request.headers.get('authorization'));
  if (!resolved) {
    return NextResponse.json({ valid: false, error: 'Invalid or expired credential' }, { status: 401 });
  }

  // Get profile for tier info
  const supabase = getSupabaseAdmin();
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', resolved.userId)
    .single();

  return NextResponse.json({
    valid: true,
    userId: resolved.userId,
    email: resolved.email,
    tier: profile?.tier || 'free',
  });
}
