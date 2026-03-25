'use client';
import { useState } from 'react';

export function useUIVisibility() {
  const [navGridHidden, setNavGridHidden] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsVisible, setShortcutsVisible] = useState(false);

  return {
    navGridHidden, setNavGridHidden,
    topbarHidden, setTopbarHidden,
    commandPaletteOpen, setCommandPaletteOpen,
    shortcutsVisible, setShortcutsVisible,
  };
}
