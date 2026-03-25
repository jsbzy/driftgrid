'use client';
import { useState, useCallback, useRef } from 'react';

export function useFlash() {
  const [driftFlash, setDriftFlash] = useState(false);
  const [flashLabel, setFlashLabel] = useState('DRIFTED');
  const [deleteFlash, setDeleteFlash] = useState(false);
  const [transitionFade, setTransitionFade] = useState(false);

  // Track drift flash timer so error paths can cancel
  const driftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showDriftFlash = useCallback((label: string = 'DRIFTED') => {
    if (driftTimerRef.current) clearTimeout(driftTimerRef.current);
    setFlashLabel(label);
    setDriftFlash(true);
    driftTimerRef.current = setTimeout(() => {
      setDriftFlash(false);
      driftTimerRef.current = null;
    }, 1000);
  }, []);

  const hideDriftFlash = useCallback(() => {
    if (driftTimerRef.current) {
      clearTimeout(driftTimerRef.current);
      driftTimerRef.current = null;
    }
    setDriftFlash(false);
  }, []);

  const showDeleteFlash = useCallback(() => {
    setDeleteFlash(true);
    setTimeout(() => setDeleteFlash(false), 400);
  }, []);

  const showTransitionFade = useCallback(() => {
    setTransitionFade(true);
    setTimeout(() => setTransitionFade(false), 50);
  }, []);

  return {
    driftFlash,
    flashLabel,
    deleteFlash,
    transitionFade,
    showDriftFlash,
    hideDriftFlash,
    showDeleteFlash,
    showTransitionFade,
  };
}
