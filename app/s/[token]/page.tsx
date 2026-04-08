import { notFound } from 'next/navigation';
import { getSupabaseAdmin, isCloudMode } from '@/lib/supabase';
import { Viewer } from '@/components/Viewer';

/**
 * Share link page: /s/{token}
 *
 * Token format: base64url of "userId/client/project"
 * Or a database token from share_links table (when available).
 */
export default async function SharePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Try database lookup first
  let userId: string | undefined;
  let client: string | undefined;
  let project: string | undefined;

  if (isCloudMode()) {
    const supabase = getSupabaseAdmin();
    try {
      const { data } = await supabase
        .from('share_links')
        .select('user_id, client, project, expires_at, is_active')
        .eq('token', token)
        .single();

      if (data?.is_active) {
        if (!data.expires_at || new Date(data.expires_at) > new Date()) {
          userId = data.user_id;
          client = data.client;
          project = data.project;
        }
      }
    } catch {
      // Table might not be in schema cache yet — fall through to path-based token
    }
  }

  // Fallback: decode token as base64url path (userId/client/project)
  if (!client) {
    try {
      const decoded = Buffer.from(token, 'base64url').toString('utf-8');
      const parts = decoded.split('/');
      if (parts.length === 3) {
        userId = parts[0];
        client = parts[1];
        project = parts[2];
      }
    } catch {
      // Invalid token
    }
  }

  if (!client || !project) {
    notFound();
  }

  // Verify the project exists in storage
  if (isCloudMode() && userId) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.storage
      .from('projects')
      .download(`${userId}/${client}/${project}/manifest.json`);
    if (error) {
      notFound();
    }
  }

  return <Viewer client={client} project={project} mode="client" shareToken={token} />;
}
