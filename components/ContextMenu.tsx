'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

interface RoundInfo {
  id: string;
  name: string;
  number: number;
}

interface ContextMenuProps {
  x: number;
  y: number;
  onStar: () => void;
  onDrift: () => void;
  onBranch: () => void;
  onCopyPath: () => void;
  onHide: () => void;
  onDriftToProject: () => void;
  onDelete: () => void;
  onZoomToCard: () => void;
  onClose: () => void;
  isStarred: boolean;
  rounds?: RoundInfo[];
  activeRoundId?: string;
  onSendToRound?: (roundId: string) => void;
  onSendToNewRound?: () => void;
}

interface MenuItem {
  label: string;
  shortcut: string;
  action: () => void;
  separator?: false;
  danger?: boolean;
}

interface SeparatorItem {
  separator: true;
}

type MenuEntry = MenuItem | SeparatorItem;

export function ContextMenu({
  x,
  y,
  onStar,
  onDrift,
  onBranch,
  onCopyPath,
  onHide,
  onDriftToProject,
  onDelete,
  onZoomToCard,
  onClose,
  isStarred,
  rounds,
  activeRoundId,
  onSendToRound,
  onSendToNewRound,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState({ x, y });

  const items: MenuEntry[] = [
    { label: isStarred ? 'Unstar' : 'Star', shortcut: 'S', action: onStar },
    { label: 'Drift \u2193 new version', shortcut: 'D', action: onDrift },
    { label: 'Drift \u2192 new concept', shortcut: '\u21e7D', action: onBranch },
    { label: 'Copy path', shortcut: '\u2318C', action: onCopyPath },
    { label: 'Hide', shortcut: '', action: onHide },
    { label: 'Drift to new project', shortcut: '', action: onDriftToProject },
    ...(rounds && rounds.length > 1 && onSendToRound ? [
      { separator: true } as SeparatorItem,
      ...rounds
        .filter(r => r.id !== activeRoundId)
        .map(r => ({
          label: `Send to ${r.name}`,
          shortcut: '',
          action: () => onSendToRound(r.id),
        })),
      ...(onSendToNewRound ? [{
        label: 'Send to new round',
        shortcut: '',
        action: onSendToNewRound,
      }] : []),
    ] : (onSendToNewRound ? [
      { separator: true } as SeparatorItem,
      { label: 'Send to new round', shortcut: '', action: onSendToNewRound },
    ] : [])),
    { label: 'Delete', shortcut: 'Del', action: onDelete, danger: true },
    { separator: true },
    { label: 'Zoom to card', shortcut: '4', action: onZoomToCard },
  ];

  const actionableItems = items
    .map((item, i) => (item.separator ? null : i))
    .filter((i): i is number => i !== null);

  // Adjust position so menu stays within viewport
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    let adjX = x;
    let adjY = y;
    if (x + rect.width > window.innerWidth - 8) {
      adjX = window.innerWidth - rect.width - 8;
    }
    if (y + rect.height > window.innerHeight - 8) {
      adjY = window.innerHeight - rect.height - 8;
    }
    if (adjX < 8) adjX = 8;
    if (adjY < 8) adjY = 8;
    setPosition({ x: adjX, y: adjY });
  }, [x, y]);

  // Click outside to dismiss
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Use a timeout so the opening right-click itself doesn't immediately close the menu
    const id = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(prev => {
        const currentPos = actionableItems.indexOf(prev);
        const nextPos = currentPos < actionableItems.length - 1 ? currentPos + 1 : 0;
        return actionableItems[nextPos];
      });
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(prev => {
        const currentPos = actionableItems.indexOf(prev);
        const nextPos = currentPos > 0 ? currentPos - 1 : actionableItems.length - 1;
        return actionableItems[nextPos];
      });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0) {
        const item = items[activeIndex];
        if (item && !item.separator) {
          item.action();
          onClose();
        }
      }
      return;
    }
  }, [activeIndex, items, actionableItems, onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9999,
        minWidth: 200,
        padding: '4px 0',
        background: 'var(--palette-bg)',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        fontSize: 11,
        color: 'var(--foreground)',
        userSelect: 'none',
      }}
    >
      {items.map((item, i) => {
        if (item.separator) {
          return (
            <div
              key={`sep-${i}`}
              style={{
                height: 1,
                margin: '4px 8px',
                background: 'var(--border)',
              }}
            />
          );
        }

        const isActive = activeIndex === i;

        return (
          <button
            key={item.label}
            onClick={() => {
              item.action();
              onClose();
            }}
            onMouseEnter={() => setActiveIndex(i)}
            onMouseLeave={() => { if (activeIndex === i) setActiveIndex(-1); }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '6px 12px',
              background: isActive ? 'var(--border)' : 'transparent',
              border: 'none',
              borderRadius: 0,
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 'inherit',
              color: item.danger ? '#ef4444' : 'var(--foreground)',
              textAlign: 'left',
              outline: 'none',
              transition: 'background 80ms ease',
            }}
          >
            <span>{item.label}</span>
            <span style={{ color: 'var(--muted)', marginLeft: 24, fontSize: 10 }}>
              {item.shortcut}
            </span>
          </button>
        );
      })}
    </div>
  );
}
