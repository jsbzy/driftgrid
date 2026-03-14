'use client';

import Link from 'next/link';
import type { WorkingSet } from '@/lib/types';
import { ExportButton } from './ExportButton';

interface ViewerTopbarProps {
  client: string;
  clientSlug: string;
  project: string;
  projectName: string;
  conceptLabel: string;
  versionNumber: number;
  versionId: string;
  gridVisible: boolean;
  viewMode: 'fullscreen' | 'grid';
  workingSets: WorkingSet[];
  canvasLabel?: string;
}

export function ViewerTopbar({
  client,
  clientSlug,
  project,
  projectName,
  conceptLabel,
  versionNumber,
  versionId,
  gridVisible,
  viewMode,
  workingSets,
  canvasLabel,
}: ViewerTopbarProps) {
  return (
    <div className="h-10 flex items-center justify-between px-4 border-b border-[var(--border)] bg-[var(--background)] shrink-0 z-10">
      {/* Left: Drift · client · project · canvas */}
      <div className="flex items-center gap-2.5 text-xs">
        <Link
          href="/"
          className="font-medium text-[var(--foreground)] hover:text-[var(--muted)] transition-colors"
        >
          Drift
        </Link>
        <span className="text-[var(--border)]">·</span>
        <span className="text-[var(--muted)]">{client}</span>
        <span className="text-[var(--border)]">·</span>
        <span className="font-medium">{projectName}</span>
        {canvasLabel && (
          <>
            <span className="text-[var(--border)]">·</span>
            <span className="text-[10px] text-[var(--border)]">{canvasLabel}</span>
          </>
        )}
      </div>

      {/* Center: hints */}
      <div className="flex items-center gap-4 text-[10px] text-[var(--border)] tracking-wide">
        <span>? for shortcuts</span>
      </div>

      {/* Right: export · concept label · version */}
      <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
        <ExportButton
          client={clientSlug}
          project={project}
          versionId={versionId}
          workingSets={workingSets}
        />
        <span className="text-[var(--border)]">·</span>
        <span>
          <span className="font-medium text-[var(--foreground)]">{conceptLabel}</span>
          <span className="mx-1.5 text-[var(--border)]">·</span>
          v{versionNumber}
        </span>
      </div>
    </div>
  );
}
