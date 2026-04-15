'use client';

import { memo } from 'react';

interface ShortcutsBarProps {
  visible: boolean;
  onToggle: () => void;
}

type Item = { keys: string; label: string };

// Flat, frequency-ordered. No section headers.
const ITEMS: Item[] = [
  { keys: 'G', label: 'Toggle Grid' },
  { keys: 'D', label: 'Drift Up (New Version)' },
  { keys: 'Shift + D', label: 'Drift Right (New Concept)' },
  { keys: 'C', label: 'Comment for Agent' },
  { keys: 'S', label: 'Star' },
  { keys: 'H', label: 'Hide' },
];

export const ShortcutsBar = memo(function ShortcutsBar({ visible, onToggle }: ShortcutsBarProps) {
  if (!visible) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="Show shortcuts (?)"
        style={{
          position: 'fixed',
          left: 14,
          bottom: 14,
          zIndex: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 22,
          height: 22,
          borderRadius: 999,
          background: 'transparent',
          border: 'none',
          color: 'var(--foreground)',
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          fontSize: 11,
          fontWeight: 500,
          cursor: 'pointer',
          opacity: 0.25,
          transition: 'opacity 0.15s ease',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.8'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.25'; }}
      >
        ?
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 28,
        transform: 'translateX(-50%)',
        maxWidth: 'calc(100vw - 120px)',
        zIndex: 40,
        display: 'flex',
        flexWrap: 'nowrap',
        justifyContent: 'center',
        columnGap: 16,
        padding: '9px 18px',
        borderRadius: 999,
        background: 'rgba(20, 20, 20, 0.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        fontSize: 10,
        letterSpacing: '0.01em',
        lineHeight: 1.4,
        color: '#fff',
        opacity: 0.7,
        transition: 'opacity 0.2s ease',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.7'; }}
    >
      {ITEMS.map((item) => (
        <span key={item.label} style={{ whiteSpace: 'nowrap' }}>
          <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.95)' }}>{item.keys}</span>
          <span style={{ color: 'rgba(255,255,255,0.55)', marginLeft: 5 }}>{item.label}</span>
        </span>
      ))}
    </div>
  );
});
