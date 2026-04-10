'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import useSWR from 'swr';
import type { Manifest, ViewMode, Concept, Version } from '@/lib/types';
import { resolveCanvas } from '@/lib/constants';
import { filterVisibleManifest } from '@/lib/filterManifest';
import { letterToNumber, conceptSlug } from '@/lib/letters';
import { HtmlFrame, type HtmlFrameHandle } from './HtmlFrame';
import { TourOverlay } from './TourOverlay';
import { useTour } from '@/lib/hooks/useTour';
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
import { useHotReload } from '@/lib/hooks/useHotReload';
import { useAnnotationState } from '@/lib/hooks/useAnnotationState';
import { usePresentationMode } from '@/lib/hooks/usePresentationMode';
import { useManifestMutations } from '@/lib/hooks/useManifestMutations';
import { AnnotationOverlay } from './AnnotationOverlay';

const fetcher = (url: string) => fetch(url).then(r => r.json());

interface ViewerProps {
  client: string;
  project: string;
  mode?: ViewMode;
  shareToken?: string;
}

export function Viewer({ client, project, mode = 'designer', shareToken }: ViewerProps) {
  // In share mode, use token-based API routes that read from Supabase Storage
  const manifestUrl = shareToken
    ? `/api/s/${shareToken}/manifest`
    : `/api/manifest/${client}/${project}`;
  const { data: manifest, isLoading, mutate } = useSWR<Manifest>(
    manifestUrl,
    fetcher
  );

  const [conceptIndex, setConceptIndex] = useState(0);
  const [versionIndex, setVersionIndex] = useState(0);
  // Share demos open in grid view (show the whole landscape first).
  // Non-shared client review still opens to frame (clients want to dive in).
  const [viewMode, setViewMode] = useState<'frame' | 'grid'>(
    shareToken ? 'grid' : mode === 'client' ? 'frame' : 'grid'
  );
  const [selections, setSelections] = useState<Set<string>>(new Set());
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const flash = useFlash();
  const ui = useUIVisibility();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{ conceptId: string; versionId: string; file: string; label: string; number: number }[] | null>(null);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>('overview');

  // Demo drift state — only used in share mode (shareToken present).
  // Tracks client-side-only versions/concepts added via D/Shift+D in the demo.
  // Never persisted. Refresh = reset.
  const [demoVersions, setDemoVersions] = useState<Record<string, Version[]>>({});
  const [demoConcepts, setDemoConcepts] = useState<Concept[]>([]);

  // Tour — auto-starts on first visit when viewing a share link
  const tour = useTour(!!shareToken);

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

  // Resolve active round — default to latest round on first load
  const rounds = useMemo(() => manifest?.rounds ?? [], [manifest?.rounds]);
  useEffect(() => {
    if (rounds.length > 0 && activeRoundId === null) {
      setActiveRoundId(rounds[rounds.length - 1].id);
    }
  }, [rounds, activeRoundId]);

  const activeRound = rounds.find(r => r.id === activeRoundId) || rounds[rounds.length - 1];

  // Override manifest.concepts with the active round's concepts before filtering
  const roundScopedManifest = useMemo(() => {
    if (!manifest) return null;
    if (!activeRound) return manifest;
    return { ...manifest, concepts: activeRound.concepts };
  }, [manifest, activeRound]);

  // Layer demo-drift slots on top of the fetched manifest (share mode only).
  // Demo versions are appended to the end of each concept's versions array (top of column visually).
  // Demo concepts are appended to the end of the concepts array.
  const demoManifest = useMemo(() => {
    if (!roundScopedManifest) return null;
    if (!shareToken) return roundScopedManifest;
    if (Object.keys(demoVersions).length === 0 && demoConcepts.length === 0) {
      return roundScopedManifest;
    }
    const newConcepts = roundScopedManifest.concepts.map(c => {
      const extra = demoVersions[c.id];
      if (!extra?.length) return c;
      return { ...c, versions: [...c.versions, ...extra] };
    });
    return {
      ...roundScopedManifest,
      concepts: [...newConcepts, ...demoConcepts],
    };
  }, [roundScopedManifest, shareToken, demoVersions, demoConcepts]);

  const filtered = demoManifest && mode === 'client'
    ? filterVisibleManifest(demoManifest)
    : demoManifest;
  const concepts = filtered?.concepts ?? [];
  const currentConcept = concepts[conceptIndex];
  const versions = currentConcept?.versions ?? [];
  const currentVersion = versions[versionIndex];

  // Extracted hooks
  const annotationState = useAnnotationState(client, project, currentConcept?.id, currentVersion?.id, viewMode);

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
          annotationState.setAnnotationMode(v => !v);
        }
      }
      // Cmd+C: copy frames to clipboard
      if (e.key === 'c' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (viewMode !== 'grid') return;
        e.preventDefault();
        const items: typeof clipboard = [];
        if (multiSelected.size > 0) {
          for (const key of multiSelected) {
            const [cid, vid] = key.split(':');
            const concept = concepts.find(c => c.id === cid);
            const version = concept?.versions.find(v => v.id === vid);
            if (concept && version) {
              items.push({ conceptId: cid, versionId: vid, file: version.file, label: concept.label, number: version.number });
            }
          }
        } else if (currentConcept && currentVersion) {
          items.push({ conceptId: currentConcept.id, versionId: currentVersion.id, file: currentVersion.file, label: currentConcept.label, number: currentVersion.number });
        }
        if (items.length > 0) {
          setClipboard(items);
          toast(items.length === 1 ? `Copied ${items[0].label} v${items[0].number}` : `Copied ${items.length} frames`);
        }
      }
      // Cmd+V: paste frames into current concept
      if (e.key === 'v' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        if (viewMode !== 'grid' || !clipboard || clipboard.length === 0 || !currentConcept) return;
        e.preventDefault();
        (async () => {
          for (const item of clipboard) {
            const res = await fetch('/api/paste', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                client, project,
                sourceFile: item.file,
                sourceLabel: item.label,
                sourceNumber: item.number,
                targetConceptId: currentConcept.id,
                targetRoundId: activeRoundId,
              }),
            });
            if (res.ok) {
              const data = await res.json();
              toast(`Pasted → ${data.conceptLabel} v${data.versionNumber}`);
            } else {
              toast('Paste failed', 'error');
            }
          }
          await mutate();
        })();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [viewMode, annotationState, ui, concepts, currentConcept, currentVersion, multiSelected, clipboard, client, project, activeRoundId, mutate]);
  const presentation = usePresentationMode(
    concepts, selections, conceptIndex, versionIndex, viewMode,
    setConceptIndex, setVersionIndex, setViewMode,
  );
  const frameVersion = useHotReload(viewMode, client, project, currentVersion);
  const mutations = useManifestMutations({
    manifest, client, project, mutate,
    conceptIndex, versionIndex, setConceptIndex, setVersionIndex,
    currentConcept, currentVersion, activeRoundId,
    undo, flash, viewMode, setViewMode, setZoomLevel,
  });

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
        absolutePath: `~/driftgrid/${path}`,
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
  // Supports new format (#slug/letter) and legacy format (#concept-id/vN)
  const hashApplied = useRef(false);
  useEffect(() => {
    if (!concepts.length || hashApplied.current) return;
    hashApplied.current = true;
    const hash = window.location.hash.replace('#', '');
    if (!hash) return;
    const [slugOrId, letterOrV] = hash.split('/');

    // Try new slug-based format first
    let ci = concepts.findIndex(c => c.slug === slugOrId || conceptSlug(c.label) === slugOrId);
    let vi = 0;

    if (ci >= 0 && letterOrV && letterOrV.startsWith('v')) {
      // v{N} format: #slug/v3
      const vNum = parseInt(letterOrV.replace('v', ''), 10);
      const found = concepts[ci].versions.findIndex(v => v.number === vNum);
      if (found >= 0) vi = found;
    } else if (ci >= 0 && letterOrV) {
      // Legacy letter format: #slug/c → convert letter to number
      const vNum = letterToNumber(letterOrV);
      const found = concepts[ci].versions.findIndex(v => v.number === vNum);
      if (found >= 0) vi = found;
    } else {
      // Legacy format: #concept-id/vN
      ci = concepts.findIndex(c => c.id === slugOrId);
      if (ci < 0) return;
      if (letterOrV) {
        const vNum = parseInt(letterOrV.replace('v', ''), 10);
        const found = concepts[ci].versions.findIndex(v => v.number === vNum);
        if (found >= 0) vi = found;
      }
    }

    if (ci < 0) return;
    setConceptIndex(ci);
    setVersionIndex(vi);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [concepts.length]);

  const handleNavigate = useCallback(
    (ci: number, vi: number) => {
      if (multiSelected.size > 0) setMultiSelected(new Set());
      setConceptIndex(ci);
      setVersionIndex(vi);
      tour.trigger('arrow');
      const concept = concepts[ci];
      const version = concept?.versions[vi];
      if (concept && version) {
        const slug = concept.slug || conceptSlug(concept.label);
        window.history.replaceState(null, '', `#${slug}/v${version.number}`);
      }
    },
    [concepts, multiSelected, tour]
  );

  const handleHighlight = useCallback(
    (ci: number, vi: number) => {
      setConceptIndex(ci);
      setVersionIndex(vi);
      const concept = concepts[ci];
      const version = concept?.versions[vi];
      if (concept && version) {
        const slug = concept.slug || conceptSlug(concept.label);
        window.history.replaceState(null, '', `#${slug}/v${version.number}`);
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
        presentation.setIsPresenting(false);
        setZoomLevel('z2');
        setTransitionCardBounds(getTransitionCardBounds(conceptIndex, versionIndex));
        tour.trigger('esc');
        return 'grid';
      }
      tour.trigger('enter');
      return 'frame';
    });
  }, [conceptIndex, versionIndex, getTransitionCardBounds, presentation.setIsPresenting, tour]);

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
        const slug = concept.slug || conceptSlug(concept.label);
        window.history.replaceState(null, '', `#${slug}/v${version.number}`);
      }
      setViewMode('frame');
    },
    [concepts]
  );

  const handleToggleSelect = useCallback(() => {
    if (!currentConcept || !currentVersion) return;
    setSelections(prev => {
      const next = new Set(prev);
      const key = `${currentConcept.id}:${currentVersion.id}`;
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  }, [currentConcept, currentVersion]);

  const handleDeleteCurrent = useCallback(() => {
    if (!currentConcept || !currentVersion) return;
    if (skipDeleteConfirm) {
      mutations.executeDelete();
    } else {
      setConfirmDelete(true);
    }
  }, [currentConcept, currentVersion, skipDeleteConfirm, mutations.executeDelete]);

  const handleStarVersion = useCallback((conceptId: string, versionId: string) => {
    setSelections(prev => {
      const next = new Set(prev);
      const key = `${conceptId}:${versionId}`;
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });

  }, []);

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
      if (c.versions.some(v => selections.has(`${c.id}:${v.id}`))) acc.push(i);
      return acc;
    }, []);
  }, [concepts, selections]);

  const getSelectedVersionIndex = useCallback((ci: number) => {
    const concept = concepts[ci];
    if (!concept) return 0;
    const starred = concept.versions.findIndex(v => selections.has(`${concept.id}:${v.id}`));
    return starred >= 0 ? starred : 0;
  }, [concepts, selections]);

  // Demo drift: adds a client-side-only empty slot to the current concept.
  // Only used when shareToken is present. Never persisted.
  const handleDemoDrift = useCallback(() => {
    if (!currentConcept) return;
    const existing = demoVersions[currentConcept.id] || [];
    const realCount = currentConcept.versions.length - existing.length;
    const nextNumber = realCount + existing.length + 1;
    const newVersion: Version = {
      id: `demo-v${nextNumber}-${Date.now()}`,
      number: nextNumber,
      file: '',
      parentId: null,
      changelog: 'Empty slot — direct your agent to fill this in',
      visible: true,
      starred: false,
      created: new Date().toISOString(),
      thumbnail: '',
    };
    setDemoVersions(prev => ({
      ...prev,
      [currentConcept.id]: [...(prev[currentConcept.id] || []), newVersion],
    }));
    // Advance to the new slot
    setVersionIndex(currentConcept.versions.length); // length AFTER adding = new index
    flash.showDriftFlash('DRIFTED \u2193');
    tour.trigger('drift');
  }, [currentConcept, demoVersions, flash, tour]);

  // Demo branch: adds a client-side-only empty concept column.
  const handleDemoBranch = useCallback(() => {
    if (!concepts.length) return;
    const nextN = concepts.length + 1;
    const newConcept: Concept = {
      id: `demo-concept-${Date.now()}`,
      slug: `demo-concept-${nextN}`,
      label: `Concept ${nextN}`,
      description: 'Empty concept — direct your agent to fill this in',
      position: concepts.length,
      visible: true,
      versions: [{
        id: `demo-v1-${Date.now()}`,
        number: 1,
        file: '',
        parentId: null,
        changelog: 'Empty slot — direct your agent to fill this in',
        visible: true,
        starred: false,
        created: new Date().toISOString(),
        thumbnail: '',
      }],
    };
    setDemoConcepts(prev => [...prev, newConcept]);
    setConceptIndex(concepts.length);
    setVersionIndex(0);
    flash.showDriftFlash('DRIFTED \u2192');
    tour.trigger('branch');
  }, [concepts, flash, tour]);

  const handleDrift = useMemo(() => {
    if (!currentConcept || !currentVersion) return undefined;
    if (shareToken) return handleDemoDrift;
    return () => mutations.handleDriftVersion(currentConcept.id, currentVersion.id);
  }, [currentConcept, currentVersion, mutations.handleDriftVersion, shareToken, handleDemoDrift]);

  const handleBranch = useMemo(() => {
    if (!currentConcept || !currentVersion) return undefined;
    if (shareToken) return handleDemoBranch;
    return () => mutations.handleBranchVersion(currentConcept.id, currentVersion.id);
  }, [currentConcept, currentVersion, mutations.handleBranchVersion, shareToken, handleDemoBranch]);

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
    onMoveConceptLeft: mutations.handleMoveConceptLeft,
    onMoveConceptRight: mutations.handleMoveConceptRight,
    onUndo: undo.handleUndo,
    onPresent: presentation.handlePresent,
    selectsConceptIndices,
    getSelectedVersionIndex,
    viewMode,
    zoomLevel,
    mode,
    client,
  });

  // New round handler — extracted for use in both command palette and multi-select bar
  const handleNewRound = useCallback(async () => {
    // Use multi-selected cards, or fall back to selects
    let cardSelections: { conceptId: string; versionId: string }[];
    if (multiSelected.size > 0) {
      cardSelections = Array.from(multiSelected).map(key => {
        const [conceptId, versionId] = key.split(':');
        return { conceptId, versionId };
      });
    } else if (selections.size > 0) {
      cardSelections = Array.from(selections).map(key => {
        const [conceptId, versionId] = key.split(':');
        return { conceptId, versionId };
      });
    } else {
      toast('Select cards to send to the new round', 'error');
      return;
    }
    const name = window.prompt('Round name (optional):');
    const res = await fetch('/api/rounds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client, project, action: 'create',
        name: name || undefined,
        selections: cardSelections,
        sourceRoundId: activeRound?.id,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      toast(`${data.name} created \u00b7 ${data.conceptCount} concepts`);
      setMultiSelected(new Set());
      setSelections(new Set());
      setConceptIndex(0);
      setVersionIndex(0);
      setActiveRoundId(data.roundId);
      await mutate();
    } else {
      const err = await res.json().catch(() => null);
      toast(err?.error || 'Failed to create round', 'error');
    }
  }, [client, project, multiSelected, selections, activeRound, mutate]);

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
              onClick={() => { setConfirmDelete(false); mutations.executeDelete(); }}
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
      onPresent={() => { presentation.handlePresent(); ui.setCommandPaletteOpen(false); }}
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
        const versions = Array.from(selections).map(key => { const [conceptId, versionId] = key.split(':'); return { conceptId, versionId }; });
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
        const roundSelects = Array.from(selections).map(key => { const [conceptId, versionId] = key.split(':'); return { conceptId, versionId }; });
        const res = await fetch('/api/rounds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client, project, action: 'close',
            name: name || undefined,
            selects: roundSelects,
            roundId: activeRound?.id,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          toast(`Round ${data.roundNumber} closed \u00b7 ${data.selectCount} selects`);
          await mutate();
        }
      }}
      onNewRound={() => { ui.setCommandPaletteOpen(false); handleNewRound(); }}
      onInsertConcept={() => {
        ui.setCommandPaletteOpen(false);
        const label = window.prompt('Concept name:');
        if (label?.trim()) mutations.handleInsertConcept(label.trim(), conceptIndex);
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

  const htmlSrc = shareToken
    ? `/api/s/${shareToken}/html/${currentVersion.file}`
    : `/api/html/${client}/${project}/${currentVersion.file}${frameVersion > 0 ? `?_v=${frameVersion}` : ''}`;
  const thumbFilename = currentVersion.thumbnail?.replace('.thumbs/', '') || null;
  const thumbSrc = thumbFilename ? `/api/thumbs/${client}/${project}/${thumbFilename}` : null;

  // Shared action bar renderer — used in both grid and frame views
  const isCurrentStarred = selections.has(`${currentConcept.id}:${currentVersion.id}`);
  const actionBarBtn = "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors";
  const actionBarKey = { fontFamily: 'var(--font-mono, monospace)', fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' } as const;

  const actionBar = (toggleAction: () => void, toggleIcon: React.ReactNode, toggleTitle: string, toggleKey: string) => (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}
    >
      <button onClick={() => handleStarVersion(currentConcept.id, currentVersion.id)} className={actionBarBtn} title="Add to selects (S)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill={isCurrentStarred ? '#facc15' : 'none'} stroke={isCurrentStarred ? '#facc15' : 'white'} strokeWidth="2">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
        <span style={actionBarKey}>S</span>
      </button>
      <button onClick={() => mutations.handleDriftVersion(currentConcept.id, currentVersion.id)} className={actionBarBtn} title="New iteration (D)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M21.5 2v6h-6" /><path d="M2.5 22v-6h6" /><path d="M2 11.5a10 10 0 0 1 18.8-4.3L21.5 8" /><path d="M22 12.5a10 10 0 0 1-18.8 4.2L2.5 16" />
        </svg>
        <span style={actionBarKey}>D</span>
      </button>
      <button onClick={() => annotationState.setAnnotationMode(v => !v)} className={actionBarBtn} title="Add comment (A)" style={{ opacity: annotationState.annotationMode ? 1 : undefined }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill={annotationState.annotationMode ? 'white' : 'none'} stroke="white" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span style={actionBarKey}>A</span>
      </button>
      <button onClick={async () => {
        const filePath = `~/driftgrid/projects/${client}/${project}/${currentVersion.file}`;
        let text = filePath;
        try {
          const res = await fetch(`/api/annotations?client=${client}&project=${project}&conceptId=${currentConcept.id}&versionId=${currentVersion.id}`);
          if (res.ok) {
            const anns = await res.json();
            if (Array.isArray(anns) && anns.length > 0) {
              const lines = [filePath, '', 'Feedback:'];
              anns.forEach((a: { text: string; resolved?: boolean }, i: number) => {
                const prefix = a.resolved ? '✓ [RESOLVED] ' : '';
                lines.push(`${i + 1}. ${prefix}${a.text}`);
              });
              text = lines.join('\n');
            }
          }
        } catch {}
        navigator.clipboard.writeText(text);
        toast('Copied');
      }} className={actionBarBtn} title="Copy path + feedback">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
        <span style={actionBarKey}>⌘C</span>
      </button>
      <button onClick={handleExportPng} className={actionBarBtn} title="Export as PNG (↓)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span style={actionBarKey}>↓</span>
      </button>
      {selections.size > 0 && (
        <button onClick={() => presentation.handlePresent()} className={actionBarBtn} title="Present selects fullscreen (P)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          <span style={actionBarKey}>P</span>
        </button>
      )}
      <button onClick={toggleAction} className={actionBarBtn} title={toggleTitle}>
        {toggleIcon}
        <span style={actionBarKey}>{toggleKey}</span>
      </button>
      <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />
      <span style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontSize: 10, color: 'rgba(255,255,255,0.35)', padding: '0 4px' }}>
        {currentConcept.label} · v{currentVersion.number}
      </span>
      <a href="/" className={actionBarBtn} title="Back to all projects" style={{ marginLeft: -2 }}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" style={{ opacity: 0.5 }}>
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </a>
    </div>
  );

  const enterFrameIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M15 3h6v6" /><path d="M9 21H3v-6" /><path d="M21 3l-7 7" /><path d="M3 21l7-7" /></svg>;
  const gridIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>;

  // Multi-select action bar (replaces normal action bar when items are multi-selected)
  const multiSelectBar = multiSelected.size > 0 ? (
    <div
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-2 rounded-full"
      style={{ background: 'rgba(45, 212, 191, 0.85)', backdropFilter: 'blur(12px)' }}
    >
      <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'white', fontWeight: 500, padding: '0 4px' }}>
        {multiSelected.size} selected
      </span>
      <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.3)' }} />
      <button
        onClick={() => {
          // Copy all file paths
          const paths = Array.from(multiSelected).map(key => {
            const [cid, vid] = key.split(':');
            const concept = concepts.find(c => c.id === cid);
            const version = concept?.versions.find(v => v.id === vid);
            return version ? `~/driftgrid/projects/${client}/${project}/${version.file}` : '';
          }).filter(Boolean);
          navigator.clipboard.writeText(paths.join('\n'));
          toast(`${paths.length} paths copied`);
        }}
        className="px-2 py-1 rounded-lg hover:bg-white/20 transition-colors text-white"
        style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}
      >
        Copy paths
      </button>
      <button
        onClick={() => {
          // Star all selected
          for (const key of multiSelected) {
            const [cid, vid] = key.split(':');
            handleStarVersion(cid, vid);
          }
          setMultiSelected(new Set());
          toast(`${multiSelected.size} starred`);
        }}
        className="px-2 py-1 rounded-lg hover:bg-white/20 transition-colors text-white"
        style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}
      >
        Star all
      </button>
      <button
        onClick={handleNewRound}
        className="px-2 py-1 rounded-lg hover:bg-white/20 transition-colors text-white"
        style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11 }}
      >
        New round
      </button>
      <button
        onClick={() => setMultiSelected(new Set())}
        className="px-2 py-1 rounded-lg hover:bg-white/20 transition-colors text-white/60"
        style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10 }}
      >
        Clear
      </button>
    </div>
  ) : null;

  // --- GRID VIEW ---
  if (viewMode === 'grid') {
    return (
      <div className="h-screen flex flex-col bg-[var(--background)]">
        {driftOverlay}
        {deleteOverlay}
        {deleteDialog}
        <TourOverlay
          step={tour.currentStep}
          stepIndex={tour.step}
          totalSteps={tour.totalSteps}
          onDismiss={tour.dismiss}
          onNext={tour.next}
        />
        {/* Top-right: project name + round switcher */}
        <div className="fixed top-4 right-4 z-30 flex items-center gap-3" style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
          {/* Round switcher — hidden when only 1 round or in client mode */}
          {rounds.length > 1 && mode !== 'client' && (
            <div className="flex items-center gap-1.5">
              {rounds.map(r => (
                <button
                  key={r.id}
                  onClick={() => {
                    setActiveRoundId(r.id);
                    setConceptIndex(0);
                    setVersionIndex(0);
                    setSelections(new Set());
                  }}
                  className="transition-all"
                  style={{
                    fontSize: 9,
                    letterSpacing: '0.06em',
                    fontWeight: r.id === activeRoundId ? 600 : 400,
                    color: r.id === activeRoundId ? 'var(--foreground)' : 'var(--muted)',
                    opacity: r.id === activeRoundId ? 0.8 : 0.35,
                    padding: '2px 4px',
                    textTransform: 'uppercase',
                  }}
                  title={r.name + (r.closedAt ? ' (closed)' : '')}
                >
                  R{r.number}{r.closedAt ? '' : '\u00b7'}
                </button>
              ))}
            </div>
          )}
          <a
            href="/"
            className="flex items-center gap-1.5 no-underline hover:opacity-80 transition-opacity"
            style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.6 }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            {filtered?.project.name}
          </a>
        </div>
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
            onDeleteVersion={mutations.handleDeleteVersion}
            onDeleteConcept={mutations.handleDeleteConcept}
            onInsertConcept={mutations.handleInsertConcept}
            onHideVersion={mutations.handleHideVersion}
            multiSelected={multiSelected}
            onMultiSelectToggle={(key) => {
              setMultiSelected(prev => {
                const next = new Set(prev);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              });
            }}
            onMultiSelectClear={() => setMultiSelected(new Set())}
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
            onDriftVersion={mutations.handleDriftVersion}
            onBranchVersion={mutations.handleBranchVersion}
            onMoveConceptLeft={mutations.handleMoveConceptLeft}
            onMoveConceptRight={mutations.handleMoveConceptRight}
            onReorderConcepts={mutations.handleReorderConcepts}
            onReorderVersions={mutations.handleReorderVersions}
            onMoveCardBetweenColumns={mutations.handleMoveCardBetweenColumns}
            rounds={rounds.map(r => ({ id: r.id, name: r.name, number: r.number }))}
            activeRoundId={activeRoundId}
            onSendToRound={async (conceptId, versionId, targetRoundId) => {
              const res = await fetch('/api/rounds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client, project, action: 'copy-to', conceptId, versionId, sourceRoundId: activeRoundId, targetRoundId }),
              });
              if (res.ok) {
                const data = await res.json();
                toast(`Sent to ${data.targetRound} → ${data.conceptLabel} v${data.versionNumber}`);
                await mutate();
              } else {
                toast('Failed to send', 'error');
              }
            }}
            onSendToNewRound={async (conceptId, versionId) => {
              const res = await fetch('/api/rounds', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client, project, action: 'create', selections: [{ conceptId, versionId }], sourceRoundId: activeRoundId }),
              });
              if (res.ok) {
                const data = await res.json();
                toast(`${data.name} created with ${data.conceptCount} concept`);
                setActiveRoundId(data.roundId);
                await mutate();
              } else {
                toast('Failed to create round', 'error');
              }
            }}
            mode={mode}
            shareToken={shareToken}
            zoomLevel={zoomLevel}
            onZoomLevelChange={setZoomLevel}
            showHidden={showHidden}
            initialCardBounds={transitionCardBounds}
          />
        </div>
        {multiSelectBar || actionBar(() => handleGridSelect(conceptIndex, versionIndex), enterFrameIcon, 'Enter frame (Enter)', '↵')}
        <KeyboardShortcuts visible={ui.shortcutsVisible} onClose={() => ui.setShortcutsVisible(false)} />
        {commandPalette}
        <ToastContainer />
      </div>
    );
  }

  // --- FRAME VIEW ---
  return (
    <div className="h-screen flex flex-col" style={{ background: mode === 'client' ? '#fff' : 'var(--background)' }}>
      {driftOverlay}
      {deleteOverlay}
      {deleteDialog}
      <TourOverlay
          step={tour.currentStep}
          stepIndex={tour.step}
          totalSteps={tour.totalSteps}
          onDismiss={tour.dismiss}
          onNext={tour.next}
        />
      <div ref={frameWrapperRef} className="flex-1 min-h-0 relative">
        <div className="h-full p-4 relative" style={{ background: mode === 'client' ? '#fff' : 'var(--canvas)' }}>
          {!currentVersion.file ? (
            <div
              className="h-full flex flex-col items-center justify-center gap-4"
              style={{
                border: '1.5px dashed var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--muted)',
                fontFamily: 'var(--font-mono, monospace)',
              }}
            >
              <div style={{ fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.4 }}>
                Empty slot
              </div>
              <div style={{ fontSize: 14, opacity: 0.5, textAlign: 'center', maxWidth: 400, lineHeight: 1.6 }}>
                Direct your agent to fill this in.<br />
                <span style={{ opacity: 0.6, fontSize: 12 }}>
                  e.g. &quot;make this version bolder and more minimal&quot;
                </span>
              </div>
              <div style={{ fontSize: 10, opacity: 0.3, letterSpacing: '0.08em', marginTop: 16 }}>
                In your local DriftGrid, this slot becomes a real HTML file<br />
                that your agent writes to.
              </div>
            </div>
          ) : (
            <HtmlFrame
              ref={htmlFrameRef}
              src={htmlSrc}
              placeholder={thumbSrc}
              borderless={mode === 'client'}
              canvasWidth={resolved.width}
              canvasHeight={typeof resolved.height === 'number' ? resolved.height : undefined}
              editMode={clientEdits.editMode}
              showEdits={showEdits}
              hasEdits={clientEdits.hasEdits}
              savedEdits={clientEdits.edits}
              onEditsChange={clientEdits.handleEditsChange}
            />
          )}
          <AnnotationOverlay
            annotations={annotationState.annotations}
            annotationMode={annotationState.annotationMode}
            onAdd={annotationState.handleAddAnnotation}
            onDelete={annotationState.handleDeleteAnnotation}
            onResolve={annotationState.handleResolveAnnotation}
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
        {mode !== 'client' && !ui.navGridHidden && !presentation.isPresenting && actionBar(() => handleToggleGridView(), gridIcon, 'Back to grid (G)', 'G')}
        {/* Presentation mode indicator */}
        {presentation.isPresenting && (
          <div
            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 px-4 py-2 rounded-full z-10"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          >
            <span className="text-[10px] tracking-wide text-white/70" style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
              {presentation.presentationPlaylist.findIndex(p => p.ci === conceptIndex && p.vi === versionIndex) + 1} / {presentation.presentationPlaylist.length}
            </span>
            <div className="w-px h-3 bg-white/20" />
            <button
              onClick={() => { presentation.setIsPresenting(false); setViewMode('grid'); }}
              className="text-[10px] tracking-wide text-white/50 hover:text-white transition-colors"
              style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}
            >
              Exit
            </button>
          </div>
        )}
      </div>
      {!presentation.isPresenting && !ui.navGridHidden && (
        <NavigationGrid
          conceptIndex={conceptIndex}
          versionIndex={versionIndex}
          versionCounts={navGridVersionCounts}
          selections={selections}
          conceptIds={navGridConceptIds}
          versionIds={navGridVersionIds}
          currentVersionNumber={currentVersion?.number}
        />
      )}
      <KeyboardShortcuts visible={ui.shortcutsVisible} onClose={() => ui.setShortcutsVisible(false)} />
      {commandPalette}
      <ToastContainer />
    </div>
  );
}
