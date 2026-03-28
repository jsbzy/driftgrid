'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import useSWR from 'swr';
import type { Manifest, ViewMode } from '@/lib/types';
import { resolveCanvas } from '@/lib/constants';
import { filterVisibleManifest } from '@/lib/filterManifest';
import { HtmlFrame, type HtmlFrameHandle } from './HtmlFrame';
import { NavigationGrid } from './NavigationGrid';
import { CanvasView, type CanvasViewHandle } from './CanvasView';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { CommandPalette } from './CommandPalette';
import { toast, ToastContainer } from './Toast';
import { useKeyboardNav, type ZoomLevel } from '@/lib/hooks/useKeyboardNav';
import { useClientEdits } from '@/lib/hooks/useClientEdits';
import { computeCanvasLayout, getCardBounds } from '@/lib/hooks/useCanvasLayout';
import { useFlash } from '@/lib/hooks/useFlash';
import { useUIVisibility } from '@/lib/hooks/useUIVisibility';
import { useUndoManager } from '@/lib/hooks/useUndoManager';
import { AnnotationOverlay } from './AnnotationOverlay';
import type { Annotation } from '@/lib/types';

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
  const [viewMode, setViewMode] = useState<'frame' | 'grid'>(mode === 'client' ? 'frame' : 'grid');
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const flash = useFlash();
  const ui = useUIVisibility();
  // Presentation mode state
  const [isPresenting, setIsPresenting] = useState(false);
  // Annotations — simple pin mode
  const [annotationMode, setAnnotationMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('overview');
  // Smooth zoom transition state
  const canvasRef = useRef<CanvasViewHandle>(null);
  const frameWrapperRef = useRef<HTMLDivElement>(null);
  const [transitionCardBounds, setTransitionCardBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Undo manager
  const undo = useUndoManager(manifest, client, project, mutate, setConceptIndex, setVersionIndex, versionIndex);

  const handleZoomToLevel = useCallback((level: ZoomLevel) => {
    setZoomLevel(level);
  }, []);

  // Clear transition card bounds after the grid has mounted and consumed it
  useEffect(() => {
    if (viewMode === 'grid' && transitionCardBounds) {
      const timer = setTimeout(() => setTransitionCardBounds(null), 50);
      return () => clearTimeout(timer);
    }
  }, [viewMode, transitionCardBounds]);

  // ? key to toggle shortcuts panel, Cmd+K command palette, H for HUD toggle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return;

      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        ui.setCommandPaletteOpen(v => !v);
      }
      if (e.key === '?') {
        e.preventDefault();
        ui.setShortcutsVisible(v => !v);
      }
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        ui.setNavGridHidden(v => !v);
      }
      if (e.key === 'a' || e.key === 'A') {
        if (viewMode === 'frame') {
          e.preventDefault();
          setAnnotationMode(v => !v);
        }
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

  // Fetch annotations when viewing a frame
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
      setAnnotationMode(false);
      toast('Annotation added');
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

  // Clear annotation mode when leaving frame
  useEffect(() => {
    if (viewMode !== 'frame') setAnnotationMode(false);
  }, [viewMode]);

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts.length]);

  const handleNavigate = useCallback(
    (ci: number, vi: number) => {
      setConceptIndex(ci);
      setVersionIndex(vi);
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
        setIsPresenting(false);
        setZoomLevel('z2');
        setTransitionCardBounds(getTransitionCardBounds(conceptIndex, versionIndex));
        return 'grid';
      }
      return 'frame';
    });
  }, [conceptIndex, versionIndex, getTransitionCardBounds]);

  // Pinch zoom out from frame -> exit to grid
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
      setConceptIndex(ci);
      setVersionIndex(vi);
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

  }, [currentConcept, currentVersion]);

  const handleDeleteVersion = useCallback(async (conceptId: string, versionId: string) => {
    if (!manifest) return;
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

  const handleHideVersion = useCallback(async (conceptId: string, versionId: string) => {
    if (!manifest) return;
    const updated: Manifest = {
      ...manifest,
      concepts: manifest.concepts.map(c => {
        if (c.id !== conceptId) return c;
        return {
          ...c,
          versions: c.versions.map(v =>
            v.id === versionId ? { ...v, visible: false } : v
          ),
        };
      }),
    };
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    mutate(updated);
    toast('Version hidden');
  }, [manifest, client, project, mutate]);

  const executeDelete = useCallback(async () => {
    if (!manifest || !currentConcept || !currentVersion) return;

    undo.trackDelete({
      conceptId: currentConcept.id,
      versionId: currentVersion.id,
      version: currentVersion,
      conceptIndex,
    });

    flash.showDeleteFlash();

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

    await new Promise(r => setTimeout(r, 400));

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

  const handleDriftVersion = useCallback(async (conceptId: string, versionId: string) => {
    try {
      const resPromise = fetch('/api/iterate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project, conceptId, versionId }),
      });

      flash.showDriftFlash('DRIFTED');

      const res = await resPromise;
      if (!res.ok) { flash.hideDriftFlash(); toast('Drift failed', 'error'); return; }
      const { absolutePath, versionId: newVid, versionNumber } = await res.json();
      try { await navigator.clipboard.writeText(absolutePath); } catch { /* clipboard may be unavailable */ }
      toast('Drifted \u2193 \u2014 path copied');

      undo.trackDrift({ conceptId, versionId: newVid });

      const updated = await mutate();
      if (updated) {
        const ci = updated.concepts.findIndex(c => c.id === conceptId);
        if (ci >= 0) {
          const vi = updated.concepts[ci].versions.findIndex(v => v.id === newVid);
          if (vi >= 0) {
            setConceptIndex(ci);
            setVersionIndex(vi);
            window.history.replaceState(null, '', `#${updated.concepts[ci].id}/v${versionNumber}`);
          }
        }
      }
    } catch { flash.hideDriftFlash(); toast('Drift failed', 'error'); }
  }, [client, project, mutate]);

  const handleBranchVersion = useCallback(async (conceptId: string, versionId: string) => {
    try {
      flash.showDriftFlash('DRIFTED \u2192');

      const res = await fetch('/api/branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, project, conceptId, versionId }),
      });
      if (!res.ok) { flash.hideDriftFlash(); toast('Branch failed', 'error'); return; }
      const { conceptId: newConceptId, absolutePath } = await res.json();
      try { await navigator.clipboard.writeText(absolutePath); } catch { /* clipboard may be unavailable */ }
      toast('Drifted \u2192 \u2014 new concept, path copied');

      await new Promise(r => setTimeout(r, 500));

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
    } catch { flash.hideDriftFlash(); toast('Branch failed', 'error'); }
  }, [client, project, mutate, viewMode, flash]);

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

  }, []);

  // Presentation mode — enter fullscreen cycling through selects only
  const handlePresent = useCallback(() => {
    if (selections.size === 0) return;
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
    setIsPresenting(true);
    const concept = concepts[ci];
    const version = concept?.versions[vi];
    if (concept && version) {
      window.history.replaceState(null, '', `#${concept.id}/v${version.number}`);
    }
  }, [selections, concepts]);

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
  }, [isPresenting, viewMode, presentationPlaylist, conceptIndex, versionIndex, concepts]);

  // SSE hot reload — listen for file changes in fullscreen mode
  const currentVersionRef = useRef(currentVersion);
  currentVersionRef.current = currentVersion;
  const [frameVersion, setFrameVersion] = useState(0);

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
            const changedFile = (data.file as string).replace(/\\/g, '/');
            const versionFile = cv.file.replace(/\\/g, '/');
            if (versionFile === changedFile || versionFile.endsWith('/' + changedFile) || changedFile.endsWith('/' + versionFile)) {
              setFrameVersion(v => v + 1);
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
    return () => handleDriftVersion(currentConcept.id, currentVersion.id);
  }, [currentConcept, currentVersion, handleDriftVersion]);

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
    onUndo: undo.handleUndo,
    onPresent: handlePresent,
    selectsConceptIndices,
    getSelectedVersionIndex,
    viewMode,
    zoomLevel,
    mode,
    client,
  });

  // Export PNG handler
  const handleExportPng = useCallback(async () => {
    if (!currentVersion || !currentConcept) return;
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client, project, format: 'png', versionId: currentVersion.id }),
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
  }, [client, project, currentVersion, currentConcept]);

  // Drift overlay toast
  const driftOverlay = flash.driftFlash ? (
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
      }}>{flash.flashLabel}</span>
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
  const deleteOverlay = flash.deleteFlash ? (
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

  // Delete confirmation dialog
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

  const commandPalette = (
    <CommandPalette
      open={ui.commandPaletteOpen}
      onClose={() => ui.setCommandPaletteOpen(false)}
      onFitAll={() => { setZoomLevel('overview'); ui.setCommandPaletteOpen(false); }}
      onZoomCard={() => { setZoomLevel('z4'); ui.setCommandPaletteOpen(false); }}
      onToggleStar={() => { handleToggleSelect(); ui.setCommandPaletteOpen(false); }}
      onPresent={() => { handlePresent(); ui.setCommandPaletteOpen(false); }}
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
        ui.setCommandPaletteOpen(false);
      }}
      onToggleGridFrame={() => { handleToggleGridView(); ui.setCommandPaletteOpen(false); }}
      onDrift={() => { if (handleDrift) { handleDrift(); ui.setCommandPaletteOpen(false); } }}
      onBranch={() => { if (handleBranch) { handleBranch(); ui.setCommandPaletteOpen(false); } }}
      onDelete={() => { handleDeleteCurrent(); ui.setCommandPaletteOpen(false); }}
      onUndo={() => { undo.handleUndo(); ui.setCommandPaletteOpen(false); }}
      onExportPng={async () => {
        await handleExportPng();
        ui.setCommandPaletteOpen(false);
      }}
      onToggleShowHidden={() => { setShowHidden(v => !v); ui.setCommandPaletteOpen(false); }}
      onDriftToProject={async () => {
        ui.setCommandPaletteOpen(false);
        if (selections.size === 0) {
          toast('Star some versions first', 'error');
          return;
        }
        const name = window.prompt('New project name:');
        if (!name) return;
        const versions = Array.from(selections.entries()).map(([conceptId, versionId]) => ({ conceptId, versionId }));
        const res = await fetch('/api/drift-to-project', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client, project, versions, newProject: name }),
        });
        if (res.ok) {
          const data = await res.json();
          toast(`New project "${name}" created with ${data.conceptCount} concepts`);
          window.open(data.url, '_blank');
        } else {
          const err = await res.json().catch(() => null);
          toast(err?.error || 'Failed to create project', 'error');
        }
      }}
      onCloseRound={async () => {
        ui.setCommandPaletteOpen(false);
        if (selections.size === 0) {
          toast('No selects to save', 'error');
          return;
        }
        const name = window.prompt('Round name (optional):');
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
          toast(`Round ${data.roundNumber} saved \u00b7 ${data.selectCount} selects`);
          await mutate();
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

  // Use concept-level canvas override if set, otherwise project-level
  const canvasConfig = currentConcept?.canvas ?? filtered.project.canvas;
  const resolved = resolveCanvas(canvasConfig);
  const aspectRatio = typeof resolved.height === 'number'
    ? `${resolved.width} / ${resolved.height}`
    : '16 / 9';

  const htmlSrc = `/api/html/${client}/${project}/${currentVersion.file}${frameVersion > 0 ? `?_v=${frameVersion}` : ''}`;
  const thumbFilename = currentVersion.thumbnail?.replace('.thumbs/', '') || null;
  const thumbSrc = thumbFilename ? `/api/thumbs/${client}/${project}/${thumbFilename}` : null;

  // Shared action bar renderer — used in both grid and frame views
  const isCurrentStarred = selections.get(currentConcept.id) === currentVersion.id;
  const actionBarBtn = "p-1.5 rounded-full hover:bg-white/10 transition-colors";

  const actionBar = (toggleAction: () => void, toggleIcon: React.ReactNode, toggleTitle: string) => (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-full"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}
    >
      <button onClick={() => handleStarVersion(currentConcept.id, currentVersion.id)} className={actionBarBtn} title="Star (S)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill={isCurrentStarred ? '#facc15' : 'none'} stroke={isCurrentStarred ? '#facc15' : 'white'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
      </button>
      <button onClick={() => handleDriftVersion(currentConcept.id, currentVersion.id)} className={actionBarBtn} title="Drift (D)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
        </svg>
      </button>
      <button onClick={() => { navigator.clipboard.writeText(`~/drift/projects/${client}/${project}/${currentVersion.file}`); toast('Path copied'); }} className={actionBarBtn} title="Copy path">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <button onClick={handleExportPng} className={actionBarBtn} title="Export PNG">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
      <button onClick={toggleAction} className={actionBarBtn} title={toggleTitle}>
        {toggleIcon}
      </button>
      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.15)' }} />
      <span style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontSize: 10, color: 'rgba(255,255,255,0.4)', padding: '0 4px' }}>
        {currentConcept.label} · v{currentVersion.number}
      </span>
    </div>
  );

  const enterFrameIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><polyline points="9 10 4 15 9 20" /><path d="M20 4v7a4 4 0 0 1-4 4H4" /></svg>;
  const gridIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;

  // --- GRID VIEW ---
  if (viewMode === 'grid') {
    return (
      <div className="h-screen flex flex-col bg-[var(--background)]">
        {driftOverlay}
        {deleteOverlay}
        {deleteDialog}
        <div className="flex-1 min-h-0">
          <CanvasView
            ref={canvasRef}
            concepts={concepts}
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
            onHideVersion={handleHideVersion}
            onDriftToProject={async (conceptId: string, versionId: string) => {
              const name = window.prompt('New project name:');
              if (!name) return;
              const res = await fetch('/api/drift-to-project', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client, project, versions: [{ conceptId, versionId }], newProject: name }),
              });
              if (res.ok) {
                const data = await res.json();
                toast(`New project "${name}" created`);
                window.open(data.url, '_blank');
              } else {
                toast('Failed to create project', 'error');
              }
            }}
            onDriftVersion={handleDriftVersion}
            onBranchVersion={handleBranchVersion}
            onMoveConceptLeft={handleMoveConceptLeft}
            onMoveConceptRight={handleMoveConceptRight}
            onReorderConcepts={handleReorderConcepts}
            mode={mode}
            zoomLevel={zoomLevel}
            onZoomLevelChange={setZoomLevel}
            showHidden={showHidden}
            initialCardBounds={transitionCardBounds}
          />
        </div>
        {actionBar(() => handleGridSelect(conceptIndex, versionIndex), enterFrameIcon, 'Enter frame')}
        <KeyboardShortcuts visible={ui.shortcutsVisible} onClose={() => ui.setShortcutsVisible(false)} />
        {commandPalette}
        <ToastContainer />
      </div>
    );
  }

  // --- FRAME VIEW ---
  return (
    <div className="h-screen flex flex-col" style={{ background: 'var(--background)' }}>
      {driftOverlay}
      {deleteOverlay}
      {deleteDialog}
      {/* Floating frame info — top-left */}
      <div className="fixed top-4 left-4 z-30 flex items-center gap-2">
        <a
          href="/"
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: 11, color: 'var(--muted)', textDecoration: 'none', opacity: 0.6,
          }}
        >
          {filtered?.project.name}
        </a>
        <span style={{ color: 'var(--border)', fontSize: 10 }}>/</span>
        <button
          onClick={() => handleToggleGridView()}
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: 11, fontWeight: 500, color: 'var(--foreground)', opacity: 0.7,
            background: 'none', border: 'none', cursor: 'pointer',
          }}
        >
          {currentConcept?.label} · v{currentVersion?.number}
        </button>
      </div>
      <div ref={frameWrapperRef} className="flex-1 min-h-0 relative">
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
          />
          <AnnotationOverlay
            annotations={annotations}
            annotationMode={annotationMode}
            onAdd={handleAddAnnotation}
            onDelete={handleDeleteAnnotation}
            onResolve={() => {}}
          />
        </div>
        {/* Branding */}
        <div
          className="fixed bottom-3 left-3 z-10 pointer-events-none"
          style={{ fontSize: 9, fontFamily: 'var(--font-mono, monospace)', color: 'var(--foreground)', opacity: 0.1, letterSpacing: '0.06em' }}
        >
          DriftGrid
        </div>
        {/* Frame action bar */}
        {mode !== 'client' && !ui.navGridHidden && !isPresenting && actionBar(() => handleToggleGridView(), gridIcon, 'Back to grid (G)')}
        {/* Presentation mode indicator */}
        {isPresenting && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full z-10"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          >
            <span className="text-[10px] tracking-wide text-white/70" style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
              {presentationPlaylist.findIndex(p => p.ci === conceptIndex && p.vi === versionIndex) + 1} / {presentationPlaylist.length}
            </span>
            <div className="w-px h-3 bg-white/20" />
            <button
              onClick={() => { setIsPresenting(false); setViewMode('grid'); }}
              className="text-[10px] tracking-wide text-white/50 hover:text-white transition-colors"
              style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
            >
              Exit
            </button>
          </div>
        )}
      </div>
      {!isPresenting && !ui.navGridHidden && (
        <NavigationGrid
          conceptIndex={conceptIndex}
          versionIndex={versionIndex}
          versionCounts={navGridVersionCounts}
          selections={selections}
          conceptIds={navGridConceptIds}
          versionIds={navGridVersionIds}
        />
      )}
      <KeyboardShortcuts visible={ui.shortcutsVisible} onClose={() => ui.setShortcutsVisible(false)} />
      {commandPalette}
      <ToastContainer />
    </div>
  );
}
