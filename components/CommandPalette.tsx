'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Command {
  label: string;
  shortcut: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onFitAll: () => void;
  onZoomColumn: () => void;
  onZoomCard: () => void;
  onToggleStar: () => void;
  onPresent: () => void;
  onGoToLatest: () => void;
  onClearSelections: () => void;
  onToggleTheme: () => void;
  onToggleHud: () => void;
  onToggleNavbar: () => void;
  onCloseRound: () => void;
  onToggleGridFrame?: () => void;
  onDrift?: () => void;
  onBranch?: () => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onEditMode?: () => void;
  onCopyFeedback?: () => void;
  onExportPng?: () => void;
  onExportDoc?: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onFitAll,
  onZoomColumn,
  onZoomCard,
  onToggleStar,
  onPresent,
  onGoToLatest,
  onClearSelections,
  onToggleTheme,
  onToggleHud,
  onToggleNavbar,
  onCloseRound,
  onToggleGridFrame,
  onDrift,
  onBranch,
  onDelete,
  onUndo,
  onEditMode,
  onCopyFeedback,
  onExportPng,
  onExportDoc,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const commands: Command[] = [
    { label: 'Zoom to fit all', shortcut: '0', action: onFitAll },
    { label: 'Zoom to column', shortcut: '1', action: onZoomColumn },
    { label: 'Zoom to card', shortcut: '4', action: onZoomCard },
    { label: 'Star / unstar', shortcut: 'S', action: onToggleStar },
    { label: 'Present selects', shortcut: 'P', action: onPresent },
    { label: 'Go to latest version', shortcut: '', action: onGoToLatest },
    { label: 'Clear all selects', shortcut: '', action: onClearSelections },
    { label: 'Toggle theme', shortcut: '', action: onToggleTheme },
    { label: 'Toggle HUD', shortcut: 'H', action: onToggleHud },
    { label: 'Toggle navbar', shortcut: 'N', action: onToggleNavbar },
    { label: 'Close round', shortcut: '', action: onCloseRound },
    ...(onToggleGridFrame ? [{ label: 'Toggle grid / frame', shortcut: 'G', action: onToggleGridFrame }] : []),
    ...(onDrift ? [{ label: 'Drift \u2193 new version', shortcut: 'D', action: onDrift }] : []),
    ...(onBranch ? [{ label: 'Drift \u2192 new concept', shortcut: '\u21e7D', action: onBranch }] : []),
    ...(onDelete ? [{ label: 'Delete version', shortcut: 'Del', action: onDelete }] : []),
    ...(onUndo ? [{ label: 'Undo', shortcut: '\u2318Z', action: onUndo }] : []),
    ...(onEditMode ? [{ label: 'Edit mode', shortcut: 'E', action: onEditMode }] : []),
    ...(onCopyFeedback ? [{ label: 'Copy feedback', shortcut: 'F', action: onCopyFeedback }] : []),
    ...(onExportPng ? [{ label: 'Export PNG', shortcut: '', action: onExportPng }] : []),
    ...(onExportDoc ? [{ label: 'Copy as doc (text for Google Docs)', shortcut: '', action: onExportDoc }] : []),
  ];

  // Fuzzy match: every character in the query must appear in order in the label
  const fuzzyMatch = useCallback((label: string, q: string): boolean => {
    if (!q) return true;
    const lower = label.toLowerCase();
    const qLower = q.toLowerCase();
    let j = 0;
    for (let i = 0; i < lower.length && j < qLower.length; i++) {
      if (lower[i] === qLower[j]) j++;
    }
    return j === qLower.length;
  }, []);

  const filtered = commands.filter(cmd => fuzzyMatch(cmd.label, query));

  // Reset highlight when query changes
  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  // Auto-focus and reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setHighlightIndex(0);
      // Small delay to ensure the modal is rendered before focusing
      requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
    }
  }, [open]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.children;
    const item = items[highlightIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIndex]);

  const executeCommand = useCallback((cmd: Command) => {
    cmd.action();
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(i => (i + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(i => (i - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[highlightIndex];
      if (cmd) executeCommand(cmd);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [filtered, highlightIndex, executeCommand, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center pt-[20vh]"
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] mx-4 border overflow-hidden shadow-xl"
        style={{
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          background: 'var(--background)',
          borderColor: 'var(--border)',
          borderRadius: 'var(--radius-md, 8px)',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="w-full bg-transparent outline-none"
            style={{
              fontSize: 14,
              padding: '12px 16px',
              color: 'var(--foreground)',
              border: 'none',
            }}
          />
        </div>

        {/* Command list */}
        <div
          ref={listRef}
          style={{ maxHeight: 300, overflowY: 'auto', padding: '4px 0' }}
        >
          {filtered.length === 0 && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--muted)',
                padding: '12px 16px',
              }}
            >
              No matching commands
            </div>
          )}
          {filtered.map((cmd, i) => (
            <div
              key={cmd.label}
              className="flex items-center justify-between cursor-pointer"
              style={{
                fontSize: 12,
                padding: '8px 16px',
                color: 'var(--foreground)',
                background: i === highlightIndex ? 'rgba(0,0,0,0.06)' : 'transparent',
                transition: 'background 0.1s',
              }}
              onMouseEnter={() => setHighlightIndex(i)}
              onClick={() => executeCommand(cmd)}
            >
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>
                  {cmd.shortcut}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
