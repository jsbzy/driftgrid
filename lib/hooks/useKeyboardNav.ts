'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { ViewMode } from '@/lib/types';

interface UseKeyboardNavProps {
  conceptIndex: number;
  versionIndex: number;
  conceptCount: number;
  getVersionCount: (conceptIndex: number) => number;
  onNavigate: (conceptIndex: number, versionIndex: number) => void;
  onToggleGrid?: () => void;
  onToggleGridView?: () => void;
  onToggleSelect?: () => void;
  viewMode: 'fullscreen' | 'grid';
  mode?: ViewMode;
  client?: string;
}

export function useKeyboardNav({
  conceptIndex,
  versionIndex,
  conceptCount,
  getVersionCount,
  onNavigate,
  onToggleGrid,
  onToggleGridView,
  onToggleSelect,
  viewMode,
  mode = 'designer',
  client,
}: UseKeyboardNavProps) {
  const router = useRouter();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't navigate if user is typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      switch (e.key) {
        case 'ArrowRight': {
          e.preventDefault();
          const nextConcept = Math.min(conceptIndex + 1, conceptCount - 1);
          if (nextConcept !== conceptIndex) {
            const maxVersion = getVersionCount(nextConcept) - 1;
            onNavigate(nextConcept, Math.min(versionIndex, maxVersion));
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          const prevConcept = Math.max(conceptIndex - 1, 0);
          if (prevConcept !== conceptIndex) {
            const maxVersion = getVersionCount(prevConcept) - 1;
            onNavigate(prevConcept, Math.min(versionIndex, maxVersion));
          }
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          const maxVersion = getVersionCount(conceptIndex) - 1;
          const nextVersion = Math.min(versionIndex + 1, maxVersion);
          if (nextVersion !== versionIndex) {
            onNavigate(conceptIndex, nextVersion);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const prevVersion = Math.max(versionIndex - 1, 0);
          if (prevVersion !== versionIndex) {
            onNavigate(conceptIndex, prevVersion);
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          if (viewMode === 'fullscreen') {
            // Fullscreen → grid
            onToggleGridView?.();
          } else {
            // Grid → dashboard
            router.push(mode === 'client' ? `/review/${client}` : '/');
          }
          break;
        }
        case ' ': {
          e.preventDefault();
          onToggleGrid?.();
          break;
        }
        case 'g':
        case 'G': {
          e.preventDefault();
          onToggleGridView?.();
          break;
        }
        case 's':
        case 'S': {
          if (viewMode === 'grid') {
            e.preventDefault();
            onToggleSelect?.();
          }
          break;
        }
        case 'Enter': {
          if (viewMode === 'grid') {
            e.preventDefault();
            // Select current cell → fullscreen
            onToggleGridView?.();
          }
          break;
        }
      }
    },
    [conceptIndex, versionIndex, conceptCount, getVersionCount, onNavigate, onToggleGrid, onToggleGridView, onToggleSelect, viewMode, mode, client, router]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
