'use client';

import { useEffect, useState } from 'react';

/**
 * Fetches the share token for a project (designer mode only).
 * Returns null if no share exists or not in cloud mode.
 */
export function useShareToken(client: string, project: string, enabled: boolean) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;

    fetch(`/api/share?client=${encodeURIComponent(client)}&project=${encodeURIComponent(project)}`)
      .then(r => r.ok ? r.json() : [])
      .then((links: { token: string; is_active: boolean }[]) => {
        const active = links.find(l => l.is_active);
        if (active) setToken(active.token);
      })
      .catch(() => {});
  }, [client, project, enabled]);

  return token;
}
