'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import useSWR from 'swr';
import type { Manifest, ViewMode, Concept, Version } from '@/lib/types';
import { resolveCanvas, isAwaitingFirstPrompt } from '@/lib/constants';
import { filterVisibleManifest, filterStarredManifest } from '@/lib/filterManifest';
import { letterToNumber, conceptSlug } from '@/lib/letters';
import { HtmlFrame, type HtmlFrameHandle } from './HtmlFrame';
import { TourOverlay } from './TourOverlay';
import { useTour } from '@/lib/hooks/useTour';
import { useUnreadVersions } from '@/lib/hooks/useUnreadVersions';
import { NavigationGrid } from './NavigationGrid';
import { CanvasView, type CanvasViewHandle } from './CanvasView';
import { ShortcutsBar } from './ShortcutsBar';
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
import { useClientComments } from '@/lib/hooks/useClientComments';
import { useShareToken } from '@/lib/hooks/useShareToken';
import { usePresentationMode } from '@/lib/hooks/usePresentationMode';
import { useManifestMutations } from '@/lib/hooks/useManifestMutations';
import { AnnotationOverlay } from './AnnotationOverlay';
import { ClientNamePrompt } from './ClientNamePrompt';
import { SharePanel } from './SharePanel';

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
    fetcher,
    {
      // Manifests can be large (tens of KB to MB) and don't change from
      // focus events. Let the file watcher / explicit mutate() drive updates.
      revalidateOnFocus: false,
      revalidateIfStale: false,
      dedupingInterval: 2000,
    },
  );

  const [conceptIndex, setConceptIndex] = useState(0);
  const [versionIndex, setVersionIndex] = useState(0);
  // Client/share views open directly into slide 1 (frame view). Designer starts in grid.
  const [viewMode, setViewMode] = useState<'frame' | 'grid'>(
    mode === 'client' ? 'frame' : 'grid'
  );
  const [selections, setSelections] = useState<Set<string>>(new Set());
  const [selectionsInitialized, setSelectionsInitialized] = useState(false);
  const [activeRoundId, setActiveRoundId] = useState<string | null>(null);
  const flash = useFlash();
  const ui = useUIVisibility();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());
  const [clipboard, setClipboard] = useState<{ conceptId: string; versionId: string; file: string; label: string; number: number }[] | null>(null);
  // Share/client views land at a closer zoom so a client immediately sees readable
  // card content — they're here to review, not to get a map of the project.
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>(mode === 'client' ? 'z2' : 'overview');
  const [sharePanelOpen, setSharePanelOpen] = useState(false);
  // After drift from frame view, auto-enable annotation mode on the new slot
  const autoEnableAnnotationRef = useRef(false);

  // Demo drift state — only used in share mode (shareToken present).
  // Tracks client-side-only versions/concepts added via D/Shift+D in the demo.
  // Never persisted. Refresh = reset.
  const [demoVersions, setDemoVersions] = useState<Record<string, Version[]>>({});
  const [demoConcepts, setDemoConcepts] = useState<Concept[]>([]);

  // Walkthrough detection: the meta demo project uses persistent walkthrough mode
  // where each column = one step. Navigation drives the tour.
  const isWalkthrough = client === 'demo' && project === 'welcome-to-driftgrid';

  // Tour — auto-starts on first visit (designer mode only). Disabled for client/share views.
  // In walkthrough mode, the tour is always active and follows conceptIndex.
  const tour = useTour(mode !== 'client' && !shareToken, {
    mode: isWalkthrough ? 'walkthrough' : 'action',
    walkthroughStepIndex: conceptIndex,
    onWalkthroughDone: () => {
      // Hand off to the real project demo
      window.location.href = '/s/amVmZi9kZW1vL3dhdmVsZW5ndGg';
    },
  });

  // Unread versions (localStorage-backed, in-memory for share mode)
  const unread = useUnreadVersions(client, project, !!shareToken);

  // Initialize selections from manifest.starred on first load
  useEffect(() => {
    if (selectionsInitialized || !manifest?.concepts) return;
    const initial = new Set<string>();
    for (const concept of manifest.concepts) {
      for (const version of concept.versions) {
        if (version.starred) initial.add(`${concept.id}:${version.id}`);
      }
    }
    if (initial.size > 0) setSelections(initial);
    setSelectionsInitialized(true);
  }, [manifest, selectionsInitialized]);

  // Smooth zoom transition state
  const canvasRef = useRef<CanvasViewHandle>(null);
  const frameWrapperRef = useRef<HTMLDivElement>(null);
  const [transitionCardBounds, setTransitionCardBounds] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Undo manager
  const undo = useUndoManager(manifest, client, project, mutate, setConceptIndex, setVersionIndex, versionIndex, activeRoundId);

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
    ? filterStarredManifest(filterVisibleManifest(demoManifest))
    : demoManifest;
  const concepts = filtered?.concepts ?? [];
  const currentConcept = concepts[conceptIndex];
  const versions = currentConcept?.versions ?? [];
  const currentVersion = versions[versionIndex];

  // Extracted hooks
  const annotationState = useAnnotationState(client, project, currentConcept?.id, currentVersion?.id, viewMode, shareToken);

  // Client comments — DB-backed comments for shared projects.
  // When shareToken is present (client mode), these override the demo-only annotations.
  const clientComments = useClientComments(shareToken);

  // Designer mode: fetch client comments via the project's share token so the
  // designer can see feedback left by clients on their own grid.
  const designerShareToken = useShareToken(client, project, mode !== 'client' && !shareToken);
  const designerClientComments = useClientComments(designerShareToken ?? undefined);

  // Bridge client comments → Annotation[] for the AnnotationOverlay
  const clientAnnotations = useMemo(() => {
    if (!shareToken || !currentConcept || !currentVersion) return [];
    return clientComments.getCommentsForVersion(currentConcept.id, currentVersion.id).map(c => ({
      id: c.id,
      x: c.x_rel,
      y: c.y_rel,
      element: c.element_selector,
      text: c.body,
      author: c.author_name,
      isClient: true,
      isAgent: false,
      created: c.created_at,
      resolved: c.status === 'resolved',
      parentId: c.parent_comment_id,
    }));
  }, [shareToken, currentConcept, currentVersion, clientComments]);

  // In share mode, override annotation handlers to route through client comments DB
  const shareAnnotationHandlers = useMemo(() => {
    if (!shareToken) return null;
    return {
      annotations: clientAnnotations,
      annotationMode: annotationState.annotationMode,
      setAnnotationMode: annotationState.setAnnotationMode,
      handleAddAnnotation: async (x: number | null, y: number | null, text: string, _provider?: string) => {
        // Provider tag is ignored in share/client mode — clients aren't agents and don't route prompts.
        if (!currentConcept || !currentVersion || !clientComments.authorName) return null;
        await clientComments.addComment(
          currentConcept.id, currentVersion.id, text, x, y,
        );
        annotationState.setAnnotationMode(false);
        toast('Comment added');
        return null;
      },
      handleDeleteAnnotation: async (id: string) => {
        const ok = await clientComments.deleteComment(id);
        toast(ok ? 'Comment deleted' : 'Delete failed', ok ? undefined : 'error');
      },
      handleResolveAnnotation: async (id: string) => {
        await clientComments.resolveComment(id);
      },
      handleEditAnnotation: async () => {},
      handleReplyAnnotation: async (parentId: string, text: string) => {
        if (!currentConcept || !currentVersion || !clientComments.authorName) return;
        await clientComments.addComment(
          currentConcept.id, currentVersion.id, text, null, null,
          undefined, parentId,
        );
      },
      handleSetAnnotationStatus: async () => {},
    };
  }, [shareToken, clientAnnotations, annotationState, currentConcept, currentVersion, clientComments]);

  // Designer mode: merge client comments (cyan pins) into the designer's annotations
  const designerAnnotationsWithClientComments = useMemo(() => {
    if (shareToken || !designerShareToken || !currentConcept || !currentVersion) return null;
    const clientAnns = designerClientComments.getCommentsForVersion(currentConcept.id, currentVersion.id);
    if (clientAnns.length === 0) return null;
    const mapped = clientAnns.map(c => ({
      id: c.id,
      x: c.x_rel,
      y: c.y_rel,
      element: c.element_selector,
      text: c.body,
      author: c.author_name,
      isClient: true,
      isAgent: false,
      created: c.created_at,
      resolved: c.status === 'resolved',
      parentId: c.parent_comment_id,
    }));
    return {
      ...annotationState,
      annotations: [...annotationState.annotations, ...mapped],
      handleResolveAnnotation: async (id: string) => {
        // Check if it's a client comment (UUID format) vs annotation
        if (id.length > 20) {
          await designerClientComments.resolveComment(id);
        } else {
          await annotationState.handleResolveAnnotation(id);
        }
      },
      handleDeleteAnnotation: async (id: string) => {
        // Admin delete: client comments (UUID) go through share endpoint; designer annotations stay on /api/annotations
        if (id.length > 20) {
          const ok = await designerClientComments.deleteComment(id);
          toast(ok ? 'Comment deleted' : 'Delete failed', ok ? undefined : 'error');
        } else {
          await annotationState.handleDeleteAnnotation(id);
        }
      },
    };
  }, [shareToken, designerShareToken, currentConcept, currentVersion, designerClientComments, annotationState]);

  // Use share handlers when available, designer+client merge, or default annotation state
  const activeAnnotations = shareAnnotationHandlers ?? designerAnnotationsWithClientComments ?? annotationState;

  // On first project load, bulk-mark all existing versions as read so the grid
  // doesn't light up entirely. Only runs once per project when the unread hook
  // initializes and we have a concept list to work with.
  const didBulkMarkRead = useRef(false);
  useEffect(() => {
    if (didBulkMarkRead.current) return;
    if (!concepts.length) return;
    const keys: string[] = [];
    for (const c of concepts) {
      for (const v of c.versions) {
        keys.push(`${c.id}:${v.id}`);
      }
    }
    if (keys.length > 0) {
      unread.markAllRead(keys);
      didBulkMarkRead.current = true;
    }
  }, [concepts, unread]);

  // Mark current version as read when user enters frame view
  useEffect(() => {
    if (viewMode === 'frame' && currentConcept && currentVersion) {
      unread.markRead(currentConcept.id, currentVersion.id);
    }
  }, [viewMode, currentConcept, currentVersion, unread]);

  // Build the set of currently-unread keys for CanvasView
  const unreadKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of concepts) {
      for (const v of c.versions) {
        if (unread.isUnread(c.id, v.id)) {
          set.add(`${c.id}:${v.id}`);
        }
      }
    }
    return set;
  }, [concepts, unread]);

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
      // H: hide both the shortcuts bar and the minimap. A small ? pill remains to unhide.
      if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        ui.setNavGridHidden(v => !v);
      }
      // C (without Cmd): toggle comment/annotation mode — frame view only
      if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) {
        if (viewMode === 'frame') {
          e.preventDefault();
          activeAnnotations.setAnnotationMode(v => !v);
          tour.trigger('comment');
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
  }, [viewMode, annotationState, ui, concepts, currentConcept, currentVersion, multiSelected, clipboard, client, project, activeRoundId, mutate, tour]);
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
    if (!currentConcept || !currentVersion || !manifest) return;
    const key = `${currentConcept.id}:${currentVersion.id}`;
    setSelections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    // Persist starred state to manifest
    const newStarred = !selections.has(key);
    const updated = {
      ...manifest,
      concepts: manifest.concepts.map(c =>
        c.id !== currentConcept.id ? c : {
          ...c,
          versions: c.versions.map(v =>
            v.id !== currentVersion.id ? v : { ...v, starred: newStarred }
          ),
        }
      ),
    };
    if (manifest.rounds?.length) {
      updated.rounds = manifest.rounds.map(r => ({
        ...r,
        concepts: r.concepts.map(c =>
          c.id !== currentConcept.id ? c : {
            ...c,
            versions: c.versions.map(v =>
              v.id !== currentVersion.id ? v : { ...v, starred: newStarred }
            ),
          }
        ),
      }));
    }
    fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    mutate(updated, false);
  }, [currentConcept, currentVersion, manifest, selections, client, project, mutate]);

  const handleDeleteCurrent = useCallback(() => {
    if (!currentConcept || !currentVersion) return;
    if (skipDeleteConfirm) {
      mutations.executeDelete();
    } else {
      setConfirmDelete(true);
    }
  }, [currentConcept, currentVersion, skipDeleteConfirm, mutations.executeDelete]);

  const handleStarVersion = useCallback((conceptId: string, versionId: string) => {
    if (!manifest) return;
    const key = `${conceptId}:${versionId}`;
    setSelections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    // Persist starred state to manifest
    const newStarred = !selections.has(key);
    const updated = {
      ...manifest,
      concepts: manifest.concepts.map(c =>
        c.id !== conceptId ? c : {
          ...c,
          versions: c.versions.map(v =>
            v.id !== versionId ? v : { ...v, starred: newStarred }
          ),
        }
      ),
    };
    if (manifest.rounds?.length) {
      updated.rounds = manifest.rounds.map(r => ({
        ...r,
        concepts: r.concepts.map(c =>
          c.id !== conceptId ? c : {
            ...c,
            versions: c.versions.map(v =>
              v.id !== versionId ? v : { ...v, starred: newStarred }
            ),
          }
        ),
      }));
    }
    fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    mutate(updated, false);
  }, [manifest, selections, client, project, mutate]);

  const isClientMode = mode === 'client';
  const clientEdits = useClientEdits({
    client,
    project,
    versionId: currentVersion?.id ?? '',
    enabled: isClientMode,
  });
  const htmlFrameRef = useRef<HtmlFrameHandle>(null);
  const [frameIframeEl, setFrameIframeEl] = useState<HTMLIFrameElement | null>(null);
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
    return async () => {
      canvasRef.current?.suppressNextPan();

      // Multi-select: drift each selected frame in its own concept, single round-trip refresh
      if (multiSelected.size > 1) {
        const items: { conceptId: string; versionId: string }[] = [];
        for (const key of multiSelected) {
          const [cid, vid] = key.split(':');
          if (cid && vid) items.push({ conceptId: cid, versionId: vid });
        }
        flash.showDriftFlash('DRIFTED');
        let ok = 0;
        for (const { conceptId, versionId } of items) {
          const res = await fetch('/api/iterate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client, project, conceptId, versionId, roundId: activeRoundId }),
          });
          if (res.ok) ok++;
        }
        await mutate();
        toast(
          ok === items.length ? `Drifted ${ok} frames` : `Drifted ${ok}/${items.length} frames`,
          ok === items.length ? undefined : 'error',
        );
        return;
      }

      // Single drift
      if (viewMode === 'frame') autoEnableAnnotationRef.current = true;
      await mutations.handleDriftVersion(currentConcept.id, currentVersion.id);
    };
  }, [currentConcept, currentVersion, mutations.handleDriftVersion, shareToken, handleDemoDrift, viewMode, multiSelected, client, project, mutate, flash, activeRoundId]);

  const handleBranch = useMemo(() => {
    if (!currentConcept || !currentVersion) return undefined;
    if (shareToken) return handleDemoBranch;
    return async () => {
      canvasRef.current?.suppressNextPan();
      if (viewMode === 'frame') autoEnableAnnotationRef.current = true;
      await mutations.handleBranchVersion(currentConcept.id, currentVersion.id);
    };
  }, [currentConcept, currentVersion, mutations.handleBranchVersion, shareToken, handleDemoBranch, viewMode]);

  // After drift from frame view, auto-enable annotation mode on the new slot
  useEffect(() => {
    if (!autoEnableAnnotationRef.current) return;
    if (viewMode !== 'frame') return;
    if (!isAwaitingFirstPrompt(currentVersion?.changelog)) return;
    autoEnableAnnotationRef.current = false;
    activeAnnotations.setAnnotationMode(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentVersion, viewMode]);

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
      <div className="h-screen flex flex-col items-center justify-center gap-3" style={{ background: 'var(--background)' }}>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, letterSpacing: '0.24em', color: 'var(--muted)', opacity: 0.4, textTransform: 'lowercase' }}>
          driftgrid
        </div>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--muted)', opacity: 0.3 }}>
          Loading...
        </div>
      </div>
    );
  }

  if (!filtered || !currentConcept || !currentVersion) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--background)' }}>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, letterSpacing: '0.24em', color: 'var(--muted)', opacity: 0.4, textTransform: 'lowercase' }}>
          driftgrid
        </div>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 14, color: 'var(--muted)' }}>
          Project not found
        </div>
        <a href="/" style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--muted)', opacity: 0.5, textDecoration: 'none' }}>
          ← Back to dashboard
        </a>
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

  // Designer floating action bar removed — ShortcutsBar covers all actions via keybindings.
  // These are still used by the client-mode review action bar below (which hosts its own
  // minimal Comment + Back-to-Grid controls, since clients don't have access to shortcuts).
  const actionBarBtn = "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors";
  const actionBarKey = { fontFamily: 'var(--font-mono, monospace)', fontSize: 8, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' } as const;
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

  // Client name prompt — shown when a client visits a share link for the first time
  const namePrompt = shareToken && clientComments.needsName ? (
    <ClientNamePrompt onSubmit={clientComments.setAuthorName} />
  ) : null;

  // --- GRID VIEW ---
  if (viewMode === 'grid') {
    return (
      <div className="h-screen flex flex-col bg-[var(--background)]">
        {namePrompt}
        <SharePanel open={sharePanelOpen} onClose={() => setSharePanelOpen(false)} client={client} project={project} roundId={activeRoundId} roundNumber={activeRound?.number ?? null} />
        {driftOverlay}
        {deleteOverlay}
        {deleteDialog}
        {!isWalkthrough && (
          <TourOverlay
            step={tour.currentStep}
            stepIndex={tour.step}
            totalSteps={tour.totalSteps}
            onDismiss={tour.dismiss}
            onNext={tour.next}
          />
        )}
        {/* Top-left: home + project name */}
        <div className="fixed top-4 left-4 z-30 flex items-center gap-3" style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)' }}>
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
        {/* Top-right: round switcher + share */}
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
          {/* Present button — fullscreen slideshow of starred versions */}
          {mode !== 'client' && selections.size > 0 && (
            <button
              onClick={() => presentation.handlePresent()}
              className="flex items-center gap-1.5 transition-all"
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.06em',
                color: 'var(--foreground)',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                opacity: 0.5,
                padding: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.9'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
              title="Present starred versions fullscreen (P)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="6 4 20 12 6 20 6 4" />
              </svg>
              Present
            </button>
          )}
          {/* Share button — designer mode only */}
          {mode !== 'client' && !shareToken && (
            <button
              onClick={() => setSharePanelOpen(true)}
              className="flex items-center gap-1.5 transition-all"
              style={{
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: '0.06em',
                color: 'var(--foreground)',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
                opacity: 0.5,
                padding: 0,
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.9'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.5'; }}
              title="Share with clients"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" /><polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              Share
            </button>
          )}
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
            unreadKeys={unreadKeys}
            zoomLevel={zoomLevel}
            onZoomLevelChange={setZoomLevel}
            showHidden={showHidden}
            initialCardBounds={transitionCardBounds}
          />
        </div>
        {mode === 'client' ? (
          !ui.navGridHidden && (
            <div
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-3 py-2 rounded-full"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}
            >
              <span style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontSize: 10, color: 'rgba(255,255,255,0.4)', padding: '0 4px' }}>
                Click a card to review
              </span>
              <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.12)' }} />
              <button
                onClick={() => ui.setNavGridHidden(v => !v)}
                title="Hide (H)"
                style={{
                  background: 'none', border: 'none', padding: '0 4px', cursor: 'pointer',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  fontSize: 10, color: 'rgba(255,255,255,0.55)', letterSpacing: '0.04em',
                }}
              >
                <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>H</span>{' '}
                <span>Hide</span>
              </button>
            </div>
          )
        ) : (
          multiSelectBar
        )}
        {mode !== 'client' && (
          <ShortcutsBar
            visible={ui.shortcutsVisible && !ui.navGridHidden}
            mode={mode}
            onToggle={() => {
              if (ui.navGridHidden) {
                ui.setNavGridHidden(false);
                ui.setShortcutsVisible(true);
              } else {
                ui.setShortcutsVisible(v => !v);
              }
            }}
          />
        )}
        {/* Client-mode: tiny ? pill to unhide when H has hidden everything */}
        {mode === 'client' && ui.navGridHidden && (
          <button
            type="button"
            onClick={() => ui.setNavGridHidden(false)}
            title="Show shortcuts"
            style={{
              position: 'fixed', left: 14, bottom: 14, zIndex: 40,
              width: 22, height: 22, borderRadius: 999,
              background: 'transparent', border: 'none',
              color: 'var(--foreground)',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 11, fontWeight: 500,
              cursor: 'pointer', opacity: 0.25,
            }}
          >?</button>
        )}
        {commandPalette}
        <ToastContainer />
      </div>
    );
  }

  // --- FRAME VIEW ---
  return (
    <div className="h-screen flex flex-col" style={{ background: mode === 'client' ? '#fff' : 'var(--background)' }}>
      {namePrompt}
      {driftOverlay}
      {deleteOverlay}
      {deleteDialog}
      {!isWalkthrough && (
        <TourOverlay
          step={tour.currentStep}
          stepIndex={tour.step}
          totalSteps={tour.totalSteps}
          onDismiss={tour.dismiss}
          onNext={tour.next}
        />
      )}
      <div ref={frameWrapperRef} className="flex-1 min-h-0 relative">
        {/* Canvas context label — designer mode only, responsive + locked canvases both show it. */}
        {mode !== 'client' && currentConcept && currentVersion && (
          <div
            className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1 rounded-full pointer-events-none"
            style={{
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 10,
              letterSpacing: '0.08em',
              color: 'rgba(255,255,255,0.55)',
              textTransform: 'uppercase',
            }}
          >
            <span>{resolved.label}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.75)' }}>{currentConcept.label}</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>v{currentVersion.number}</span>
          </div>
        )}
        <div
          className={`h-full relative ${resolved.height === 'auto' ? '' : 'p-4'}`}
          style={{ background: mode === 'client' ? '#fff' : (resolved.height === 'auto' ? 'transparent' : 'var(--canvas)') }}
        >
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
              onIframeRef={setFrameIframeEl}
            />
          )}
          <AnnotationOverlay
            annotations={activeAnnotations.annotations}
            annotationMode={activeAnnotations.annotationMode}
            viewMode={mode === 'client' ? 'client' : 'designer'}
            currentAuthor={mode === 'client' ? clientComments.authorName : undefined}
            isAdmin={mode === 'client' ? clientComments.isAdmin : false}
            onAdd={activeAnnotations.handleAddAnnotation}
            onDelete={activeAnnotations.handleDeleteAnnotation}
            onResolve={activeAnnotations.handleResolveAnnotation}
            onEdit={activeAnnotations.handleEditAnnotation}
            onReply={activeAnnotations.handleReplyAnnotation}
            frameContext={currentConcept && currentVersion ? {
              client,
              project,
              conceptId: currentConcept.id,
              versionId: currentVersion.id,
              conceptLabel: currentConcept.label,
              versionNumber: currentVersion.number,
              filePath: `~/driftgrid/projects/${client}/${project}/${currentVersion.file}`,
            } : undefined}
            scrollable={resolved.height === 'auto'}
            iframeEl={frameIframeEl}
          />
        </div>
        {/* Branding */}
        <div
          className="fixed bottom-3 left-3 z-10 pointer-events-none"
          style={{ fontSize: 9, fontFamily: 'var(--font-mono, monospace)', color: 'var(--foreground)', opacity: 0.1, letterSpacing: '0.06em' }}
        >
          DriftGrid
        </div>
        {/* Designer frame floating action bar removed — shortcuts card handles all actions. */}
        {/* Client review action bar — comment + back to grid + hide */}
        {mode === 'client' && !ui.navGridHidden && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1 px-2 py-1.5 rounded-full"
            style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}
          >
            <button onClick={() => activeAnnotations.setAnnotationMode(v => !v)} className={actionBarBtn} title="Add comment (C)" style={{ opacity: activeAnnotations.annotationMode ? 1 : undefined }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={activeAnnotations.annotationMode ? 'white' : 'none'} stroke="white" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span style={actionBarKey}>C</span>
            </button>
            <button onClick={() => { setViewMode('grid'); }} className={actionBarBtn} title="Back to grid (G)">
              {gridIcon}
              <span style={actionBarKey}>G</span>
            </button>
            <button
              onClick={() => ui.setNavGridHidden(v => !v)}
              className={actionBarBtn}
              title="Hide (H)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
                <line x1="4" y1="20" x2="20" y2="4" />
              </svg>
              <span style={actionBarKey}>H</span>
            </button>
            <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.12)' }} />
            <span style={{ fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontSize: 10, color: 'rgba(255,255,255,0.35)', padding: '0 4px' }}>
              {currentConcept.label} · v{currentVersion.number}
            </span>
          </div>
        )}
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
          mode={mode}
          onNavigate={handleNavigate}
        />
      )}
      {mode !== 'client' && (
        <ShortcutsBar
          visible={ui.shortcutsVisible && !ui.navGridHidden}
          mode={mode}
          onToggle={() => {
            if (ui.navGridHidden) {
              ui.setNavGridHidden(false);
              ui.setShortcutsVisible(true);
            } else {
              ui.setShortcutsVisible(v => !v);
            }
          }}
        />
      )}
      {/* Client-mode: tiny ? pill to unhide when H has hidden everything */}
      {mode === 'client' && ui.navGridHidden && (
        <button
          type="button"
          onClick={() => ui.setNavGridHidden(false)}
          title="Show controls"
          style={{
            position: 'fixed', left: 14, bottom: 14, zIndex: 40,
            width: 22, height: 22, borderRadius: 999,
            background: 'transparent', border: 'none',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontSize: 11, fontWeight: 500,
            cursor: 'pointer', opacity: 0.25,
          }}
        >?</button>
      )}
      {commandPalette}
      <ToastContainer />
    </div>
  );
}
