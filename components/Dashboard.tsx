'use client';

import useSWR from 'swr';
import Link from 'next/link';
import type { ClientInfo } from '@/lib/types';
import { resolveCanvas } from '@/lib/constants';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function Dashboard() {
  const { data: clients, isLoading } = useSWR<ClientInfo[]>('/api/clients', fetcher);

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-12">
        <h1 className="text-sm font-medium tracking-widest uppercase text-[var(--muted)]">
          DriftGrid
        </h1>
      </header>

      {isLoading && (
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      )}

      {clients && clients.length === 0 && (
        <p className="text-sm text-[var(--muted)]">
          No projects yet. Create one by adding files to the projects/ directory.
        </p>
      )}

      {clients?.map(client => (
        <section key={client.slug} className="mb-10">
          <h2 className="text-xs font-medium tracking-widest uppercase text-[var(--muted)] mb-4">
            {client.name}
          </h2>
          <div className="space-y-2">
            {client.projects.map(project => {
              const resolved = resolveCanvas(project.canvas);
              return (
                <Link
                  key={project.slug}
                  href={`/admin/${client.slug}/${project.slug}`}
                  className="block group"
                >
                  <div className="flex items-baseline justify-between py-3 px-4 rounded-lg border border-transparent hover:border-[var(--border)] transition-colors">
                    <div className="flex items-baseline gap-4">
                      <span className="text-base font-medium">
                        {project.name}
                      </span>
                      <span className="text-xs text-[var(--muted)]">
                        {project.conceptCount} concept{project.conceptCount !== 1 ? 's' : ''} / {project.versionCount} version{project.versionCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--muted)]">
                      {resolved.label}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
