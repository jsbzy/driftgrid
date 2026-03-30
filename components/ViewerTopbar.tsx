'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import type { WorkingSet } from '@/lib/types';
import { numberToLetter } from '@/lib/letters';
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
  viewMode: 'frame' | 'grid';
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
  onApplyEdits?: () => Promise<void>;
  frameWidth?: number;
  onGoToGrid?: () => void;
  onGoToConceptColumn?: () => void;
  onGoToOverview?: () => void;
  versionFile?: string;
  conceptId?: string;
  onIterated?: (newVersionId: string, newVersionNumber: number) => void;
}

export function ViewerTopbar({
  client,
  clientSlug,
  project,
  projectName,
  conceptLabel,
  versionNumber,
  versionId,
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
  onApplyEdits,
  frameWidth,
  onGoToGrid,
  onGoToConceptColumn,
  onGoToOverview,
  versionFile,
  conceptId,
  onIterated,
}: ViewerTopbarProps) {
  return (
    <div className="h-10 flex items-center justify-center shrink-0 z-10" style={{ borderBottom: '1px solid var(--topbar-border)', background: 'var(--topbar-bg)' }}>
    <div
      className="h-full flex items-center justify-between w-full"
      style={frameWidth ? { maxWidth: frameWidth, padding: '0 2px' } : { padding: '0 16px' }}
    >
      {/* Left: client · project · concept · version · canvas */}
      <div className="flex items-center gap-2.5 text-xs">
        <Link
          href="/"
          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
          title="All projects"
        >
          ≡
        </Link>
        <span className="text-[var(--border)]">&middot;</span>
        <Link
          href={isClientMode ? `/review/${clientSlug}` : '/'}
          className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
        >
          {client}
        </Link>
        <span className="text-[var(--border)]">&middot;</span>
        <button
          onClick={viewMode === 'frame' && onGoToOverview ? onGoToOverview : onGoToGrid}
          className="font-medium hover:text-[var(--muted)] transition-colors cursor-pointer"
        >
          {projectName}
        </button>
        <span className="text-[var(--border)]">&middot;</span>
        <button
          onClick={viewMode === 'frame' && onGoToConceptColumn ? onGoToConceptColumn : onGoToGrid}
          className="font-medium text-[var(--foreground)] hover:text-[var(--muted)] transition-colors cursor-pointer"
        >
          {conceptLabel}
        </button>
        <span className="text-[var(--border)]">&middot;</span>
        <span className="text-[var(--muted)]">{numberToLetter(versionNumber)}</span>
        {canvasLabel && (
          <>
            <span className="text-[var(--border)]">&middot;</span>
            <span className="text-[10px] text-[var(--border)]">{canvasLabel}</span>
          </>
        )}
        {viewMode === 'frame' && versionFile && (
          <>
            <span className="text-[var(--border)]">&middot;</span>
            <button
              onClick={() => {
                const fullPath = `~/drift/projects/${clientSlug}/${project}/${versionFile}`;
                navigator.clipboard.writeText(fullPath);
                const el = document.activeElement as HTMLElement;
                el?.blur();
              }}
              className="text-[10px] text-[var(--border)] hover:text-[var(--muted)] transition-colors cursor-pointer truncate max-w-[200px]"
              title={`~/drift/projects/${clientSlug}/${project}/${versionFile} — click to copy`}
              style={{ fontFamily: 'var(--font-mono, monospace)' }}
            >
              {versionFile}
            </button>
          </>
        )}
      </div>

      {/* Right: edit controls */}
      <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
        {isClientMode && (
          <span style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '0.05em' }}>
            Click anywhere to comment
          </span>
        )}
        {!isClientMode && versionFile && (
          <IterateButton clientSlug={clientSlug} project={project} versionFile={versionFile} conceptId={conceptId} versionId={versionId} onIterated={onIterated} />
        )}
        {!isClientMode && (
          <ExportButton
            client={clientSlug}
            project={project}
            versionId={versionId}
            workingSets={workingSets}
          />
        )}
        <ThemeToggle />
      </div>
    </div>
    </div>
  );
}

function IterateButton({ clientSlug, project, versionFile, conceptId, versionId, onIterated }: {
  clientSlug: string; project: string; versionFile: string;
  conceptId?: string; versionId?: string;
  onIterated?: (newVersionId: string, newVersionNumber: number) => void;
}) {
  const [state, setState] = useState<'idle' | 'working' | 'done'>('idle');

  return (
    <button
      onClick={async () => {
        if (!conceptId || !versionId || state === 'working') return;
        setState('working');
        try {
          const res = await fetch('/api/iterate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client: clientSlug, project, conceptId, versionId }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            alert(data?.error || 'Failed to iterate');
            setState('idle');
            return;
          }
          const { absolutePath, versionNumber, versionId: newVid } = await res.json();
          try { await navigator.clipboard.writeText(absolutePath); } catch { /* clipboard may be unavailable */ }
          setState('done');
          onIterated?.(newVid, versionNumber);
          setTimeout(() => setState('idle'), 1500);
        } catch {
          setState('idle');
        }
      }}
      disabled={state === 'working'}
      className="flex items-center gap-1.5 transition-colors"
      style={{
        color: state === 'done' ? '#059669' : 'var(--foreground)',
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        opacity: state === 'working' ? 0.5 : 1,
      }}
      title="Create new version and copy path to iterate with AI"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
      </svg>
      <span>{state === 'working' ? 'DRIFTING...' : state === 'done' ? 'DRIFTED \u2713' : 'DRIFT'}</span>
    </button>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  // Sync with DOM on mount
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('driftgrid-theme', next ? 'dark' : 'light'); } catch {}
  };

  return (
    <button
      onClick={toggle}
      className="p-1 rounded transition-colors hover:bg-[var(--border)]"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ opacity: 0.4 }}
    >
      {dark ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      )}
    </button>
  );
}
