'use client';
import { useState, useEffect } from 'react';

const SHORTCUTS_KEY = 'driftgrid-shortcuts-expanded';

export function useUIVisibility() {
  const [navGridHidden, setNavGridHidden] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // Shortcuts bar expansion state — persisted across sessions. Default: expanded on first visit.
  const [shortcutsVisible, setShortcutsVisible] = useState(true);

  // Hydrate from localStorage on mount (SSR-safe)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SHORTCUTS_KEY);
      if (raw !== null) setShortcutsVisible(raw === '1');
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(SHORTCUTS_KEY, shortcutsVisible ? '1' : '0'); }
    catch { /* ignore */ }
  }, [shortcutsVisible]);

  return {
    navGridHidden, setNavGridHidden,
    commandPaletteOpen, setCommandPaletteOpen,
    shortcutsVisible, setShortcutsVisible,
  };
}
