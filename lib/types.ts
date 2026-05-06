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

export type ProjectOutput = 'vector' | 'image' | 'hybrid';

export interface ProjectMeta {
  name: string;
  slug: string;
  client: string;
  canvas: string;
  created: string;
  links: ProjectLinks;
  /**
   * What the agent should produce on this project.
   * - 'vector' (default): HTML/CSS/SVG. Editable, exportable. Any agent.
   * - 'image':  raster output (PNG). Each version is a fresh image-gen sample.
   *             Requires an image-capable model (OpenAI gpt-image, Gemini Imagen,
   *             etc.) — Claude/Codex's text models can't produce images.
   * - 'hybrid': HTML canvas with <img> slots. Image-gen for visual blocks,
   *             HTML for layout/typography. Best for rapid iteration when
   *             only some regions of a frame need regenerating.
   *
   * Undefined is treated as 'vector' for backward compatibility.
   */
  output?: ProjectOutput;
  /**
   * Supabase auth.users.id of the project owner. Present on cloud projects
   * (Pro tier), undefined on local-only projects (Free tier). Used to scope
   * Supabase Storage paths as {userId}/{client}/{project}/... and to enforce
   * row-level security on comments and share links.
   */
  userId?: string;
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
  /**
   * Optional state flag for whole-version drift prompts. When set to 'running',
   * the drift slot displays the in-progress template (pulsing grid).
   * Set by the MCP server when it picks up a prompt, or manually via the dev button.
   */
  status?: 'running';
  /**
   * ISO timestamp of the last time the designer pressed "Copy for Agent" on this
   * thread. Only meaningful on top-level annotations. Used by the comments hub to
   * distinguish "open" (designer wrote a message but hasn't copied it to the
   * agent yet) from "awaiting reply" (copied, waiting on the agent).
   */
  submittedAt?: string;
  /**
   * Optional file paths attached to the annotation (e.g. screenshots saved at
   * Copy-for-Agent time). Stored as absolute paths so the Copy-for-Agent payload
   * can reference them and the agent can read them with its file tool.
   */
  attachments?: string[];
  /**
   * Optional target provider for routing. Values: 'claude' | 'codex' | 'gemini'.
   * Undefined = any agent may pick it up. Set by the designer in the comment input.
   */
  provider?: string;
}

export interface Round {
  id: string;
  number: number;
  name: string;
  createdAt: string;
  closedAt?: string;
  note?: string;
  selects: { conceptId: string; versionId: string }[];
  concepts: Concept[];
}

export interface Concept {
  id: string;
  slug?: string;
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

/** A comment left by an anonymous client on a shared project (stored in Supabase) */
export interface ClientComment {
  id: string;
  share_token: string;
  concept_id: string;
  version_id: string;
  author_name: string;
  body: string;
  x_rel: number | null;
  y_rel: number | null;
  element_selector: string | null;
  parent_comment_id: string | null;
  status: 'open' | 'resolved';
  created_at: string;
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
  concepts: Concept[];  // convenience alias — always points to the active round's concepts
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
  /** ISO timestamp of the most recent version or annotation in the manifest. Null if neither exists. */
  lastEditedAt: string | null;
}

