import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';

/**
 * GET /api/cloud/verify — validate a JWT and return user profile info.
 *
 * Used by the local DriftGrid instance to check if stored credentials are still valid.
 * Returns: { valid: true, email, userId, tier }
 */
export async function GET(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ valid: false, error: 'Missing authorization' }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseAdmin();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ valid: false, error: 'Invalid or expired token' }, { status: 401 });
  }

  // Get profile for tier info
  const { data: profile } = await supabase
    .from('profiles')
    .select('tier')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    valid: true,
    userId: user.id,
    email: user.email || '',
    tier: profile?.tier || 'free',
  });
}
