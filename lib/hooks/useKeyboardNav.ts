'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { ViewMode } from '@/lib/types';

export type ZoomLevel = 'overview' | 'z1' | 'z2' | 'z3' | 'z4';

interface UseKeyboardNavProps {
  conceptIndex: number;
  versionIndex: number;
  conceptCount: number;
  getVersionCount: (conceptIndex: number) => number;
  onNavigate: (conceptIndex: number, versionIndex: number) => void;
  onToggleGridView?: () => void;
  onToggleSelect?: () => void;
  onZoomToLevel?: (level: ZoomLevel) => void;
  onDrift?: () => void;
  onBranch?: () => void;
  onDelete?: () => void;
  onUndo?: () => void;
  onPresent?: () => void;
  onMoveConceptLeft?: () => void;
  onMoveConceptRight?: () => void;
  inSelectsRow?: boolean;
  onSetSelectsRow?: (inRow: boolean) => void;
  selectsConceptIndices?: number[];
  getSelectedVersionIndex?: (conceptIndex: number) => number;
  viewMode: 'frame' | 'grid';
  zoomLevel?: ZoomLevel;
  mode?: ViewMode;
  client?: string;
}

export function useKeyboardNav({
  conceptIndex,
  versionIndex,
  conceptCount,
  getVersionCount,
  onNavigate,
  onToggleGridView,
  onToggleSelect,
  onZoomToLevel,
  onDrift,
  onBranch,
  onDelete,
  onUndo,
  onPresent,
  onMoveConceptLeft,
  onMoveConceptRight,
  inSelectsRow = false,
  onSetSelectsRow,
  selectsConceptIndices = [],
  getSelectedVersionIndex,
  viewMode,
  zoomLevel = 'overview',
  mode = 'designer',
  client,
}: UseKeyboardNavProps) {
  const router = useRouter();
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return;

      // Don't handle space (used for panning)
      if (e.key === ' ') return;

      switch (e.key) {
        // ── Zoom level keys ──
        case '`': {
          e.preventDefault();
          if (viewMode === 'grid') onZoomToLevel?.('overview');
          break;
        }
        case '1': {
          e.preventDefault();
          if (viewMode === 'grid') onZoomToLevel?.('z1');
          break;
        }
        case '2': {
          e.preventDefault();
          if (viewMode === 'grid') onZoomToLevel?.('z2');
          break;
        }
        case '3': {
          e.preventDefault();
          if (viewMode === 'grid') onZoomToLevel?.('z3');
          break;
        }
        case '4': {
          e.preventDefault();
          if (viewMode === 'grid') onZoomToLevel?.('z4');
          break;
        }

        // ── Arrow navigation ──
        case 'ArrowRight': {
          e.preventDefault();
          if (e.shiftKey && viewMode === 'grid') {
            onMoveConceptRight?.();
            break;
          }
          if (inSelectsRow && selectsConceptIndices.length > 0) {
            const curPos = selectsConceptIndices.indexOf(conceptIndex);
            const nextPos = curPos < selectsConceptIndices.length - 1 ? curPos + 1 : 0;
            const nextCi = selectsConceptIndices[nextPos];
            const nextVi = getSelectedVersionIndex?.(nextCi) ?? 0;
            onNavigate(nextCi, nextVi);
          } else {
            const nextConcept = Math.min(conceptIndex + 1, conceptCount - 1);
            if (nextConcept !== conceptIndex) {
              // Navigate by visual row (versions are reversed: latest=top, row 0)
              const currentCount = getVersionCount(conceptIndex);
              const visualRow = currentCount - 1 - versionIndex; // 0 = top
              const nextCount = getVersionCount(nextConcept);
              const targetVi = Math.max(0, nextCount - 1 - Math.min(visualRow, nextCount - 1));
              onNavigate(nextConcept, targetVi);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (e.shiftKey && viewMode === 'grid') {
            onMoveConceptLeft?.();
            break;
          }
          if (inSelectsRow && selectsConceptIndices.length > 0) {
            const curPos = selectsConceptIndices.indexOf(conceptIndex);
            const prevPos = curPos > 0 ? curPos - 1 : selectsConceptIndices.length - 1;
            const prevCi = selectsConceptIndices[prevPos];
            const prevVi = getSelectedVersionIndex?.(prevCi) ?? 0;
            onNavigate(prevCi, prevVi);
          } else {
            const prevConcept = Math.max(conceptIndex - 1, 0);
            if (prevConcept !== conceptIndex) {
              const currentCount = getVersionCount(conceptIndex);
              const visualRow = currentCount - 1 - versionIndex;
              const prevCount = getVersionCount(prevConcept);
              const targetVi = Math.max(0, prevCount - 1 - Math.min(visualRow, prevCount - 1));
              onNavigate(prevConcept, targetVi);
            }
          }
          break;
        }
        case 'ArrowDown': {
          e.preventDefault();
          if (inSelectsRow) {
            onSetSelectsRow?.(false);
          } else {
            // Down = visually down = older version = lower index
            const olderVersion = Math.max(versionIndex - 1, 0);
            if (olderVersion !== versionIndex) {
              onNavigate(conceptIndex, olderVersion);
            }
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          const maxVersion = getVersionCount(conceptIndex) - 1;
          const newerVersion = Math.min(versionIndex + 1, maxVersion);
          if (!inSelectsRow && newerVersion !== versionIndex) {
            onNavigate(conceptIndex, newerVersion);
          }
          break;
        }

        // ── Enter: drill down one level (or Cmd+Enter to present) ──
        case 'Enter': {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            onPresent?.();
            break;
          }
          e.preventDefault();
          if (viewMode === 'grid') {
            onToggleGridView?.(); // Enter = open frame directly
          }
          break;
        }

        // ── Escape: back one level ──
        case 'Escape': {
          e.preventDefault();
          if (viewMode === 'frame') {
            onToggleGridView?.();
            // Don't set zoom here — handleToggleGridView in Viewer already sets z3
          } else if (viewMode === 'grid') {
            const levels: ZoomLevel[] = ['overview', 'z1', 'z2', 'z3', 'z4'];
            const idx = levels.indexOf(zoomLevel);
            if (idx > 0) {
              onZoomToLevel?.(levels[idx - 1]);
            } else {
              router.push(mode === 'client' ? `/review/${client}` : '/');
            }
          }
          break;
        }

        // ── Jump to latest ──
        case 'l':
        case 'L': {
          e.preventDefault();
          if (viewMode === 'grid') {
            // Navigate to the latest version of the current concept
            const maxVi = getVersionCount(conceptIndex) - 1;
            onNavigate(conceptIndex, maxVi);
            onZoomToLevel?.('z4');
          }
          break;
        }

        // ── Delete ──
        case 'Delete':
        case 'Backspace': {
          e.preventDefault();
          onDelete?.();
          break;
        }

        // ── Undo (Cmd+Z) ──
        case 'z':
        case 'Z': {
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            onUndo?.();
          }
          break;
        }

        // ── Drift ↓ (new version) or Drift → (new concept with Shift) ──
        case 'd':
        case 'D': {
          e.preventDefault();
          if (e.shiftKey) {
            onBranch?.();
          } else {
            onDrift?.();
          }
          break;
        }

        // ── Other keys ──
        case 'g':
        case 'G': {
          e.preventDefault();
          onToggleGridView?.();
          break;
        }
        case 's':
        case 'S': {
          e.preventDefault();
          onToggleSelect?.();
          break;
        }
        case 'p':
        case 'P': {
          e.preventDefault();
          onPresent?.();
          break;
        }
      }
    },
    [conceptIndex, versionIndex, conceptCount, getVersionCount, onNavigate, onToggleGridView, onToggleSelect, onZoomToLevel, onDrift, onBranch, onDelete, onUndo, onPresent, onMoveConceptLeft, onMoveConceptRight, inSelectsRow, onSetSelectsRow, selectsConceptIndices, getSelectedVersionIndex, viewMode, zoomLevel, mode, client, router]
  );

  // Sync preferred row when versionIndex changes via click or vertical nav
  // Skip when the change came from horizontal nav (clamped value)
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
