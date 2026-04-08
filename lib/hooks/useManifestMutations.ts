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
  activeRoundId: string | null;
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
  currentConcept, currentVersion, activeRoundId,
  undo, flash, viewMode, setViewMode, setZoomLevel,
}: MutationDeps) {

  // Helper: get the active round's concepts (source of truth when rounds exist)
  const getActiveConcepts = useCallback(() => {
    if (!manifest) return [];
    if (activeRoundId && manifest.rounds?.length) {
      const round = manifest.rounds.find(r => r.id === activeRoundId) || manifest.rounds[manifest.rounds.length - 1];
      return round?.concepts ?? [];
    }
    return manifest.concepts ?? [];
  }, [manifest, activeRoundId]);

  // Helper: produce updated manifest with new concepts applied to the active round
  const withUpdatedConcepts = useCallback((newConcepts: Concept[]): Manifest => {
    if (!manifest) throw new Error('No manifest');
    if (activeRoundId && manifest.rounds?.length) {
      return {
        ...manifest,
        rounds: manifest.rounds.map(r =>
          r.id === activeRoundId ? { ...r, concepts: newConcepts } : r
        ),
        concepts: newConcepts, // keep alias in sync
      };
    }
    return { ...manifest, concepts: newConcepts };
  }, [manifest, activeRoundId]);

  const handleDeleteVersion = useCallback(async (conceptId: string, versionId: string) => {
    if (!manifest) return;
    const concepts = getActiveConcepts();
    const newConcepts = concepts.map(c => {
      if (c.id !== conceptId) return c;
      return { ...c, versions: c.versions.filter(v => v.id !== versionId) };
    }).filter(c => c.versions.length > 0);
    const updated = withUpdatedConcepts(newConcepts);
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    const clampedCi = Math.min(conceptIndex, Math.max(0, newConcepts.length - 1));
    if (clampedCi !== conceptIndex) {
      setConceptIndex(clampedCi);
    }
    const newVersionCount = newConcepts[clampedCi]?.versions.length ?? 0;
    if (versionIndex >= newVersionCount) {
      setVersionIndex(Math.max(0, newVersionCount - 1));
    }
    mutate(updated);
  }, [manifest, client, project, conceptIndex, versionIndex, mutate, setConceptIndex, setVersionIndex, getActiveConcepts, withUpdatedConcepts]);

  const handleHideVersion = useCallback(async (conceptId: string, versionId: string) => {
    if (!manifest) return;
    const concepts = getActiveConcepts();
    const newConcepts = concepts.map(c => {
      if (c.id !== conceptId) return c;
      return {
        ...c,
        versions: c.versions.map(v =>
          v.id === versionId ? { ...v, visible: false } : v
        ),
      };
    });
    const updated = withUpdatedConcepts(newConcepts);
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    mutate(updated);
    toast('Version hidden');
  }, [manifest, client, project, mutate, getActiveConcepts, withUpdatedConcepts]);

  const executeDelete = useCallback(async () => {
    if (!manifest || !currentConcept || !currentVersion) return;

    undo.trackDelete({
      conceptId: currentConcept.id,
      versionId: currentVersion.id,
      version: currentVersion,
      conceptIndex,
    });

    flash.showDeleteFlash();

    const concepts = getActiveConcepts();
    const newConcepts = concepts.map(c => {
      if (c.id !== currentConcept.id) return c;
      return { ...c, versions: c.versions.filter(v => v.id !== currentVersion.id) };
    }).filter(c => c.versions.length > 0);
    const updated = withUpdatedConcepts(newConcepts);

    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });

    await new Promise(r => setTimeout(r, 400));

    const ci = Math.min(conceptIndex, newConcepts.length - 1);
    if (newConcepts.length === 0) {
      setViewMode('grid');
      mutate(updated);
      return;
    }
    const newCount = newConcepts[ci]?.versions.length ?? 0;
    const newVi = Math.min(versionIndex, Math.max(0, newCount - 1));
    setConceptIndex(ci);
    setVersionIndex(newVi);
    mutate(updated);
  }, [manifest, currentConcept, currentVersion, conceptIndex, versionIndex, client, project, mutate, undo, flash, setConceptIndex, setVersionIndex, setViewMode, getActiveConcepts, withUpdatedConcepts]);

  const handleMoveConceptLeft = useCallback(async (targetCi?: number) => {
    const concepts = getActiveConcepts();
    const ci = targetCi ?? conceptIndex;
    if (!manifest || ci <= 0) return;
    const newConcepts = [...concepts];
    const temp = newConcepts[ci];
    newConcepts[ci] = newConcepts[ci - 1];
    newConcepts[ci - 1] = temp;
    const updated = withUpdatedConcepts(newConcepts.map((c, i) => ({ ...c, position: i + 1 })));
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setConceptIndex(ci - 1);
    mutate(updated);
  }, [manifest, conceptIndex, client, project, mutate, setConceptIndex, getActiveConcepts, withUpdatedConcepts]);

  const handleMoveConceptRight = useCallback(async (targetCi?: number) => {
    const concepts = getActiveConcepts();
    const ci = targetCi ?? conceptIndex;
    if (!manifest || ci >= concepts.length - 1) return;
    const newConcepts = [...concepts];
    const temp = newConcepts[ci];
    newConcepts[ci] = newConcepts[ci + 1];
    newConcepts[ci + 1] = temp;
    const updated = withUpdatedConcepts(newConcepts.map((c, i) => ({ ...c, position: i + 1 })));
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setConceptIndex(ci + 1);
    mutate(updated);
  }, [manifest, conceptIndex, client, project, mutate, setConceptIndex, getActiveConcepts, withUpdatedConcepts]);

  const handleReorderVersions = useCallback(async (conceptId: string, newVersionIds: string[]) => {
    if (!manifest) return;
    const concepts = getActiveConcepts();
    const newConcepts = concepts.map(c => {
      if (c.id !== conceptId) return c;
      const versionMap = new Map(c.versions.map(v => [v.id, v]));
      const reordered = newVersionIds
        .map(id => versionMap.get(id))
        .filter((v): v is NonNullable<typeof v> => !!v);
      return { ...c, versions: reordered };
    });
    const updated = withUpdatedConcepts(newConcepts);
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    mutate(updated);
  }, [manifest, client, project, mutate, getActiveConcepts, withUpdatedConcepts]);

  const handleReorderConcepts = useCallback(async (newOrder: string[]) => {
    if (!manifest) return;
    const concepts = getActiveConcepts();
    const conceptMap = new Map(concepts.map(c => [c.id, c]));
    const reordered = newOrder
      .map(id => conceptMap.get(id))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c, i) => ({ ...c, position: i + 1 }));
    const updated = withUpdatedConcepts(reordered);
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    mutate(updated);
  }, [manifest, client, project, mutate, getActiveConcepts, withUpdatedConcepts]);

  const handleMoveCardBetweenColumns = useCallback(async (
    fromConceptIndex: number,
    versionIndex: number,
    toConceptIndex: number,
  ) => {
    if (!manifest) return;
    const concepts = getActiveConcepts();
    if (toConceptIndex < 0 || toConceptIndex >= concepts.length) return;
    const fromConcept = concepts[fromConceptIndex];
    const toConcept = concepts[toConceptIndex];
    const fromVersion = fromConcept?.versions[versionIndex];
    if (!fromConcept || !toConcept || !fromVersion) return;

    // Swap with the card at the same row in the adjacent column
    const targetVi = Math.min(versionIndex, toConcept.versions.length - 1);
    const toVersion = toConcept.versions[targetVi];
    if (!toVersion) return; // no card to swap with

    const newConcepts = concepts.map((c, i) => {
      if (i === fromConceptIndex) {
        const newVersions = [...c.versions];
        newVersions[versionIndex] = toVersion;
        return { ...c, versions: newVersions };
      }
      if (i === toConceptIndex) {
        const newVersions = [...c.versions];
        newVersions[targetVi] = fromVersion;
        return { ...c, versions: newVersions };
      }
      return c;
    });
    const updated = withUpdatedConcepts(newConcepts);
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    setConceptIndex(toConceptIndex);
    setVersionIndex(targetVi);
    mutate(updated);
  }, [manifest, client, project, mutate, setConceptIndex, setVersionIndex, getActiveConcepts, withUpdatedConcepts]);

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

  const handleInsertConcept = useCallback(async (label: string, afterConceptIndex?: number) => {
    if (!manifest) return;
    const concepts = getActiveConcepts();

    const slug = label
      .replace(/^\d+\s*[—–\-]\s*/, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const id = `concept-${slug}-${Date.now().toString(36)}`;

    const newConcept: Concept = {
      id,
      slug,
      label,
      description: '',
      position: 0,
      visible: true,
      versions: [{
        id: 'v1',
        number: 1,
        file: `${slug}/v1.html`,
        parentId: null,
        changelog: 'New concept',
        visible: true,
        starred: false,
        created: new Date().toISOString(),
        thumbnail: '',
      } as Version],
    };

    const newConcepts = [...concepts];
    const insertAt = afterConceptIndex !== undefined ? afterConceptIndex + 1 : concepts.length;
    newConcepts.splice(insertAt, 0, newConcept);
    // Renumber positions
    newConcepts.forEach((c, i) => { c.position = i + 1; });

    const updated = withUpdatedConcepts(newConcepts);

    // Create placeholder HTML file and save manifest in parallel
    const placeholderHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${label}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100vh; overflow: hidden; }
        body { font-family: system-ui, -apple-system, sans-serif; -webkit-font-smoothing: antialiased; }
    </style>
</head>
<body>
</body>
</html>`;

    await Promise.all([
      fetch(`/api/manifest/${client}/${project}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }),
      fetch(`/api/html/${client}/${project}/${slug}/v1.html`, {
        method: 'PUT',
        body: placeholderHtml,
      }),
    ]);

    setConceptIndex(insertAt);
    setVersionIndex(0);
    mutate(updated);
    toast(`Inserted "${label}"`);
  }, [manifest, client, project, mutate, setConceptIndex, setVersionIndex, getActiveConcepts, withUpdatedConcepts]);

  const handleRenameConcept = useCallback(async (conceptId: string, newLabel: string) => {
    if (!manifest || !newLabel.trim()) return;
    const concepts = getActiveConcepts();
    const newConcepts = concepts.map(c =>
      c.id === conceptId ? { ...c, label: newLabel.trim() } : c
    );
    const updated = withUpdatedConcepts(newConcepts);
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    mutate(updated);
  }, [manifest, client, project, mutate, getActiveConcepts, withUpdatedConcepts]);

  const handleDeleteConcept = useCallback(async (conceptId: string) => {
    if (!manifest) return;
    const concepts = getActiveConcepts();
    const concept = concepts.find(c => c.id === conceptId);
    if (!concept) return;
    const versionCount = concept.versions.length;
    const confirmed = window.confirm(
      `Delete "${concept.label}" and all ${versionCount} version${versionCount === 1 ? '' : 's'}?`
    );
    if (!confirmed) return;

    const newConcepts = concepts.filter(c => c.id !== conceptId);
    const updated = withUpdatedConcepts(newConcepts);
    await fetch(`/api/manifest/${client}/${project}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
    const ci = Math.min(conceptIndex, Math.max(0, newConcepts.length - 1));
    setConceptIndex(ci);
    setVersionIndex(0);
    mutate(updated);
    toast(`Deleted "${concept.label}"`);
  }, [manifest, client, project, conceptIndex, mutate, setConceptIndex, setVersionIndex, getActiveConcepts, withUpdatedConcepts]);

  return {
    handleDeleteVersion,
    handleHideVersion,
    executeDelete,
    handleDeleteConcept,
    handleRenameConcept,
    handleInsertConcept,
    handleMoveConceptLeft,
    handleMoveConceptRight,
    handleReorderVersions,
    handleReorderConcepts,
    handleMoveCardBetweenColumns,
    handleDriftVersion,
    handleBranchVersion,
  };
}
