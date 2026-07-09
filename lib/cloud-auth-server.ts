/**
 * Server-side cloud auth resolution.
 *
 * Cloud write endpoints (push, share, verify, …) historically did this inline:
 *
 *     const { data: { user } } = await supabase.auth.getUser(token)
 *
 * i.e. they only understood short-lived Supabase JWTs from the browser popup.
 * This module generalises that to accept EITHER:
 *
 *   1. A Supabase JWT (unchanged behaviour), or
 *   2. A DriftGrid personal access token (`dg_pat_…`) — a long-lived, hashed
 *      credential for headless / CLI / agent clients. See
 *      supabase/migrations/20260709000000_personal_access_tokens.sql.
 *
 * `resolveCloudUser` is the single choke point every endpoint should call, so
 * the JWT-vs-PAT distinction lives in exactly one place.
 *
 * Server-only (imports the service-role admin client). Never import from a
 * client component.
 */

import { createHash, randomBytes } from 'crypto';
import { getSupabaseAdmin } from './supabase';

export const PAT_PREFIX = 'dg_pat_';

export interface ResolvedUser {
  userId: string;
  email: string;
  /** How the caller authenticated — useful for auditing / future gating. */
  via: 'jwt' | 'pat';
}

/** SHA-256 hex of a plaintext token. The DB stores only this. */
export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Mint a fresh personal access token. Returns the plaintext (shown to the user
 * once) plus the derived hash + display prefix that get persisted. The random
 * body is 32 bytes of base64url — unguessable and URL/header safe.
 */
export function generatePat(): { plaintext: string; hash: string; prefix: string } {
  const body = randomBytes(32).toString('base64url');
  const plaintext = `${PAT_PREFIX}${body}`;
  return {
    plaintext,
    hash: hashToken(plaintext),
    // e.g. 'dg_pat_ab12cd' — enough to recognise a token in a list, not enough to use.
    prefix: `${PAT_PREFIX}${body.slice(0, 6)}`,
  };
}

/**
 * Extract the raw bearer token from an Authorization header value.
 * Returns null if absent or malformed.
 */
export function bearerFromHeader(authHeader: string | null): string | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Resolve an Authorization header to the owning user, accepting both Supabase
 * JWTs and DriftGrid PATs. Returns null on any failure (missing / malformed /
 * invalid / expired / revoked) — callers should treat null as 401.
 */
export async function resolveCloudUser(authHeader: string | null): Promise<ResolvedUser | null> {
  const token = bearerFromHeader(authHeader);
  if (!token) return null;

  return token.startsWith(PAT_PREFIX)
    ? resolvePat(token)
    : resolveJwt(token);
}

async function resolveJwt(token: string): Promise<ResolvedUser | null> {
  const supabase = getSupabaseAdmin();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return { userId: user.id, email: user.email || '', via: 'jwt' };
}

async function resolvePat(token: string): Promise<ResolvedUser | null> {
  const supabase = getSupabaseAdmin();
  const hash = hashToken(token);

  const { data, error } = await supabase
    .from('personal_access_tokens')
    .select('id, user_id, expires_at, revoked_at')
    .eq('token_hash', hash)
    .single();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at) < new Date()) return null;

  // Best-effort last-used bump — never block auth on this write.
  supabase
    .from('personal_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(undefined, () => {});

  // Fetch the owner's email for parity with the JWT path (used by /verify).
  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', data.user_id)
    .single();

  return { userId: data.user_id, email: profile?.email || '', via: 'pat' };
}
