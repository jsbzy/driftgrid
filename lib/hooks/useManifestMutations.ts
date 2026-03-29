'use client';

import { useCallback } from 'react';
import type { Manifest, Concept, Version } from '@/lib/types';
import type { ZoomLevel } from '@/lib/hooks/useKeyboardNav';
import { toast } from '@/components/Toast';
import type { KeyedMutator } from 'swr';

interface MutationDeps {
  manifest: Manifest | undefined;
  client: string;
  project: string;
  mutate: KeyedMutator<Manifest>;
  conceptIndex: number;
  versionIndex: number;
  setConceptIndex: (ci: number) => void;
  setVersionIndex: (vi: number) => void;
  currentConcept: Concept | undefined;
  currentVersion: Version | undefined;
  undo: {
    trackDelete: (args: { conceptId: string; versionId: string; version: Version; conceptIndex: number }) => void;
    trackDrift: (args: { conceptId: string; versionId: string }) => void;
  };
  flash: {
    showDriftFlash: (label: string) => void;
    hideDriftFlash: () => void;
    showDeleteFlash: () => void;
  };
  viewMode: 'frame' | 'grid';
  setViewMode: (mode: 'frame' | 'grid') => void;
  setZoomLevel: (level: ZoomLevel) => void;
}

/**
 * All manifest-mutating operations: delete, hide, move, reorder, drift, branch.
 */
export function useManifestMutations({
  manifest, client, project, mutate,
  conceptIndex, versionIndex, setConceptIndex, setVersionIndex,
  currentConcept, currentVersion,
  undo, flash, viewMode, setViewMode, setZoomLevel,
}: MutationDeps) {

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
  }, [manifest, client, project, conceptIndex, versionIndex, mutate, setConceptIndex, setVersionIndex]);

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
  }, [manifest, currentConcept, currentVersion, conceptIndex, versionIndex, client, project, mutate, undo, flash, setConceptIndex, setVersionIndex, setViewMode]);

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
  }, [manifest, conceptIndex, client, project, mutate, setConceptIndex]);

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
  }, [manifest, conceptIndex, client, project, mutate, setConceptIndex]);

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
  }, [manifest, client, project, mutate, setConceptIndex, setVersionIndex]);

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
  }, [client, project, mutate, undo, flash, setConceptIndex, setVersionIndex]);

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
  }, [client, project, mutate, viewMode, flash, setConceptIndex, setVersionIndex, setViewMode, setZoomLevel]);

  const handleDeleteConcept = useCallback(async (conceptId: string) => {
    if (!manifest) return;
    const concept = manifest.concepts.find(c => c.id === conceptId);
    if (!concept) return;
    const versionCount = concept.versions.length;
    const confirmed = window.confirm(
      `Delete "${concept.label}" and all ${versionCount} version${versionCount === 1 ? '' : 's'}?`
    );
    if (!confirmed) return;

    const updated: Manifest = {
      ...manifest,
      concepts: manifest.concepts.filter(c => c.id !== conceptId),
    };
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    const ci = Math.min(conceptIndex, Math.max(0, updated.concepts.length - 1));
    setConceptIndex(ci);
    setVersionIndex(0);
    mutate(updated);
    toast(`Deleted "${concept.label}"`);
  }, [manifest, client, project, conceptIndex, mutate, setConceptIndex, setVersionIndex]);

  return {
    handleDeleteVersion,
    handleHideVersion,
    executeDelete,
    handleDeleteConcept,
    handleMoveConceptLeft,
    handleMoveConceptRight,
    handleReorderConcepts,
    handleDriftVersion,
    handleBranchVersion,
  };
}
