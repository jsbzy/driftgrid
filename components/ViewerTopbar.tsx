'use client';

import Link from 'next/link';
import type { WorkingSet } from '@/lib/types';
import { ExportButton } from './ExportButton';
import { EditToggle } from './EditToggle';

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
  isClientMode?: boolean;
  editMode?: boolean;
  onToggleEdit?: () => void;
  editCount?: number;
  hasEdits?: boolean;
  viewEdited?: boolean;
  onToggleView?: (edited: boolean) => void;
  onExportPdf?: () => Promise<void> | void;
  onExportHtml?: () => Promise<void> | void;
  onClearEdits?: () => void;
  frameWidth?: number;
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
  isClientMode,
  editMode,
  onToggleEdit,
  editCount,
  hasEdits,
  viewEdited,
  onToggleView,
  onExportPdf,
  onExportHtml,
  onClearEdits,
  frameWidth,
}: ViewerTopbarProps) {
  return (
    <div className="h-10 flex items-center justify-center border-b border-[var(--border)] bg-[var(--background)] shrink-0 z-10">
    <div
      className="h-full flex items-center justify-between w-full"
      style={frameWidth ? { maxWidth: frameWidth, padding: '0 2px' } : { padding: '0 16px' }}
    >
      {/* Left: client · project · concept · version · canvas */}
      <div className="flex items-center gap-2.5 text-xs">
        <Link
          href={`/review/${clientSlug}`}
          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          {client}
        </Link>
        <span className="text-[var(--border)]">&middot;</span>
        <span className="font-medium">{projectName}</span>
        <span className="text-[var(--border)]">&middot;</span>
        <span className="font-medium text-[var(--foreground)]">{conceptLabel}</span>
        <span className="text-[var(--border)]">&middot;</span>
        <span className="text-[var(--muted)]">v{versionNumber}</span>
        {canvasLabel && (
          <>
            <span className="text-[var(--border)]">&middot;</span>
            <span className="text-[10px] text-[var(--border)]">{canvasLabel}</span>
          </>
        )}
      </div>

      {/* Right: edit controls */}
      <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
        {isClientMode && onToggleEdit && onToggleView ? (
          <EditToggle
            editMode={editMode ?? false}
            onToggleEdit={onToggleEdit}
            editCount={editCount ?? 0}
            hasEdits={hasEdits ?? false}
            viewEdited={viewEdited ?? false}
            onToggleView={onToggleView}
            onExportPdf={onExportPdf}
            onExportHtml={onExportHtml}
            onClearEdits={onClearEdits}
          />
        ) : (
          <ExportButton
            client={clientSlug}
            project={project}
            versionId={versionId}
            workingSets={workingSets}
          />
        )}
      </div>
    </div>
    </div>
  );
}
