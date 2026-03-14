'use client';

import { useState, useRef, useEffect } from 'react';
import type { WorkingSet } from '@/lib/types';

interface ExportButtonProps {
  client: string;
  project: string;
  versionId: string;
  workingSets: WorkingSet[];
}

type ExportFormat = 'pdf' | 'png' | 'pptx' | 'html';

export function ExportButton({
  client,
  project,
  versionId,
  workingSets,
}: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const doExport = async (format: ExportFormat, workingSetId?: string) => {
    setExporting(true);
    setOpen(false);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client,
          project,
          format,
          versionId: workingSetId ? undefined : versionId,
          workingSetId,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        const msg = data?.error || 'Export failed';
        alert(msg);
        return;
      }

      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const filename = match?.[1] || `export.${format}`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={exporting}
        className="text-[10px] tracking-wide text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
      >
        {exporting ? 'Exporting...' : 'Export'}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 min-w-[160px] py-1 rounded-sm border border-[var(--border)] bg-[var(--background)] shadow-sm"
        >
          <div className="px-3 py-1.5 text-[9px] tracking-widest uppercase text-[var(--border)]">
            This version
          </div>
          <DropdownItem label="PDF" onClick={() => doExport('pdf')} />
          <DropdownItem label="HTML" onClick={() => doExport('html')} />

          {workingSets.length > 0 && (
            <>
              <div className="my-1 border-t border-[var(--border)]" />
              <div className="px-3 py-1.5 text-[9px] tracking-widest uppercase text-[var(--border)]">
                Working sets
              </div>
              {workingSets.map(ws => (
                <div key={ws.id}>
                  <div className="px-3 py-1 text-[10px] text-[var(--foreground)]">
                    {ws.name}
                  </div>
                  <div className="flex gap-2 px-3 pb-1">
                    <button
                      onClick={() => doExport('pdf', ws.id)}
                      className="text-[10px] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                    >
                      PDF
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DropdownItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="block w-full text-left px-3 py-1 text-[10px] tracking-wide text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]/10 transition-colors"
    >
      {label}
    </button>
  );
}
