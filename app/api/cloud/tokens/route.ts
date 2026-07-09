import { NextResponse } from 'next/server';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';
import { getUser } from '@/lib/auth';
import { generatePat } from '@/lib/cloud-auth-server';

/**
 * Personal access token management. Cookie-session authenticated (browser only)
 * — this is the one-time, in-browser step where a signed-in user mints a token
 * for headless clients. The tokens themselves then authenticate the cloud write
 * endpoints (push/share/verify) via resolveCloudUser.
 *
 *   GET    /api/cloud/tokens        — list own tokens (metadata only, never the hash/plaintext)
 *   POST   /api/cloud/tokens        — mint a token; returns plaintext ONCE. Body: { name, expiresInDays? }
 *   DELETE /api/cloud/tokens?id=…   — revoke (soft-delete) an own token
 *
 * Reads/writes go through the service-role admin client (RLS-bypassing); every
 * query is explicitly scoped to the authenticated user's id, so one user can
 * never see or revoke another's tokens.
 */

const MAX_TOKENS_PER_USER = 20;

export async function GET() {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .select('id, name, token_prefix, created_at, last_used_at, expires_at, revoked_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tokens: data ?? [] });
}

export async function POST(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    return NextResponse.json({ error: 'A token name is required' }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: 'Token name too long (max 80 chars)' }, { status: 400 });
  }

  // Optional expiry — omitted means the token never expires.
  let expiresAt: string | null = null;
  if (body.expiresInDays != null) {
    const days = Number(body.expiresInDays);
    if (!Number.isFinite(days) || days <= 0 || days > 3650) {
      return NextResponse.json({ error: 'expiresInDays must be between 1 and 3650' }, { status: 400 });
    }
    expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  const supabase = getSupabaseAdmin();

  // Cap active tokens per user to keep the surface small.
  const { count } = await supabase
    .from('personal_access_tokens')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('revoked_at', null);
  if ((count ?? 0) >= MAX_TOKENS_PER_USER) {
    return NextResponse.json(
      { error: `Token limit reached (${MAX_TOKENS_PER_USER}). Revoke one first.` },
      { status: 409 },
    );
  }

  const { plaintext, hash, prefix } = generatePat();
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .insert({
      user_id: user.id,
      name,
      token_hash: hash,
      token_prefix: prefix,
      expires_at: expiresAt,
    })
    .select('id, name, token_prefix, created_at, expires_at')
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // The plaintext is returned exactly once here and never stored — the caller
  // must copy it now.
  return NextResponse.json({ ...data, token: plaintext });
}

export async function DELETE(request: Request) {
  if (!isCloudMode()) {
    return NextResponse.json({ error: 'Cloud mode only' }, { status: 400 });
  }
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'Missing token id' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  // Scope the update to the owner so a user can only revoke their own tokens.
  const { data, error } = await supabase
    .from('personal_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Token not found' }, { status: 404 });
  }
  return NextResponse.json({ revoked: true, id: data.id });
}
