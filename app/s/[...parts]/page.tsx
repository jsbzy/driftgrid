import { notFound, redirect } from 'next/navigation';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';
import { Viewer } from '@/components/Viewer';

/**
 * Share page catch-all. Handles two URL shapes with a single route:
 *
 *   /s/{token}              — legacy short form. Resolves the token, then 307-redirects
 *                             to the canonical `/s/{client}/{token}` URL.
 *   /s/{client-slug}/{token} — canonical. The slug is cosmetic — DB lookup is still
 *                             by token alone. If the slug doesn't match the share's
 *                             actual client, we 307-redirect to the correct slug so
 *                             bookmarks stay truthful.
 *
 * Next.js forbids sibling dynamic routes with different slug names at the same depth
 * (i.e. `/s/[token]` and `/s/[client]/[token]` can't coexist). Using a single
 * `[...parts]` catch-all sidesteps that and lets us branch on the array length.
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ parts: string[] }>;
}) {
  const { parts } = await params;

  let urlClient: string | undefined;
  let token: string;

  if (!parts || parts.length === 0) {
    notFound();
  } else if (parts.length === 1) {
    token = parts[0];
  } else if (parts.length === 2) {
    urlClient = parts[0];
    token = parts[1];
  } else {
    notFound();
  }

  let userId: string | undefined;
  let actualClient: string | undefined;
  let project: string | undefined;

  if (isCloudMode()) {
    const supabase = getSupabaseAdmin();
    try {
      const { data } = await supabase
        .from('share_links')
        .select('user_id, client, project, expires_at, is_active')
        .eq('token', token!)
        .single();

      if (data?.is_active) {
        if (!data.expires_at || new Date(data.expires_at) > new Date()) {
          userId = data.user_id;
          actualClient = data.client;
          project = data.project;
        }
      }
    } catch {
      // Table may not be in schema cache yet — fall through to base64url decode.
    }
  }

  // Fallback: base64url-encoded `userId/client/project` (legacy tokens).
  if (!actualClient) {
    try {
      const decoded = Buffer.from(token!, 'base64url').toString('utf-8');
      const p = decoded.split('/');
      if (p.length === 3) {
        userId = p[0];
        actualClient = p[1];
        project = p[2];
      }
    } catch {
      // Invalid token
    }
  }

  if (!actualClient || !project) {
    notFound();
  }

  // Canonicalize the URL: if the slug is missing or doesn't match the share's
  // real client, redirect to `/s/{actualClient}/{token}`.
  if (urlClient !== actualClient) {
    redirect(`/s/${actualClient}/${token!}`);
  }

  // Verify the project exists in storage before rendering.
  if (isCloudMode() && userId) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from('projects')
      .download(`${userId}/${actualClient}/${project}/manifest.json`);
    if (error) notFound();
  }

  return <Viewer client={actualClient} project={project} mode="client" shareToken={token!} />;
}
