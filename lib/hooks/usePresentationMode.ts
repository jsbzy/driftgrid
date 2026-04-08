'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Concept } from '@/lib/types';

/**
 * Manages presentation mode — fullscreen cycling through starred versions.
 */
export function usePresentationMode(
  concepts: Concept[],
  selections: Set<string>,
  conceptIndex: number,
  versionIndex: number,
  viewMode: 'frame' | 'grid',
  setConceptIndex: (ci: number) => void,
  setVersionIndex: (vi: number) => void,
  setViewMode: (mode: 'frame' | 'grid') => void,
) {
  const [isPresenting, setIsPresenting] = useState(false);

  // Build presentation playlist — ordered list of {ci, vi} for selected versions
  const presentationPlaylist = useMemo(() => {
    if (selections.size === 0) return [];
    const playlist: { ci: number; vi: number }[] = [];
    concepts.forEach((concept, ci) => {
      concept.versions.forEach((version, vi) => {
        if (selections.has(`${concept.id}:${version.id}`)) {
          playlist.push({ ci, vi });
        }
      });
    });
    return playlist;
  }, [concepts, selections]);

  const handlePresent = useCallback(() => {
    if (selections.size === 0) return;
    const firstKey = Array.from(selections)[0];
    if (!firstKey) return;
    const [conceptId, versionId] = firstKey.split(':');
    const ci = concepts.findIndex(c => c.id === conceptId);
    if (ci < 0) return;
    const vi = concepts[ci].versions.findIndex(v => v.id === versionId);
    if (vi < 0) return;
    setConceptIndex(ci);
    setVersionIndex(vi);
    setViewMode('frame');
    setIsPresenting(true);
    const concept = concepts[ci];
    const version = concept?.versions[vi];
    if (concept && version) {
      window.history.replaceState(null, '', `#${concept.id}/v${version.number}`);
    }
  }, [selections, concepts, setConceptIndex, setVersionIndex, setViewMode]);

  // Presentation mode navigation — left/right through selects only
  useEffect(() => {
    if (!isPresenting || viewMode !== 'frame') return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        const currentIdx = presentationPlaylist.findIndex(
          p => p.ci === conceptIndex && p.vi === versionIndex
        );
        let nextIdx: number;
        if (e.key === 'ArrowRight') {
          nextIdx = currentIdx < presentationPlaylist.length - 1 ? currentIdx + 1 : 0;
        } else {
          nextIdx = currentIdx > 0 ? currentIdx - 1 : presentationPlaylist.length - 1;
        }
        const next = presentationPlaylist[nextIdx];
        if (next) {
          setConceptIndex(next.ci);
          setVersionIndex(next.vi);
          const concept = concepts[next.ci];
          const version = concept?.versions[next.vi];
          if (concept && version) {
            window.history.replaceState(null, '', `#${concept.id}/v${version.number}`);
          }
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        setIsPresenting(false);
        setViewMode('grid');
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isPresenting, viewMode, presentationPlaylist, conceptIndex, versionIndex, concepts, setConceptIndex, setVersionIndex, setViewMode]);

  return {
    isPresenting,
    setIsPresenting,
    presentationPlaylist,
    handlePresent,
  };
}
