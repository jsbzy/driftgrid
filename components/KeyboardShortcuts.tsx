'use client';

import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  visible: boolean;
  onClose: () => void;
}

const shortcuts: { key: string; desc: string }[] = [
  { key: '\u2190  \u2192  \u2191  \u2193', desc: 'Navigate' },
  { key: 'Enter', desc: 'Enter frame' },
  { key: 'Esc', desc: 'Back / exit' },
  { key: 'G', desc: 'Toggle grid / frame' },
  { key: 'D', desc: 'Drift \u2193 new version' },
  { key: '\u21e7D', desc: 'Drift \u2192 new concept' },
  { key: 'S', desc: 'Star / unstar' },
  { key: 'P', desc: 'Present selects' },
  { key: 'C', desc: 'Prompt (in frame)' },
  { key: 'Del / \u232b', desc: 'Delete version' },
  { key: '\u2318Z', desc: 'Undo' },
  { key: '\u2318K', desc: 'Command palette' },
  { key: '?', desc: 'This panel' },
];

export function KeyboardShortcuts({ visible, onClose }: KeyboardShortcutsProps) {
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/20" />
      <div
        className="relative bg-[var(--background)] border border-[var(--border)] rounded-lg p-6 min-w-[280px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[10px] font-medium tracking-widest uppercase text-[var(--muted)] mb-4">
          Keyboard shortcuts
        </div>
        <div className="space-y-2">
          {shortcuts.map(({ key, desc }) => (
            <div key={key} className="flex items-center justify-between gap-8">
              <span className="text-xs text-[var(--muted)]">{desc}</span>
              <span className="text-xs font-medium text-[var(--foreground)]">{key}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
