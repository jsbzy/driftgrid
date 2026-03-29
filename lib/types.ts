// Drift type definitions

export type ViewMode = 'designer' | 'client';


export interface CanvasPreset {
  slug: string;
  label: string;
  width: number | 'custom';
  height: number | 'auto' | 'custom';
  responsive: boolean;
}

export interface ProjectLinks {
  production?: string;
  figma?: string;
  [key: string]: string | undefined;
}

export interface ProjectMeta {
  name: string;
  slug: string;
  client: string;
  canvas: string;
  created: string;
  links: ProjectLinks;
}

export interface Version {
  id: string;
  number: number;
  file: string;
  parentId: string | null;
  changelog: string;
  visible: boolean;
  starred: boolean;
  created: string;
  thumbnail: string;
  annotations?: Annotation[];
}

export interface Annotation {
  id: string;
  x: number | null;
  y: number | null;
  element: string | null;
  text: string;
  author: string;
  isClient: boolean;
  isAgent: boolean;
  created: string;
  resolved: boolean;
  parentId?: string | null;
}

export interface Round {
  id: string;
  number: number;
  name: string;
  savedAt: string;
  note?: string;
  selects: { conceptId: string; versionId: string }[];
}

export interface Concept {
  id: string;
  label: string;
  description: string;
  position: number;
  visible: boolean;
  branchedFrom?: {
    conceptId: string;
    versionId: string;
  };
  canvas?: string | { type?: string; width?: number; height?: number | 'auto' };
  versions: Version[];
}

export interface WorkingSetSelection {
  conceptId: string;
  versionId: string;
}

export interface WorkingSet {
  id: string;
  name: string;
  selections: WorkingSetSelection[];
  created: string;
}

export interface Comment {
  id: string;
  conceptId: string;
  versionId: string;
  author: string;
  isDesigner: boolean;
  text: string;
  created: string;
  parentCommentId: string | null;
}

export interface ClientEdit {
  versionId: string;
  edits: Record<string, string>;
  author: string;
  created: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface Manifest {
  project: ProjectMeta;
  concepts: Concept[];
  rounds: Round[];
  workingSets: WorkingSet[];
  comments: Comment[];
  clientEdits: ClientEdit[];
}

export interface ClientInfo {
  slug: string;
  name: string;
  projects: ProjectInfo[];
}

export interface ProjectInfo {
  slug: string;
  name: string;
  canvas: string;
  conceptCount: number;
  versionCount: number;
}

