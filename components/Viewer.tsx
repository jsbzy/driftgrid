'use client';

import { useState, useCallback, useEffect } from 'react';
import useSWR from 'swr';
import type { Manifest, ViewMode, WorkingSet, WorkingSetSelection } from '@/lib/types';
import { CANVAS_PRESETS } from '@/lib/constants';
import { filterVisibleManifest } from '@/lib/filterManifest';
import { ViewerTopbar } from './ViewerTopbar';
import { HtmlFrame } from './HtmlFrame';
import { NavigationGrid } from './NavigationGrid';
import { GridView } from './GridView';
import { KeyboardShortcuts } from './KeyboardShortcuts';
import { useKeyboardNav } from '@/lib/hooks/useKeyboardNav';

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
  const [gridVisible, setGridVisible] = useState(true);
  const [viewMode, setViewMode] = useState<'fullscreen' | 'grid'>('grid');
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const [activeWorkingSetId, setActiveWorkingSetId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [shortcutsVisible, setShortcutsVisible] = useState(false);

  // ? key to toggle shortcuts panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) return;

      if (e.key === '?') {
        e.preventDefault();
        setShortcutsVisible(v => !v);
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

  const getVersionCount = useCallback(
    (ci: number) => concepts[ci]?.versions.length ?? 0,
    [concepts]
  );

  const handleNavigate = useCallback(
    (ci: number, vi: number) => {
      setConceptIndex(ci);
      setVersionIndex(vi);
    },
    []
  );

  const handleToggleGrid = useCallback(() => {
    setGridVisible(v => !v);
  }, []);

  const handleToggleGridView = useCallback(() => {
    setViewMode(v => v === 'fullscreen' ? 'grid' : 'fullscreen');
  }, []);

  const handleGridSelect = useCallback(
    (ci: number, vi: number) => {
      if (selectMode) {
        const concept = concepts[ci];
        const version = concept?.versions[vi];
        if (!concept || !version) return;
        setSelections(prev => {
          const next = new Map(prev);
          if (next.get(concept.id) === version.id) {
            next.delete(concept.id);
          } else {
            next.set(concept.id, version.id);
          }
          return next;
        });
        setActiveWorkingSetId(null);
      } else {
        setConceptIndex(ci);
        setVersionIndex(vi);
        setViewMode('fullscreen');
      }
    },
    [selectMode, concepts]
  );

  const handleToggleSelectMode = useCallback(() => {
    setSelectMode(v => !v);
  }, []);

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
  }, []);

  useKeyboardNav({
    conceptIndex,
    versionIndex,
    conceptCount: concepts.length,
    getVersionCount,
    onNavigate: handleNavigate,
    onToggleGrid: handleToggleGrid,
    onToggleGridView: handleToggleGridView,
    onToggleSelect: mode !== 'client' ? handleToggleSelect : undefined,
    viewMode,
    mode,
    client,
  });

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

  const preset = CANVAS_PRESETS[filtered.project.canvas];
  const aspectRatio = preset && typeof preset.width === 'number' && typeof preset.height === 'number'
    ? `${preset.width} / ${preset.height}`
    : '16 / 9';

  const htmlSrc = `/api/html/${client}/${project}/${currentVersion.file}`;

  const clientName = client
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const topbar = (
    <ViewerTopbar
      client={clientName}
      clientSlug={client}
      project={project}
      projectName={filtered.project.name}
      conceptLabel={currentConcept.label}
      versionNumber={currentVersion.number}
      versionId={currentVersion.id}
      gridVisible={gridVisible}
      viewMode={viewMode}
      workingSets={filtered.workingSets}
      canvasLabel={preset?.label}
    />
  );

  if (viewMode === 'grid') {
    return (
      <div className="h-screen flex flex-col bg-[var(--background)]">
        {topbar}
        <div className="flex-1 min-h-0">
          <GridView
            concepts={concepts}
            conceptIndex={conceptIndex}
            versionIndex={versionIndex}
            onSelect={handleGridSelect}
            client={client}
            project={project}
            aspectRatio={aspectRatio}
            selections={selections}
            onToggleSelect={handleToggleSelect}
            workingSets={filtered.workingSets}
            activeWorkingSetId={activeWorkingSetId}
            onSaveWorkingSet={handleSaveWorkingSet}
            onLoadWorkingSet={handleLoadWorkingSet}
            onClearSelections={handleClearSelections}
            selectMode={selectMode}
            onToggleSelectMode={handleToggleSelectMode}
            mode={mode}
          />
        </div>
        <KeyboardShortcuts
          visible={shortcutsVisible}
          onClose={() => setShortcutsVisible(false)}
        />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {topbar}
      <div className="flex-1 min-h-0 p-4">
        <HtmlFrame
            src={htmlSrc}
            canvasWidth={typeof preset?.width === 'number' ? preset.width : undefined}
            canvasHeight={typeof preset?.height === 'number' ? preset.height : undefined}
          />
      </div>
      {gridVisible && (
        <NavigationGrid
          conceptIndex={conceptIndex}
          versionIndex={versionIndex}
          versionCounts={concepts.map(c => c.versions.length)}
        />
      )}
      <KeyboardShortcuts
        visible={shortcutsVisible}
        onClose={() => setShortcutsVisible(false)}
      />
    </div>
  );
}
