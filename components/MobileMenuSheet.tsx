'use client';

import { MobileBottomSheet } from './MobileBottomSheet';

interface MobileMenuSheetProps {
  open: boolean;
  onClose: () => void;
  // Navigation
  projectName?: string;
  client?: string;
  clientSlug?: string;
  canvasLabel?: string;
  versionFile?: string;
  // Round switching
  rounds?: { id: string; number: number; name: string; closedAt?: string | null }[];
  activeRoundId?: string | null;
  onSwitchRound?: (id: string) => void;
  onNewRound?: () => void;
  onCloseRound?: () => void;
  // Actions
  onExportPng?: () => void;
  onToggleTheme?: () => void;
  onShowShortcuts?: () => void;
  onToggleShowHidden?: () => void;
  showHidden?: boolean;
  isDesigner?: boolean;
}

export function MobileMenuSheet({
  open,
  onClose,
  projectName,
  client,
  canvasLabel,
  versionFile,
  rounds = [],
  activeRoundId,
  onSwitchRound,
  onNewRound,
  onCloseRound,
  onExportPng,
  onToggleTheme,
  onToggleShowHidden,
  showHidden,
  isDesigner,
}: MobileMenuSheetProps) {
  const menuItem = "flex items-center gap-3 w-full px-4 py-3 text-left transition-colors";
  const menuLabel = { fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: 'var(--foreground)' };
  const menuSub = { fontSize: 10, fontFamily: 'var(--font-mono, monospace)', color: 'var(--muted)' };

  return (
    <MobileBottomSheet open={open} onClose={onClose} title="Menu" maxHeight="70vh">
      <div className="pb-4">
        {/* Project info */}
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <div style={menuLabel}>{projectName || 'Project'}</div>
          <div className="flex items-center gap-2 mt-1">
            {client && <span style={menuSub}>{client}</span>}
            {canvasLabel && (
              <>
                <span style={{ ...menuSub, opacity: 0.4 }}>&middot;</span>
                <span style={menuSub}>{canvasLabel}</span>
              </>
            )}
          </div>
          {versionFile && (
            <div className="mt-1 truncate" style={{ ...menuSub, fontSize: 9, opacity: 0.5 }}>{versionFile}</div>
          )}
        </div>

        {/* Rounds — designer only */}
        {isDesigner && rounds.length > 1 && (
          <div className="border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="px-4 pt-3 pb-1">
              <span className="text-[9px] tracking-wide uppercase" style={{ color: 'var(--muted)' }}>Rounds</span>
            </div>
            <div className="flex flex-wrap gap-1.5 px-4 pb-3">
              {rounds.map(r => (
                <button
                  key={r.id}
                  onClick={() => { onSwitchRound?.(r.id); onClose(); }}
                  className="px-2.5 py-1 rounded-md text-xs transition-colors"
                  style={{
                    fontFamily: 'var(--font-mono, monospace)',
                    fontWeight: r.id === activeRoundId ? 600 : 400,
                    color: r.id === activeRoundId ? 'var(--foreground)' : 'var(--muted)',
                    background: r.id === activeRoundId ? 'var(--border)' : 'transparent',
                    border: '1px solid var(--border)',
                  }}
                >
                  R{r.number} {r.name}{r.closedAt ? '' : ' *'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        {isDesigner && onNewRound && (
          <button onClick={() => { onNewRound(); onClose(); }} className={menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            <span style={menuLabel}>New Round</span>
          </button>
        )}
        {isDesigner && onCloseRound && (
          <button onClick={() => { onCloseRound(); onClose(); }} className={menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5"><polyline points="20 6 9 17 4 12" /></svg>
            <span style={menuLabel}>Close Round</span>
          </button>
        )}
        {onExportPng && (
          <button onClick={() => { onExportPng(); onClose(); }} className={menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            <span style={menuLabel}>Export PNG</span>
          </button>
        )}
        {onToggleTheme && (
          <button onClick={() => { onToggleTheme(); onClose(); }} className={menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
            <span style={menuLabel}>Toggle Theme</span>
          </button>
        )}
        {isDesigner && onToggleShowHidden && (
          <button onClick={() => { onToggleShowHidden(); onClose(); }} className={menuItem}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" strokeWidth="1.5">
              {showHidden ? (
                <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
              ) : (
                <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
              )}
            </svg>
            <span style={menuLabel}>{showHidden ? 'Hide Hidden' : 'Show Hidden'}</span>
          </button>
        )}
      </div>
    </MobileBottomSheet>
  );
}
