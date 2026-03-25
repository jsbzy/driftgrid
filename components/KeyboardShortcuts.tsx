'use client';

import { useEffect } from 'react';

interface KeyboardShortcutsProps {
  visible: boolean;
  onClose: () => void;
}

const shortcuts: { key: string; desc: string }[] = [
  { key: '←  →  ↑  ↓', desc: 'Navigate' },
  { key: 'Enter', desc: 'Drill down / open' },
  { key: 'Esc', desc: 'Back one level' },
  { key: 'G', desc: 'Toggle grid / frame' },
  { key: '`', desc: 'Overview zoom' },
  { key: '1 – 4', desc: 'Zoom levels' },
  { key: 'D', desc: 'Drift ↓ new version' },
  { key: '⇧D', desc: 'Drift → new concept' },
  { key: 'L', desc: 'Jump to latest version' },
  { key: 'S', desc: 'Star / unstar' },
  { key: 'Del / ⌫', desc: 'Delete version' },
  { key: '⌘Z', desc: 'Undo delete' },
  { key: 'Shift ← →', desc: 'Move column' },
  { key: 'Scroll', desc: 'Pan grid' },
  { key: '⌘ Scroll', desc: 'Zoom' },
  { key: 'P / ⌘↵', desc: 'Present selects' },
  { key: 'R', desc: 'Review selects on grid' },
  { key: 'A', desc: 'Annotate frame' },
  { key: 'F', desc: 'Copy feedback' },
  { key: '⇧F', desc: 'Copy feedback (JSON)' },
  { key: 'H', desc: 'Hide HUD' },
  { key: 'N', desc: 'Hide navbar' },
  { key: 'Shift+click', desc: 'Multi-star' },
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
