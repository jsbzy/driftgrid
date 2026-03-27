'use client';
import { useState } from 'react';

export function useUIVisibility() {
  const [navGridHidden, setNavGridHidden] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsVisible, setShortcutsVisible] = useState(false);

  return {
    navGridHidden, setNavGridHidden,
    commandPaletteOpen, setCommandPaletteOpen,
    shortcutsVisible, setShortcutsVisible,
  };
}
