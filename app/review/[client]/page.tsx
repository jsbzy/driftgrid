'use client';

import { use } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import type { ClientInfo } from '@/lib/types';
import { CANVAS_PRESETS } from '@/lib/constants';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function ClientDashboardPage({
  params,
}: {
  params: Promise<{ client: string }>;
}) {
  const { client } = use(params);
  const { data: clients, isLoading } = useSWR<ClientInfo[]>('/api/clients', fetcher);

  const clientData = clients?.find(c => c.slug === client);

  const clientName = clientData?.name ?? client
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-12">
        <h1 className="text-sm font-medium tracking-widest uppercase text-[var(--muted)]">
          Drift
        </h1>
      </header>

      {isLoading && (
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      )}

      {clientData && (
        <section className="mb-10">
          <h2 className="text-xs font-medium tracking-widest uppercase text-[var(--muted)] mb-4">
            {clientName}
          </h2>
          <div className="space-y-2">
            {clientData.projects.map(project => {
              const preset = CANVAS_PRESETS[project.canvas];
              return (
                <Link
                  key={project.slug}
                  href={`/review/${client}/${project.slug}`}
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
                      {preset?.label ?? project.canvas}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {!isLoading && !clientData && (
        <p className="text-sm text-[var(--muted)]">Client not found.</p>
      )}
    </div>
  );
}
