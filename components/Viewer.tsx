'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import useSWR from 'swr';
import type { Manifest, ViewMode, WorkingSet, WorkingSetSelection, Annotation } from '@/lib/types';
import { resolveCanvas } from '@/lib/constants';
import { filterVisibleManifest } from '@/lib/filterManifest';
import { ViewerTopbar } from './ViewerTopbar';
import { HtmlFrame, type HtmlFrameHandle } from './HtmlFrame';
import { NavigationGrid } from './NavigationGrid';
import { GridView } from './GridView';
import { CanvasView, type CanvasViewHandle } from './CanvasView';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { AnnotationOverlay } from './AnnotationOverlay';
import { CommandPalette } from './CommandPalette';
import { useKeyboardNav, type ZoomLevel } from '@/lib/hooks/useKeyboardNav';
import { useClientEdits } from '@/lib/hooks/useClientEdits';
import { computeCanvasLayout, getCardBounds } from '@/lib/hooks/useCanvasLayout';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface ViewerProps {
  client: string;
  project: string;
  mode?: ViewMode;
}

export function Viewer({ client, project, mode = 'designer' }: ViewerProps) {
  const { data: manifest, isLoading, mutate } = useSWR<Manifest>(
    `/api/manifest/${client}/${project}`,
    fetcher
  );

  const [conceptIndex, setConceptIndex] = useState(0);
  const [versionIndex, setVersionIndex] = useState(0);
  const [viewMode, setViewMode] = useState<'frame' | 'grid'>('grid');
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const [activeWorkingSetId, setActiveWorkingSetId] = useState<string | null>(null);
  const [shortcutsVisible, setShortcutsVisible] = useState(false);
  const [presentationMode, setPresentationMode] = useState(false);
  const [driftFlash, setDriftFlash] = useState(false);
  const [flashLabel, setFlashLabel] = useState<string>('DRIFTED');
  const [deleteFlash, setDeleteFlash] = useState(false);
  const [lastDeleted, setLastDeleted] = useState<{ conceptId: string; versionId: string; version: unknown; conceptIndex: number } | null>(null);
  const [lastDrift, setLastDrift] = useState<{ conceptId: string; versionId: string } | null>(null);
  const [inSelectsRow, setInSelectsRow] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('overview');
  // Feature 1: Smooth zoom transition state
  const canvasRef = useRef<CanvasViewHandle>(null);
  const frameWrapperRef = useRef<HTMLDivElement>(null);
  const [transitionCardBounds, setTransitionCardBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // Feature 3: Hot reload state — frame version counter for forcing iframe refresh
  const [frameVersion, setFrameVersion] = useState(0);
  const [hotReloadFlash, setHotReloadFlash] = useState(false);
  const [navGridHidden, setNavGridHidden] = useState(false);
  const [topbarHidden, setTopbarHidden] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [designModeActive, setDesignModeActive] = useState(false);
  const [transitionFade, setTransitionFade] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const handleZoomToLevel = useCallback((level: ZoomLevel) => {
    setZoomLevel(level);
  }, []);

  // Clear transition card bounds after the grid has mounted and consumed it
  useEffect(() => {
    if (viewMode === 'grid' && transitionCardBounds) {
      // Allow one render cycle for CanvasView to read the bounds
      const timer = setTimeout(() => setTransitionCardBounds(null), 50);
      return () => clearTimeout(timer);
    }
  }, [viewMode, transitionCardBounds]);

  // ? key to toggle shortcuts panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return;

      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandPaletteOpen(v => !v);
      }
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsVisible(v => !v);
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        setNavGridHidden(v => !v);
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setTopbarHidden(v => !v);
      }
      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setReviewMode(v => !v);
      }
      if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        setDesignModeActive(v => !v);
      }
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setAnnotationMode(v => !v);
      }
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('drift:copy-feedback', { detail: { json: e.shiftKey } }));
      }
      if (e.key === 's' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        // Trigger designMode save via a custom event (handled in a separate effect)
        window.dispatchEvent(new CustomEvent('drift:designmode-save'));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = manifest && mode === 'client'
    ? filterVisibleManifest(manifest)
    : manifest;
  const concepts = filtered?.concepts ?? [];
  const currentConcept = concepts[conceptIndex];
  const versions = currentConcept?.versions ?? [];
  const currentVersion = versions[versionIndex];

  // Build presentation playlist — ordered list of {conceptIndex, versionIndex} for selected versions
  const presentationPlaylist = useMemo(() => {
    if (selections.size === 0) return [];
    const playlist: { ci: number; vi: number }[] = [];
    concepts.forEach((concept, ci) => {
      const selectedVersionId = selections.get(concept.id);
      if (!selectedVersionId) return;
      const vi = concept.versions.findIndex(v => v.id === selectedVersionId);
      if (vi >= 0) {
        playlist.push({ ci, vi });
      }
    });
    return playlist;
  }, [concepts, selections]);

  // When entering review mode, jump to the first select at z4
  useEffect(() => {
    if (!reviewMode || selections.size === 0) {
      if (reviewMode) setReviewMode(false); // no selects — exit
      return;
    }
    if (viewMode !== 'grid') setViewMode('grid');
    // Navigate to first select
    const firstEntry = Array.from(selections.entries())[0];
    if (firstEntry) {
      const [cid, vid] = firstEntry;
      const ci = concepts.findIndex(c => c.id === cid);
      if (ci >= 0) {
        const vi = concepts[ci].versions.findIndex(v => v.id === vid);
        if (vi >= 0) {
          setConceptIndex(ci);
          setVersionIndex(vi);
          setZoomLevel('z4');
        }
      }
    }
  }, [reviewMode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Review mode: R enters, Esc exits, arrows cycle through selects at z4
  useEffect(() => {
    if (!reviewMode || viewMode !== 'grid') return;
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setReviewMode(false);
        return;
      }

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
          setZoomLevel('z4');
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [reviewMode, viewMode, presentationPlaylist, conceptIndex, versionIndex]);

  // Broadcast current view to /api/current for agent integration
  useEffect(() => {
    if (!currentConcept || !currentVersion) return;
    const path = `projects/${client}/${project}/${currentVersion.file}`;
    fetch('/api/current', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client,
        project,
        conceptId: currentConcept.id,
        conceptLabel: currentConcept.label,
        versionId: currentVersion.id,
        versionNumber: currentVersion.number,
        file: currentVersion.file,
        absolutePath: `~/drift/${path}`,
        viewMode,
      }),
    }).catch(() => {}); // fire and forget
  }, [client, project, currentConcept, currentVersion, viewMode]);

  const getVersionCount = useCallback(
    (ci: number) => concepts[ci]?.versions.length ?? 0,
    [concepts]
  );

  // Memoized arrays for NavigationGrid to avoid recreating on every render
  const navGridVersionCounts = useMemo(() => concepts.map(c => c.versions.length), [concepts]);
  const navGridConceptIds = useMemo(() => concepts.map(c => c.id), [concepts]);
  const navGridVersionIds = useMemo(() => concepts.map(c => c.versions.map(v => v.id)), [concepts]);

  // On manifest load, apply hash to jump to the right concept/version (once only)
  const hashApplied = useRef(false);
  useEffect(() => {
    if (!concepts.length || hashApplied.current) return;
    hashApplied.current = true;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const [conceptId, vStr] = hash.split('/');
    const ci = concepts.findIndex(c => c.id === conceptId);
    if (ci < 0) return;
    let vi = 0;
    if (vStr) {
      const vNum = parseInt(vStr.replace('v', ''), 10);
      const found = concepts[ci].versions.findIndex(v => v.number === vNum);
      if (found >= 0) vi = found;
    }
    setConceptIndex(ci);
    setVersionIndex(vi);
    setViewMode('frame');
  }, [concepts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = useCallback(
    (ci: number, vi: number) => {
      setConceptIndex(ci);
      setVersionIndex(vi);
      // Update hash to enable deep-linking
      const concept = concepts[ci];
      const version = concept?.versions[vi];
      if (concept && version) {
        window.history.replaceState(null, '', `#${concept.id}/v${version.number}`);
      }
    },
    [concepts]
  );

  const handleHighlight = useCallback(
    (ci: number, vi: number) => {
      setConceptIndex(ci);
      setVersionIndex(vi);
      setInSelectsRow(false);
      const concept = concepts[ci];
      const version = concept?.versions[vi];
      if (concept && version) {
        window.history.replaceState(null, '', `#${concept.id}/v${version.number}`);
      }
    },
    [concepts]
  );

  // Compute card bounds for a given concept/version for smooth transitions
  const getTransitionCardBounds = useCallback((ci: number, vi: number) => {
    if (!filtered?.project?.canvas) return null;
    const resolved = resolveCanvas(filtered.project.canvas);
    const ar = typeof resolved.height === 'number'
      ? `${resolved.width} / ${resolved.height}`
      : '16 / 9';
    const layout = computeCanvasLayout(concepts, ar);
    return getCardBounds(layout, ci, vi);
  }, [concepts, filtered]);

  const handleToggleGridView = useCallback(() => {
    setViewMode(v => {
      if (v === 'frame') {
        // Frame → Grid: fade overlay masks the switch
        setTransitionFade(true);
        setPresentationMode(false);
        setDesignModeActive(false);
        setAnnotationMode(false);
        setZoomLevel('z4');
        setTransitionCardBounds(getTransitionCardBounds(conceptIndex, versionIndex));
        setTimeout(() => setTransitionFade(false), 50);
        return 'grid';
      }
      // Grid → Frame: zoom to card, then fade-switch
      if (canvasRef.current) {
        canvasRef.current.zoomToCard(conceptIndex, versionIndex);
        setTimeout(() => {
          setTransitionFade(true);
          setViewMode('frame');
          setTimeout(() => setTransitionFade(false), 50);
        }, 280);
        return v;
      }
      setTransitionFade(true);
      setTimeout(() => setTransitionFade(false), 50);
      return 'frame';
    });
  }, [conceptIndex, versionIndex, getTransitionCardBounds]);

  // Pinch zoom out from frame → exit to grid (passive:false to block browser gesture)
  useEffect(() => {
    const el = frameWrapperRef.current;
    if (!el || viewMode !== 'frame') return;
    const handler = (e: WheelEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.deltaY > 0) {
        e.preventDefault();
        handleToggleGridView();
      }
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [viewMode, handleToggleGridView]);

  const handleGridSelect = useCallback(
    (ci: number, vi: number) => {
      // Cell click always navigates to fullscreen — starring is handled by the star button
      setConceptIndex(ci);
      setVersionIndex(vi);
      setPresentationMode(false);
      const concept = concepts[ci];
      const version = concept?.versions[vi];
      if (concept && version) {
        window.history.replaceState(null, '', `#${concept.id}/v${version.number}`);
      }

      setViewMode('frame');
    },
    [concepts]
  );

  const handleToggleSelect = useCallback(() => {
    if (!currentConcept || !currentVersion) return;
    setSelections(prev => {
      const next = new Map(prev);
      if (next.get(currentConcept.id) === currentVersion.id) {
        next.delete(currentConcept.id);
      } else {
        next.set(currentConcept.id, currentVersion.id);
      }
      return next;
    });
    setActiveWorkingSetId(null);
  }, [currentConcept, currentVersion]);

  const handleDeleteVersion = useCallback(async (conceptId: string, versionId: string) => {
    if (!manifest) return;
    // Remove version from manifest
    const updated: Manifest = {
      ...manifest,
      concepts: manifest.concepts.map(c => {
        if (c.id !== conceptId) return c;
        return { ...c, versions: c.versions.filter(v => v.id !== versionId) };
      }).filter(c => c.versions.length > 0), // Remove concept if no versions left
    };
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    // Adjust indices if needed — use clamped value for both checks
    const clampedCi = Math.min(conceptIndex, Math.max(0, updated.concepts.length - 1));
    if (clampedCi !== conceptIndex) {
      setConceptIndex(clampedCi);
    }
    const newVersionCount = updated.concepts[clampedCi]?.versions.length ?? 0;
    if (versionIndex >= newVersionCount) {
      setVersionIndex(Math.max(0, newVersionCount - 1));
    }
    mutate(updated);
  }, [manifest, client, project, conceptIndex, versionIndex, mutate]);

  const executeDelete = useCallback(async () => {
    if (!manifest || !currentConcept || !currentVersion) return;

    setLastDeleted({
      conceptId: currentConcept.id,
      versionId: currentVersion.id,
      version: currentVersion,
      conceptIndex,
    });

    // Show delete flash
    setDeleteFlash(true);

    const updated: Manifest = {
      ...manifest,
      concepts: manifest.concepts.map(c => {
        if (c.id !== currentConcept.id) return c;
        return { ...c, versions: c.versions.filter(v => v.id !== currentVersion.id) };
      }).filter(c => c.versions.length > 0),
    };

    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });

    // Wait for flash animation
    await new Promise(r => setTimeout(r, 400));
    setDeleteFlash(false);

    // Navigate to the previous version (one above) in the same concept, stay in current viewMode
    const ci = Math.min(conceptIndex, updated.concepts.length - 1);
    if (updated.concepts.length === 0) {
      setViewMode('grid');
      mutate(updated);
      return;
    }
    const newCount = updated.concepts[ci]?.versions.length ?? 0;
    const newVi = Math.min(versionIndex, Math.max(0, newCount - 1));
    setConceptIndex(ci);
    setVersionIndex(newVi);
    mutate(updated);
  }, [manifest, currentConcept, currentVersion, conceptIndex, versionIndex, client, project, mutate]);

  const handleMoveConceptLeft = useCallback(async (targetCi?: number) => {
    const ci = targetCi ?? conceptIndex;
    if (!manifest || ci <= 0) return;
    const newConcepts = [...manifest.concepts];
    const temp = newConcepts[ci];
    newConcepts[ci] = newConcepts[ci - 1];
    newConcepts[ci - 1] = temp;
    // Update positions — create new objects to avoid mutating SWR cache
    const updated = { ...manifest, concepts: newConcepts.map((c, i) => ({ ...c, position: i + 1 })) };
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setConceptIndex(ci - 1);
    mutate(updated);
  }, [manifest, conceptIndex, client, project, mutate]);

  const handleMoveConceptRight = useCallback(async (targetCi?: number) => {
    const ci = targetCi ?? conceptIndex;
    if (!manifest || ci >= manifest.concepts.length - 1) return;
    const newConcepts = [...manifest.concepts];
    const temp = newConcepts[ci];
    newConcepts[ci] = newConcepts[ci + 1];
    newConcepts[ci + 1] = temp;
    // Update positions — create new objects to avoid mutating SWR cache
    const updated = { ...manifest, concepts: newConcepts.map((c, i) => ({ ...c, position: i + 1 })) };
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setConceptIndex(ci + 1);
    mutate(updated);
  }, [manifest, conceptIndex, client, project, mutate]);

  const handleReorderConcepts = useCallback(async (newOrder: string[]) => {
    if (!manifest) return;
    const conceptMap = new Map(manifest.concepts.map(c => [c.id, c]));
    const reordered = newOrder
      .map(id => conceptMap.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c, i) => ({ ...c, position: i + 1 }));
    const updated = { ...manifest, concepts: reordered };
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setConceptIndex(0);
    setVersionIndex(0);
    mutate(updated);
  }, [manifest, client, project, mutate]);

  const handleDeleteCurrent = useCallback(() => {
    if (!currentConcept || !currentVersion) return;
    if (skipDeleteConfirm) {
      executeDelete();
    } else {
      setConfirmDelete(true);
    }
  }, [currentConcept, currentVersion, skipDeleteConfirm, executeDelete]);

  const handleUndo = useCallback(async () => {
    // Undo drift: delete the version that was just created
    if (lastDrift && manifest) {
      const { conceptId, versionId } = lastDrift;
      const updated: Manifest = {
        ...manifest,
        concepts: manifest.concepts.map(c => {
          if (c.id !== conceptId) return c;
          return { ...c, versions: c.versions.filter(v => v.id !== versionId) };
        }).filter(c => c.versions.length > 0),
      };
      await fetch(`/api/manifest/${client}/${project}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      });
      // Navigate back to the previous version
      const ci = updated.concepts.findIndex(c => c.id === conceptId);
      if (ci >= 0) {
        const maxVi = updated.concepts[ci].versions.length - 1;
        setConceptIndex(ci);
        setVersionIndex(Math.min(versionIndex, maxVi));
      }
      mutate(updated);
      setLastDrift(null);
      return;
    }

    // Undo delete: restore the version
    if (!lastDeleted || !manifest) return;

    // Restore the version to the manifest — deep copy concepts to avoid mutating SWR cache
    const updated: Manifest = {
      ...manifest,
      concepts: manifest.concepts.map(c => {
        if (c.id !== lastDeleted.conceptId) return c;
        const restoredVersions = [...c.versions, lastDeleted.version as Manifest['concepts'][0]['versions'][0]];
        restoredVersions.sort((a, b) => a.number - b.number);
        return { ...c, versions: restoredVersions };
      }),
    };
    const concept = updated.concepts.find(c => c.id === lastDeleted.conceptId);
    if (!concept) {
      // Concept was removed — can't undo cleanly
      setLastDeleted(null);
      return;
    }

    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });

    // Navigate to restored version
    const ci = updated.concepts.findIndex(c => c.id === lastDeleted.conceptId);
    const vi = updated.concepts[ci]?.versions.findIndex(v => v.id === lastDeleted.versionId) ?? 0;
    setConceptIndex(ci >= 0 ? ci : 0);
    setVersionIndex(vi >= 0 ? vi : 0);
    mutate(updated);
    setLastDeleted(null);
  }, [lastDeleted, lastDrift, manifest, client, project, versionIndex, mutate]);

  const handleDriftVersion = useCallback(async (conceptId: string, versionId: string) => {
    try {
      // Start the API call and flash simultaneously
      const resPromise = fetch('/api/iterate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project, conceptId, versionId }),
      });

      // Show flash immediately
      setFlashLabel('DRIFTED');
      setDriftFlash(true);

      const res = await resPromise;
      if (!res.ok) { setDriftFlash(false); return; }
      const { absolutePath, versionId: newVid, versionNumber } = await res.json();
      try { await navigator.clipboard.writeText(absolutePath); } catch { /* clipboard may be unavailable */ }

      // Track for Cmd+Z undo
      setLastDrift({ conceptId, versionId: newVid });
      setLastDeleted(null); // clear delete undo — drift undo takes priority

      // Navigate to the new version
      const updated = await mutate();
      if (updated) {
        const ci = updated.concepts.findIndex(c => c.id === conceptId);
        if (ci >= 0) {
          const vi = updated.concepts[ci].versions.findIndex(v => v.id === newVid);
          if (vi >= 0) {
            setConceptIndex(ci);
            setVersionIndex(vi);
            // Stay in current view mode — don't force into frame
            window.history.replaceState(null, '', `#${updated.concepts[ci].id}/v${versionNumber}`);
          }
        }
      }

      // Let the fade-back finish
      setTimeout(() => setDriftFlash(false), 1000);
    } catch { setDriftFlash(false); }
  }, [client, project, mutate]);

  const handleBranchVersion = useCallback(async (conceptId: string, versionId: string) => {
    try {
      setFlashLabel('DRIFTED →');
      setDriftFlash(true);

      const res = await fetch('/api/branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project, conceptId, versionId }),
      });
      if (!res.ok) { setDriftFlash(false); return; }
      const { conceptId: newConceptId, absolutePath } = await res.json();
      try { await navigator.clipboard.writeText(absolutePath); } catch { /* clipboard may be unavailable */ }

      // Wait for the white peak of the animation (~500ms) before swapping content
      await new Promise(r => setTimeout(r, 500));

      // Refresh manifest and navigate to new concept
      const updated = await mutate();
      if (updated) {
        const ci = updated.concepts.findIndex(c => c.id === newConceptId);
        if (ci >= 0) {
          setConceptIndex(ci);
          setVersionIndex(0);
          if (viewMode === 'frame') setViewMode('grid');
          setZoomLevel('z1');
          window.history.replaceState(null, '', `#${newConceptId}/v1`);
        }
      }

      // Let the fade-back finish
      setTimeout(() => setDriftFlash(false), 1000);
    } catch { setDriftFlash(false); }
  }, [client, project, mutate, viewMode]);

  const handleDesignModeSave = useCallback(async () => {
    if (!designModeActive || !htmlFrameRef.current || !currentConcept || !currentVersion) return;

    // Get edited HTML from the iframe
    const html = htmlFrameRef.current.getHtml();
    if (!html) return;

    // Create new version via iterate API
    const res = await fetch('/api/iterate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client, project, conceptId: currentConcept.id, versionId: currentVersion.id }),
    });
    if (!res.ok) return;
    const { versionId: newVid, versionNumber } = await res.json();

    // Refresh manifest to pick up the new version
    const updated = await mutate();
    if (!updated) return;
    const ci = updated.concepts.findIndex(c => c.id === currentConcept.id);
    if (ci < 0) return;
    const newVersion = updated.concepts[ci].versions.find(v => v.id === newVid);
    if (!newVersion) return;

    // Write edited HTML to the new version file
    await fetch(`/api/html/${client}/${project}/${newVersion.file}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/html' },
      body: html,
    });

    // Navigate to new version
    const vi = updated.concepts[ci].versions.findIndex(v => v.id === newVid);
    if (vi >= 0) {
      setConceptIndex(ci);
      setVersionIndex(vi);
      window.history.replaceState(null, '', `#${updated.concepts[ci].id}/v${versionNumber}`);
    }

    // Turn off design mode
    setDesignModeActive(false);
  }, [designModeActive, client, project, currentConcept, currentVersion, mutate]);

  // Listen for Cmd+S designMode save trigger
  useEffect(() => {
    const handler = () => { handleDesignModeSave(); };
    window.addEventListener('drift:designmode-save', handler);
    return () => window.removeEventListener('drift:designmode-save', handler);
  }, [handleDesignModeSave]);

  // Fetch annotations when version changes
  useEffect(() => {
    if (!currentConcept || !currentVersion || viewMode !== 'frame') {
      setAnnotations([]);
      return;
    }
    fetch(`/api/annotations?client=${client}&project=${project}&conceptId=${currentConcept.id}&versionId=${currentVersion.id}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setAnnotations(data); })
      .catch(() => {});
  }, [client, project, currentConcept?.id, currentVersion?.id, viewMode]);

  const handleAddAnnotation = useCallback(async (x: number, y: number, text: string) => {
    if (!currentConcept || !currentVersion) return;
    const res = await fetch('/api/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId: currentConcept.id,
        versionId: currentVersion.id,
        x, y, text,
        author: 'designer',
        isClient: false,
      }),
    });
    if (res.ok) {
      const annotation = await res.json();
      setAnnotations(prev => [...prev, annotation]);
    }
  }, [client, project, currentConcept, currentVersion]);

  const handleResolveAnnotation = useCallback(async (id: string) => {
    if (!currentConcept || !currentVersion) return;
    const res = await fetch('/api/annotations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId: currentConcept.id,
        versionId: currentVersion.id,
        annotationId: id,
      }),
    });
    if (res.ok) {
      const updated = await res.json();
      setAnnotations(prev => prev.map(a => a.id === id ? updated : a));
    }
  }, [client, project, currentConcept, currentVersion]);

  const handleDeleteAnnotation = useCallback(async (id: string) => {
    if (!currentConcept || !currentVersion) return;
    await fetch('/api/annotations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project,
        conceptId: currentConcept.id,
        versionId: currentVersion.id,
        annotationId: id,
      }),
    });
    setAnnotations(prev => prev.filter(a => a.id !== id));
  }, [client, project, currentConcept, currentVersion]);

  // Copy feedback handler (F key / Shift+F)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!currentConcept || !currentVersion || annotations.length === 0) return;
      const filePath = `~/drift/projects/${client}/${project}/${currentVersion.file}`;

      if (detail?.json) {
        // Shift+F: JSON format
        navigator.clipboard.writeText(JSON.stringify({
          file: filePath,
          annotations: annotations.map(a => ({
            x: a.x, y: a.y, element: a.element, text: a.text, resolved: a.resolved,
          })),
        }, null, 2));
      } else {
        // F: human-readable
        const lines = [`Feedback on ${filePath}:`, ''];
        annotations.forEach((a, i) => {
          const loc = a.element ? `near ${a.element}` : 'general';
          const resolved = a.resolved ? ' (resolved)' : '';
          lines.push(`${i + 1}. (${loc}) — ${a.text}${resolved}`);
        });
        navigator.clipboard.writeText(lines.join('\n'));
      }
    };
    window.addEventListener('drift:copy-feedback', handler);
    return () => window.removeEventListener('drift:copy-feedback', handler);
  }, [annotations, client, project, currentConcept, currentVersion]);

  const handleStarVersion = useCallback((conceptId: string, versionId: string) => {
    setSelections(prev => {
      const next = new Map(prev);
      if (next.get(conceptId) === versionId) {
        next.delete(conceptId);
      } else {
        next.set(conceptId, versionId);
      }
      return next;
    });
    setActiveWorkingSetId(null);
  }, []);

  const handleSaveWorkingSet = useCallback(async () => {
    if (!manifest || selections.size === 0) return;
    const name = window.prompt('Working set name:');
    if (!name) return;

    const entries: WorkingSetSelection[] = [];
    selections.forEach((versionId, conceptId) => {
      entries.push({ conceptId, versionId });
    });

    const ws: WorkingSet = {
      id: crypto.randomUUID(),
      name,
      selections: entries,
      created: new Date().toISOString(),
    };

    const updated: Manifest = {
      ...manifest,
      workingSets: [...manifest.workingSets, ws],
    };

    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    mutate(updated);
    setActiveWorkingSetId(ws.id);
  }, [manifest, selections, client, project, mutate]);

  const handleLoadWorkingSet = useCallback(
    (id: string) => {
      if (!manifest) return;
      const ws = manifest.workingSets.find(s => s.id === id);
      if (!ws) return;
      const next = new Map<string, string>();
      ws.selections.forEach(({ conceptId, versionId }) => {
        next.set(conceptId, versionId);
      });
      setSelections(next);
      setActiveWorkingSetId(id);
    },
    [manifest]
  );

  const handleClearSelections = useCallback(() => {
    setSelections(new Map());
    setActiveWorkingSetId(null);
    setPresentationMode(false);
  }, []);

  // Presentation mode — enter fullscreen cycling through selects only
  const handlePresent = useCallback(() => {
    if (selections.size === 0) return;
    // Navigate to the first selected version
    const firstEntry = Array.from(selections.entries())[0];
    if (!firstEntry) return;
    const [conceptId, versionId] = firstEntry;
    const ci = concepts.findIndex(c => c.id === conceptId);
    if (ci < 0) return;
    const vi = concepts[ci].versions.findIndex(v => v.id === versionId);
    if (vi < 0) return;
    setConceptIndex(ci);
    setVersionIndex(vi);
    setViewMode('frame');
    setPresentationMode(true);
    const concept = concepts[ci];
    const version = concept?.versions[vi];
    if (concept && version) {
      window.history.replaceState(null, '', `#${concept.id}/v${version.number}`);
    }
  }, [selections, concepts]);

  // Presentation mode navigation — left/right through selects only
  useEffect(() => {
    if (!presentationMode || viewMode !== 'frame') return;
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return;

      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        // Find current position in playlist
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
        setPresentationMode(false);
        setViewMode('grid');
      }
    };
    // Use capture phase to intercept before useKeyboardNav
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [presentationMode, viewMode, presentationPlaylist, conceptIndex, versionIndex, concepts]);

  // Feature 3: SSE hot reload — listen for file changes in fullscreen mode
  // Use a ref so the SSE handler always sees the latest version without reconnecting
  const currentVersionRef = useRef(currentVersion);
  currentVersionRef.current = currentVersion;

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    if (viewMode !== 'frame') return;

    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      es = new EventSource('/api/watch');
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'file-changed' && data.client === client && data.project === project) {
            const cv = currentVersionRef.current;
            if (!cv) return;
            // Check if the changed file matches the current version's file path
            // Both use forward-slash relative paths like "concept-1/v2.html"
            const changedFile = (data.file as string).replace(/\\/g, '/');
            const versionFile = cv.file.replace(/\\/g, '/');
            if (versionFile === changedFile || versionFile.endsWith('/' + changedFile) || changedFile.endsWith('/' + versionFile)) {
              setFrameVersion(v => v + 1);
              // Show subtle reload flash
              setHotReloadFlash(true);
              setTimeout(() => setHotReloadFlash(false), 600);
            }
          }
        } catch { /* ignore */ }
      };
      es.onerror = () => { es?.close(); reconnectTimeout = setTimeout(connect, 5000); };
    }
    connect();
    return () => { es?.close(); if (reconnectTimeout) clearTimeout(reconnectTimeout); };
  }, [viewMode, client, project]);

  const isClientMode = mode === 'client';
  const clientEdits = useClientEdits({
    client,
    project,
    versionId: currentVersion?.id ?? '',
    enabled: isClientMode,
  });
  const htmlFrameRef = useRef<HtmlFrameHandle>(null);
  const [frameWidth, setFrameWidth] = useState<number | undefined>();
  const showEdits = clientEdits.viewEdited && clientEdits.hasEdits && !clientEdits.editMode;

  const selectsConceptIndices = useMemo(() => {
    return concepts.reduce<number[]>((acc, c, i) => {
      if (selections.has(c.id)) acc.push(i);
      return acc;
    }, []);
  }, [concepts, selections]);

  const getSelectedVersionIndex = useCallback((ci: number) => {
    const concept = concepts[ci];
    if (!concept) return 0;
    const selectedVid = selections.get(concept.id);
    if (!selectedVid) return 0;
    const vi = concept.versions.findIndex(v => v.id === selectedVid);
    return vi >= 0 ? vi : 0;
  }, [concepts, selections]);

  const handleDrift = useMemo(() => {
    if (!currentConcept || !currentVersion) return undefined;
    if (designModeActive) {
      return handleDesignModeSave; // D with designMode = save edits to new version
    }
    return () => handleDriftVersion(currentConcept.id, currentVersion.id);
  }, [currentConcept, currentVersion, handleDriftVersion, designModeActive, handleDesignModeSave]);

  const handleBranch = useMemo(() => {
    return currentConcept && currentVersion
      ? () => handleBranchVersion(currentConcept.id, currentVersion.id)
      : undefined;
  }, [currentConcept, currentVersion, handleBranchVersion]);

  useKeyboardNav({
    conceptIndex,
    versionIndex,
    conceptCount: concepts.length,
    getVersionCount,
    onNavigate: handleNavigate,
    onToggleGridView: handleToggleGridView,
    onToggleSelect: mode !== 'client' ? handleToggleSelect : undefined,
    onZoomToLevel: handleZoomToLevel,
    onDrift: handleDrift,
    onBranch: handleBranch,
    onDelete: handleDeleteCurrent,
    onMoveConceptLeft: handleMoveConceptLeft,
    onMoveConceptRight: handleMoveConceptRight,
    onUndo: handleUndo,
    onPresent: handlePresent,
    inSelectsRow,
    onSetSelectsRow: setInSelectsRow,
    selectsConceptIndices,
    getSelectedVersionIndex,
    viewMode,
    zoomLevel,
    mode,
    client,
  });

  // Drift overlay — subtle toast, not fullscreen takeover
  const driftOverlay = driftFlash ? (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] pointer-events-none flex items-center gap-2 px-4 py-2 rounded-full"
      style={{
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(12px)',
        animation: 'driftToast 1.5s ease forwards',
      }}
    >
      <span style={{
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
        color: '#fff',
      }}>{flashLabel}</span>
      <span style={{
        fontFamily: 'var(--font-mono, monospace)',
        fontSize: 10, color: 'rgba(255,255,255,0.5)',
      }}>path copied</span>
      <style>{`
        @keyframes driftToast {
          0% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          10% { opacity: 1; transform: translateX(-50%) translateY(0); }
          70% { opacity: 1; transform: translateX(-50%) translateY(0); }
          100% { opacity: 0; transform: translateX(-50%) translateY(-8px); }
        }
      `}</style>
    </div>
  ) : null;

  // Delete flash overlay
  const deleteOverlay = deleteFlash ? (
    <div className="fixed inset-0 z-[100] pointer-events-none" style={{ animation: 'deleteFade 0.5s ease-out forwards' }}>
      <style>{`
        @keyframes deleteFade {
          0% { background: rgba(0,0,0,0); }
          30% { background: rgba(0,0,0,0.06); }
          100% { background: rgba(0,0,0,0); }
        }
      `}</style>
    </div>
  ) : null;

  // Custom delete confirmation dialog
  const deleteDialog = confirmDelete && currentConcept && currentVersion ? (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(2px)' }}>
      <div className="bg-[var(--background)] rounded-lg border border-[var(--border)] p-6 max-w-sm w-full mx-4 shadow-lg" style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
        <div className="text-sm font-medium mb-2">Delete version?</div>
        <div className="text-xs text-[var(--muted)] mb-5">
          {currentConcept.label} · v{currentVersion.number} will be removed from the grid. You can undo with Cmd+Z.
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-[10px] text-[var(--muted)] cursor-pointer">
            <input
              type="checkbox"
              checked={skipDeleteConfirm}
              onChange={e => setSkipDeleteConfirm(e.target.checked)}
              className="rounded"
            />
            Don&apos;t ask again
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs px-3 py-1.5 rounded border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => { setConfirmDelete(false); executeDelete(); }}
              className="text-xs px-3 py-1.5 rounded bg-[var(--foreground)] text-[var(--background)] hover:opacity-80 transition-opacity"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // Global keyframes for hot reload flash (always rendered)
  const globalStyles = (
    <style>{`
      @keyframes hotReloadFlash {
        0% { opacity: 0; transform: translateY(-4px); }
        20% { opacity: 1; transform: translateY(0); }
        80% { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-4px); }
      }
    `}</style>
  );

  // Transition fade overlay — masks the instant view mode switch
  const fadeOverlay = transitionFade ? (
    <div
      className="fixed inset-0 z-[200] pointer-events-none"
      style={{
        background: 'var(--background)',
        animation: 'fadeOut 0.2s ease forwards',
      }}
    >
      <style>{`
        @keyframes fadeOut {
          0% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>
    </div>
  ) : null;

  const commandPalette = (
    <CommandPalette
      open={commandPaletteOpen}
      onClose={() => setCommandPaletteOpen(false)}
      onFitAll={() => { setZoomLevel('overview'); setCommandPaletteOpen(false); }}
      onZoomColumn={() => { setZoomLevel('z1'); setCommandPaletteOpen(false); }}
      onZoomCard={() => { setZoomLevel('z4'); setCommandPaletteOpen(false); }}
      onToggleStar={() => { handleToggleSelect(); setCommandPaletteOpen(false); }}
      onPresent={() => { handlePresent(); setCommandPaletteOpen(false); }}
      onGoToLatest={() => {
        if (currentConcept) {
          const lastVi = currentConcept.versions.length - 1;
          if (lastVi >= 0) {
            setVersionIndex(lastVi);
            const version = currentConcept.versions[lastVi];
            if (version) {
              window.history.replaceState(null, '', `#${currentConcept.id}/v${version.number}`);
            }
          }
        }
        setCommandPaletteOpen(false);
      }}
      onClearSelections={() => { handleClearSelections(); setCommandPaletteOpen(false); }}
      onToggleTheme={() => {
        const html = document.documentElement;
        const isDark = html.classList.contains('dark');
        if (isDark) {
          html.classList.remove('dark');
          localStorage.setItem('driftgrid-theme', 'light');
        } else {
          html.classList.add('dark');
          localStorage.setItem('driftgrid-theme', 'dark');
        }
        setCommandPaletteOpen(false);
      }}
      onToggleHud={() => { setNavGridHidden(v => !v); setCommandPaletteOpen(false); }}
      onToggleNavbar={() => { setTopbarHidden(v => !v); setCommandPaletteOpen(false); }}
      onCloseRound={async () => {
        setCommandPaletteOpen(false);
        const name = window.prompt('Round name (or leave blank for default):');
        // Pass current selects as the approved baseline for this round
        const roundSelects = Array.from(selections.entries()).map(([conceptId, versionId]) => ({
          conceptId,
          versionId,
        }));
        const res = await fetch('/api/rounds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client, project, name: name || undefined, selects: roundSelects }),
        });
        if (res.ok) {
          const data = await res.json();
          await mutate();
          const selectCount = data.selects?.length ?? 0;
          // Clear selections — they're now saved in the round
          setSelections(new Map());
          setActiveWorkingSetId(null);
          alert(`Round "${data.name}" closed — ${data.stamped} versions stamped, ${selectCount} selects saved as baseline`);
        }
      }}
    />
  );

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-[var(--muted)]">
        Loading...
      </div>
    );
  }

  if (!filtered || !currentConcept || !currentVersion) {
    return (
      <div className="h-screen flex items-center justify-center text-sm text-[var(--muted)]">
        Project not found
      </div>
    );
  }

  const resolved = resolveCanvas(filtered.project.canvas);
  const aspectRatio = typeof resolved.height === 'number'
    ? `${resolved.width} / ${resolved.height}`
    : '16 / 9';

  const htmlSrc = `/api/html/${client}/${project}/${currentVersion.file}`;
  const thumbFilename = currentVersion.thumbnail?.replace('.thumbs/', '') || null;
  const thumbSrc = thumbFilename ? `/api/thumbs/${client}/${project}/${thumbFilename}` : null;

  const clientName = client
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  // Presentation mode indicator for the topbar
  const presentationLabel = presentationMode
    ? `Presenting ${presentationPlaylist.findIndex(p => p.ci === conceptIndex && p.vi === versionIndex) + 1}/${presentationPlaylist.length}`
    : undefined;

  const topbar = (
    <ViewerTopbar
      client={clientName}
      clientSlug={client}
      project={project}
      projectName={filtered.project.name}
      conceptLabel={currentConcept.label}
      versionNumber={currentVersion.number}
      versionId={currentVersion.id}
      viewMode={viewMode}
      workingSets={filtered.workingSets}
      canvasLabel={presentationLabel || resolved.label}
      isClientMode={isClientMode}
      editMode={clientEdits.editMode}
      onToggleEdit={() => {
        const entering = !clientEdits.editMode;
        clientEdits.setEditMode(entering);
        if (entering) clientEdits.setViewEdited(true);
      }}
      editCount={clientEdits.editCount}
      hasEdits={clientEdits.hasEdits}
      viewEdited={clientEdits.viewEdited}
      onToggleView={clientEdits.setViewEdited}
      onExportPdf={async () => { await htmlFrameRef.current?.exportPdf(`${project}-alt.pdf`, client, project); }}
      onExportHtml={async () => { await htmlFrameRef.current?.exportHtml(`${project}.html`); }}
      onGoToGrid={() => { setViewMode('grid'); setPresentationMode(false); }}
      onGoToOverview={() => { setViewMode('grid'); setPresentationMode(false); setZoomLevel('overview'); }}
      onGoToConceptColumn={() => { setViewMode('grid'); setPresentationMode(false); setZoomLevel('z1'); }}
      onClearEdits={clientEdits.clearEdits}
      frameWidth={frameWidth}
      versionFile={currentVersion?.file}
      conceptId={currentConcept?.id}
      onIterated={async (newVersionId, newVersionNumber) => {
        // Refresh manifest to pick up the new version
        const updated = await mutate();
        if (updated && currentConcept) {
          // Find the new version index and navigate to it
          const ci = updated.concepts.findIndex(c => c.id === currentConcept.id);
          if (ci >= 0) {
            const vi = updated.concepts[ci].versions.findIndex(v => v.id === newVersionId);
            if (vi >= 0) {
              setConceptIndex(ci);
              setVersionIndex(vi);
              window.history.replaceState(null, '', `#${updated.concepts[ci].id}/v${newVersionNumber}`);
            }
          }
        }
      }}
    />
  );

  if (viewMode === 'grid') {
    return (
      <div className="h-screen flex flex-col bg-[var(--background)]">
        {fadeOverlay}
        {globalStyles}
        {driftOverlay}
        {deleteOverlay}
        {deleteDialog}
        {/* Floating project label — top-left */}
        {!topbarHidden && (
          <div className="fixed top-4 left-4 z-30 pointer-events-auto">
            <a
              href="/"
              className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all hover:bg-[var(--card-bg)]"
              style={{
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--foreground)',
                opacity: 0.5,
                textDecoration: 'none',
              }}
            >
              {filtered?.project.name}
            </a>
          </div>
        )}
        <div className="flex-1 min-h-0">
          <CanvasView
            ref={canvasRef}
            concepts={concepts}
            rounds={filtered?.rounds ?? []}
            conceptIndex={conceptIndex}
            versionIndex={versionIndex}
            onSelect={handleGridSelect}
            onHighlight={handleHighlight}
            client={client}
            project={project}
            aspectRatio={aspectRatio}
            selections={selections}
            onStarVersion={handleStarVersion}
            onDeleteVersion={handleDeleteVersion}
            onDriftVersion={handleDriftVersion}
            onBranchVersion={handleBranchVersion}
            onMoveConceptLeft={handleMoveConceptLeft}
            onMoveConceptRight={handleMoveConceptRight}
            onReorderConcepts={handleReorderConcepts}
            mode={mode}
            zoomLevel={zoomLevel}
            onZoomLevelChange={setZoomLevel}
            initialCardBounds={transitionCardBounds}
          />
        </div>
        {/* Fixed action bar — bottom center, always visible when a card is selected */}
        {currentConcept && currentVersion && !reviewMode && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-full"
            style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <button
              onClick={() => handleStarVersion(currentConcept.id, currentVersion.id)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Star (S)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={selections.get(currentConcept.id) === currentVersion.id ? '#facc15' : 'none'} stroke={selections.get(currentConcept.id) === currentVersion.id ? '#facc15' : 'white'} strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            <button
              onClick={() => handleDriftVersion(currentConcept.id, currentVersion.id)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Drift ↓ (D)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
              </svg>
            </button>
            <button
              onClick={() => {
                const path = `~/drift/projects/${client}/${project}/${currentVersion.file}`;
                navigator.clipboard.writeText(path);
              }}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Copy path"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              onClick={() => handleGridSelect(conceptIndex, versionIndex)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Enter frame"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <polyline points="9 10 4 15 9 20" /><path d="M20 4v7a4 4 0 0 1-4 4H4" />
              </svg>
            </button>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
            <span style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              padding: '0 4px',
            }}>
              {currentConcept.label} · v{currentVersion.number}
            </span>
          </div>
        )}
        {reviewMode && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full z-30"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          >
            <span className="text-[10px] tracking-wide text-white/70" style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
              Review {presentationPlaylist.findIndex(p => p.ci === conceptIndex && p.vi === versionIndex) + 1} / {presentationPlaylist.length}
            </span>
            <div className="w-px h-3 bg-white/20" />
            <button
              onClick={() => setReviewMode(false)}
              className="text-[10px] tracking-wide text-white/50 hover:text-white transition-colors"
              style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
            >
              Exit (Esc)
            </button>
          </div>
        )}
        <KeyboardShortcuts
          visible={shortcutsVisible}
          onClose={() => setShortcutsVisible(false)}
        />
        {commandPalette}
      </div>
    );
  }

  // Fullscreen view — check if current version is starred for the star button
  const isCurrentStarred = currentConcept && currentVersion
    ? selections.get(currentConcept.id) === currentVersion.id
    : false;

  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {fadeOverlay}
      {globalStyles}
      {driftOverlay}
      {deleteOverlay}
      {deleteDialog}
      {/* Floating frame info — top-left */}
      {!topbarHidden && (
        <div className="fixed top-4 left-4 z-30 flex items-center gap-2">
          <a
            href="/"
            style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 11,
              color: 'var(--muted)',
              textDecoration: 'none',
              opacity: 0.6,
            }}
          >
            {filtered?.project.name}
          </a>
          <span style={{ color: 'var(--border)', fontSize: 10 }}>/</span>
          <button
            onClick={() => handleToggleGridView()}
            style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--foreground)',
              opacity: 0.7,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {currentConcept?.label} · v{currentVersion?.number}
          </button>
        </div>
      )}
      <div
        ref={frameWrapperRef}
        className="flex-1 min-h-0 relative"
      >
        <div className="h-full p-4 relative">
          <HtmlFrame
            ref={htmlFrameRef}
            src={htmlSrc}
            placeholder={thumbSrc}
            canvasWidth={resolved.width}
            canvasHeight={typeof resolved.height === 'number' ? resolved.height : undefined}
            editMode={clientEdits.editMode}
            showEdits={showEdits}
            hasEdits={clientEdits.hasEdits}
            savedEdits={clientEdits.edits}
            onEditsChange={clientEdits.handleEditsChange}
            onScaledWidth={setFrameWidth}
            designMode={designModeActive}
          />
          <AnnotationOverlay
            annotations={annotations}
            annotationMode={annotationMode}
            onAdd={handleAddAnnotation}
            onResolve={handleResolveAnnotation}
            onDelete={handleDeleteAnnotation}
          />
        </div>

        {/* Hot reload flash indicator */}
        {hotReloadFlash && (
          <div
            className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
            style={{
              background: 'rgba(0,0,0,0.5)',
              backdropFilter: 'blur(8px)',
              animation: 'hotReloadFlash 0.6s ease-out forwards',
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span
              className="text-[10px] text-white/80 tracking-wide"
              style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
            >
              Reloaded
            </span>
          </div>
        )}

        {/* Design mode indicator */}
        {designModeActive && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            <span
              className="text-[10px] text-white/80 tracking-wide uppercase"
              style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
            >
              Edit Mode
            </span>
            <span
              className="text-[10px] text-white/40 tracking-wide"
              style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
            >
              Cmd+S save · Esc exit
            </span>
          </div>
        )}

        {/* Branding */}
        <div
          className="fixed bottom-3 left-3 z-10 pointer-events-none"
          style={{
            fontSize: 9,
            fontFamily: 'var(--font-mono, monospace)',
            color: 'var(--foreground)',
            opacity: 0.1,
            letterSpacing: '0.06em',
          }}
        >
          DriftGrid
        </div>

        {/* Frame action bar — bottom center, matches grid action bar */}
        {mode !== 'client' && currentConcept && currentVersion && !navGridHidden && !presentationMode && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-full"
            style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(12px)',
            }}
          >
            <button
              onClick={() => handleStarVersion(currentConcept.id, currentVersion.id)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Star (S)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={isCurrentStarred ? '#facc15' : 'none'} stroke={isCurrentStarred ? '#facc15' : 'white'} strokeWidth="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </button>
            <button
              onClick={() => handleDriftVersion(currentConcept.id, currentVersion.id)}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Drift ↓ (D)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
              </svg>
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(`~/drift/projects/${client}/${project}/${currentVersion.file}`);
              }}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Copy path"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              onClick={async () => {
                const res = await fetch('/api/export', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    client,
                    project,
                    format: 'png',
                    versionId: currentVersion.id,
                  }),
                });
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${currentConcept.label}-v${currentVersion.number}.png`;
                  a.click();
                  URL.revokeObjectURL(url);
                }
              }}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Export PNG"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              onClick={() => handleToggleGridView()}
              className="p-1.5 rounded-full hover:bg-white/10 transition-colors"
              title="Back to grid (G)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
              </svg>
            </button>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
            <span style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              padding: '0 4px',
            }}>
              {currentConcept.label} · v{currentVersion.number}
            </span>
          </div>
        )}

        {/* Presentation mode indicator */}
        {presentationMode && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full z-10"
            style={{
              background: 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <span
              className="text-[10px] tracking-wide text-white/70"
              style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
            >
              {presentationPlaylist.findIndex(p => p.ci === conceptIndex && p.vi === versionIndex) + 1} / {presentationPlaylist.length}
            </span>
            <div className="w-px h-3 bg-white/20" />
            <button
              onClick={() => { setPresentationMode(false); setViewMode('grid'); }}
              className="text-[10px] tracking-wide text-white/50 hover:text-white transition-colors"
              style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
            >
              Exit
            </button>
          </div>
        )}
      </div>
      {!presentationMode && !navGridHidden && (
        <NavigationGrid
          conceptIndex={conceptIndex}
          versionIndex={versionIndex}
          versionCounts={navGridVersionCounts}
          selections={selections}
          conceptIds={navGridConceptIds}
          versionIds={navGridVersionIds}
          inSelectsRow={inSelectsRow}
        />
      )}
      <KeyboardShortcuts
        visible={shortcutsVisible}
        onClose={() => setShortcutsVisible(false)}
      />
      {commandPalette}
    </div>
  );
}
