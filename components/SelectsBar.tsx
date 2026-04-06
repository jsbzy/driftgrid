'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { Concept, WorkingSet } from '@/lib/types';
import { AnimatedDots } from './AnimatedDots';

type BarState = 'default' | 'hidden' | 'expanded';

interface SelectsBarProps {
  concepts: Concept[];
  selections: Map<string, string>;
  client: string;
  project: string;
  workingSets: WorkingSet[];
  activeWorkingSetId: string | null;
  onSaveWorkingSet: () => void;
  onLoadWorkingSet: (id: string) => void;
  onClearSelections: () => void;
  onPresent: () => void;
  onThumbnailClick: (conceptIndex: number, versionIndex: number) => void;
  thumbVersion?: number;
}

export function SelectsBar({
  concepts,
  selections,
  client,
  project,
  workingSets,
  activeWorkingSetId,
  onSaveWorkingSet,
  onLoadWorkingSet,
  onClearSelections,
  onPresent,
  onThumbnailClick,
  thumbVersion = 0,
}: SelectsBarProps) {
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const [setsOpen, setSetsOpen] = useState(false);
  const setsRef = useRef<HTMLDivElement>(null);
  const [barState, setBarState] = useState<BarState>('default');

  const count = selections.size;

  useEffect(() => {
    if (!exportOpen && !setsOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportOpen && exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
      if (setsOpen && setsRef.current && !setsRef.current.contains(e.target as Node)) setSetsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportOpen, setsOpen]);

  const selectedItems = useMemo(() => {
    const items: {
      conceptId: string; conceptLabel: string; versionId: string;
      versionNumber: number; thumbSrc: string | null;
      conceptIndex: number; versionIndex: number;
    }[] = [];

    concepts.forEach((concept, ci) => {
      const selectedVersionId = selections.get(concept.id);
      if (!selectedVersionId) return;
      const vi = concept.versions.findIndex(v => v.id === selectedVersionId);
      if (vi < 0) return;
      const version = concept.versions[vi];
      const thumbFilename = version.thumbnail?.replace('.thumbs/', '') || null;
      const thumbSrc = thumbFilename ? `/api/thumbs/${client}/${project}/${thumbFilename}?v=${thumbVersion}` : null;
      items.push({
        conceptId: concept.id, conceptLabel: concept.label,
        versionId: version.id, versionNumber: version.number,
        thumbSrc, conceptIndex: ci, versionIndex: vi,
      });
    });

    return items;
  }, [concepts, selections, client, project, thumbVersion]);

  const doExport = async (format: 'pdf' | 'png' | 'html') => {
    setExporting(true); setExportOpen(false);
    try {
      const selections_arr = selectedItems.map(item => ({ conceptId: item.conceptId, versionId: item.versionId }));
      const res = await fetch('/api/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project, format, selections: selections_arr }),
      });
      if (!res.ok) { alert((await res.json().catch(() => null))?.error || 'Export failed'); return; }
      const blob = await res.blob();
      const match = (res.headers.get('Content-Disposition') || '').match(/filename="(.+)"/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = match?.[1] || `export.${format}`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { console.error('Export error:', err); }
    finally { setExporting(false); }
  };

  const cycleState = () => {
    setBarState(s => s === 'default' ? 'expanded' : s === 'expanded' ? 'hidden' : 'default');
  };

  // Thumbnail sizing per state
  const thumbW = barState === 'expanded' ? 420 : 180;
  const thumbH = barState === 'expanded' ? 280 : 110;

  return (
    <div
      className="shrink-0 border-t bg-[var(--background)] z-20 relative"
      style={{
        borderColor: 'rgba(0,0,0,0.08)',
        animation: 'selectsBarIn 250ms cubic-bezier(0.4, 0, 0.2, 1)',
        maxHeight: barState === 'expanded' ? '50vh' : undefined,
      }}
    >
      <style>{`
        @keyframes selectsBarIn {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

      {/* State toggle tab */}
      <button
        onClick={cycleState}
        className="absolute -top-6 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-t-md border border-b-0 bg-[var(--background)] transition-opacity hover:opacity-80 z-10"
        style={{ borderColor: 'var(--topbar-border)', fontSize: 9, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}
      >
        {barState === 'hidden' ? `▲ ${count} selects` : barState === 'expanded' ? '▼ Collapse' : '▲ Expand'}
      </button>

      {/* Thumbnails — visible in default and expanded states */}
      {barState !== 'hidden' && (
        <div
          className="overflow-x-auto overflow-y-hidden"
          style={{ maxHeight: barState === 'expanded' ? 'calc(50vh - 44px)' : undefined }}
        >
          <div className="flex items-start gap-3 px-4 pt-3 pb-2" style={{ minHeight: thumbH + 24 }}>
            {selectedItems.map(item => (
              <div key={`${item.conceptId}-${item.versionId}`} className="shrink-0 flex flex-col items-center">
              <button
                onClick={() => onThumbnailClick(item.conceptIndex, item.versionIndex)}
                className="rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-[#facc15]/50"
                style={{
                  width: thumbW, height: thumbH,
                  border: '2px solid #facc15',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                  background: 'white',
                }}
                title={`${item.conceptLabel} v${item.versionNumber}`}
              >
                {item.thumbSrc ? (
                  <img
                    src={item.thumbSrc}
                    alt={`${item.conceptLabel} v${item.versionNumber}`}
                    className="w-full h-full object-cover object-top"
                    draggable={false}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--background)]">
                    <span className="text-[10px]" style={{ color: 'var(--foreground)', opacity: 0.3 }}>v{item.versionNumber}</span>
                  </div>
                )}
              </button>
              <div className="mt-1 text-center truncate" style={{ width: thumbW }}>
                <span style={{ fontSize: barState === 'expanded' ? 10 : 9, color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }}>
                  {item.conceptLabel} · v{item.versionNumber}
                </span>
              </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions bar — always visible, wraps on mobile */}
      <div className="flex items-center gap-3 px-4 h-[36px] overflow-x-auto">
        <span
          className="text-[10px] tracking-wide shrink-0"
          style={{ color: 'var(--foreground)', opacity: 0.4, fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
        >
          {count} {count === 1 ? 'select' : 'selects'}
        </span>

        <div className="w-px h-4 bg-[var(--border)] opacity-30" />

        <div className="flex items-center gap-2 shrink-0">
          <BarButton onClick={onPresent}>Present</BarButton>

          <div ref={exportRef} className="relative">
            <BarButton onClick={() => setExportOpen(v => !v)} disabled={exporting}>
              {exporting ? <><span>Exporting</span><AnimatedDots /></> : 'Export'}
            </BarButton>
            {exportOpen && (
              <div className="absolute bottom-full right-0 mb-1 z-50 min-w-[140px] py-1 rounded-sm border border-[var(--border)] bg-[var(--background)] shadow-sm">
                <ExportItem label="PDF" onClick={() => doExport('pdf')} />
                <ExportItem label="PNG" onClick={() => doExport('png')} />
                <ExportItem label="HTML" onClick={() => doExport('html')} />
              </div>
            )}
          </div>

          <div ref={setsRef} className="relative">
            <BarButton onClick={() => workingSets.length === 0 ? onSaveWorkingSet() : setSetsOpen(v => !v)}
              active={!!activeWorkingSetId}>
              {activeWorkingSetId ? workingSets.find(ws => ws.id === activeWorkingSetId)?.name || 'Set' : 'Save set'}
            </BarButton>
            {setsOpen && (
              <div className="absolute bottom-full right-0 mb-1 z-50 min-w-[140px] py-1 rounded-sm border border-[var(--border)] bg-[var(--background)] shadow-sm">
                <button onClick={() => { setSetsOpen(false); onSaveWorkingSet(); }}
                  className="block w-full text-left px-3 py-1.5 text-[10px] tracking-wide text-[var(--foreground)] hover:bg-[var(--border)]/10 transition-colors"
                  style={{ fontFamily: 'var(--font-mono, monospace)' }}>+ Save current</button>
                {workingSets.length > 0 && <div className="my-1 border-t border-[var(--border)]" />}
                {workingSets.map(ws => (
                  <button key={ws.id} onClick={() => { setSetsOpen(false); onLoadWorkingSet(ws.id); }}
                    className="block w-full text-left px-3 py-1.5 text-[10px] tracking-wide transition-colors hover:bg-[var(--border)]/10"
                    style={{ color: ws.id === activeWorkingSetId ? 'var(--foreground)' : 'var(--muted)', fontWeight: ws.id === activeWorkingSetId ? 600 : 400, fontFamily: 'var(--font-mono, monospace)' }}>
                    {ws.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={onClearSelections}
            className="text-[10px] tracking-wide px-2 py-1 rounded transition-all hover:text-[var(--foreground)]"
            style={{ color: 'var(--muted)', fontFamily: 'var(--font-mono, monospace)' }} title="Clear all selections">
            Clear
          </button>
        </div>
      </div>
    </div>
  );
}

function BarButton({ children, onClick, disabled, active }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; active?: boolean;
}) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-[10px] tracking-wide px-2.5 py-1 rounded transition-all hover:bg-[var(--foreground)] hover:text-[var(--background)]"
      style={{
        color: active ? 'var(--foreground)' : 'var(--foreground)',
        border: '1px solid var(--border)',
        fontFamily: 'var(--font-mono, monospace)',
        fontWeight: active ? 600 : 400,
      }}>{children}</button>
  );
}

function ExportItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="block w-full text-left px-3 py-1 text-[10px] tracking-wide text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--border)]/10 transition-colors"
      style={{ fontFamily: 'var(--font-mono, monospace)' }}>{label}</button>
  );
}
