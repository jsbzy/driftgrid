/**
 * Cloud client helpers — used by the local DriftGrid instance to communicate
 * with the cloud deployment (driftgrid.ai).
 *
 * All functions accept an accessToken (Supabase JWT) for authentication.
 */

const CLOUD_URL = process.env.NEXT_PUBLIC_DRIFTGRID_CLOUD_URL || 'https://driftgrid.ai';
const BATCH_SIZE_BYTES = 4 * 1024 * 1024; // ~4MB per batch (conservative under 5MB limit)

interface FileEntry {
  path: string;
  content: string; // plain text for text files, base64 for binary
  contentType: string;
}

interface PushResult {
  success: boolean;
  uploaded: number;
  failed: number;
  total: number;
  errors?: string[];
}

interface ShareResult {
  token: string;
  url: string;
  created_at: string;
}

interface VerifyResult {
  valid: boolean;
  userId?: string;
  email?: string;
  tier?: string;
  error?: string;
}

/**
 * Verify that a JWT is still valid against the cloud.
 */
export async function verifyToken(accessToken: string): Promise<VerifyResult> {
  const res = await fetch(`${CLOUD_URL}/api/cloud/verify`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return res.json();
}

/**
 * Fetch the sync-guard state of the cloud copy: whether a manifest exists for
 * (client, project) under the caller's account and the sha256 of its bytes.
 * See lib/sync-guard.ts for how callers use this to avoid clobbering cloud
 * changes. Throws on transport/auth failure so callers can distinguish
 * "cloud says absent" from "couldn't ask" — the guard must fail closed.
 */
export async function getCloudManifestState(
  accessToken: string,
  client: string,
  project: string,
): Promise<{ exists: boolean; hash: string | null }> {
  const params = new URLSearchParams({ client, project });
  const res = await fetch(`${CLOUD_URL}/api/cloud/manifest-state?${params}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `manifest-state failed: HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * Refresh an expired access token using the refresh token.
 * Calls Supabase Auth's token refresh endpoint directly.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
} | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If we don't have Supabase keys locally (normal for local dev), use the cloud refresh endpoint
  if (!supabaseUrl || !supabaseAnonKey) {
    // Fall back — the user will need to re-authenticate
    return null;
  }

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': supabaseAnonKey,
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  if (!res.ok) return null;

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
}

/**
 * Push files to the cloud in batches.
 */
export async function pushFilesToCloud(
  accessToken: string,
  client: string,
  project: string,
  files: FileEntry[],
  onProgress?: (uploaded: number, total: number, bytesUploaded: number) => void,
  scope?: 'project' | 'client',
): Promise<PushResult> {
  // Split files into batches by estimated size
  const batches: FileEntry[][] = [];
  let currentBatch: FileEntry[] = [];
  let currentSize = 0;

  for (const file of files) {
    const fileSize = file.content.length;
    if (currentSize + fileSize > BATCH_SIZE_BYTES && currentBatch.length > 0) {
      batches.push(currentBatch);
      currentBatch = [];
      currentSize = 0;
    }
    currentBatch.push(file);
    currentSize += fileSize;
  }
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  let totalUploaded = 0;
  let totalFailed = 0;
  let totalBytesUploaded = 0;
  const allErrors: string[] = [];

  for (const batch of batches) {
    const batchBytes = batch.reduce((n, f) => n + f.content.length, 0);
    const res = await fetch(`${CLOUD_URL}/api/cloud/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ client, project, files: batch, ...(scope && { scope }) }),
    });

    if (!res.ok) {
      totalFailed += batch.length;
      const err = await res.json().catch(() => ({ error: 'Network error' }));
      allErrors.push(err.error || 'Push failed');
      continue;
    }

    const result: PushResult = await res.json();
    totalUploaded += result.uploaded;
    totalFailed += result.failed;
    totalBytesUploaded += batchBytes;
    if (result.errors) allErrors.push(...result.errors);

    onProgress?.(totalUploaded, files.length, totalBytesUploaded);
  }

  return {
    success: totalFailed === 0,
    uploaded: totalUploaded,
    failed: totalFailed,
    total: files.length,
    errors: allErrors.length > 0 ? allErrors : undefined,
  };
}

/**
 * Create a share link on the cloud.
 */
export async function createCloudShare(
  accessToken: string,
  client: string,
  project: string,
  roundNumber?: number | null,
): Promise<ShareResult | { error: string }> {
  const res = await fetch(`${CLOUD_URL}/api/cloud/share`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ client, project, roundNumber: roundNumber ?? null }),
  });

  return res.json();
}

/**
 * Fetch the formatted client-comments text for a share token from the cloud.
 * Used by the local /api/cloud/comments route to proxy comment fetches so the
 * browser doesn't have to make a cross-origin request (the cloud endpoint
 * doesn't set CORS headers).
 */
export async function getCloudComments(
  token: string,
): Promise<{ text: string; count: number } | { error: string; status: number }> {
  const res = await fetch(`${CLOUD_URL}/api/cloud/comments?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    return { error: body?.error || `HTTP ${res.status}`, status: res.status };
  }
  return res.json();
}

/**
 * Look up whether a share already exists for (user, client, project) on the cloud.
 * Used by the local /api/cloud/share-status route to surface an existing share in
 * the SharePanel without requiring a republish.
 */
export async function getCloudShareStatus(
  accessToken: string,
  client: string,
  project: string,
  roundNumber?: number | null,
): Promise<
  | { exists: true; token: string; url: string; lastPublishedAt?: string; roundNumber?: number | null }
  | { exists: false }
  | { needsAuth: true }
  | { error: string }
> {
  const res = await fetch(`${CLOUD_URL}/api/cloud/share-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client, project, accessToken, roundNumber: roundNumber ?? null }),
  });
  if (res.status === 401) return { needsAuth: true };
  return res.json();
}
