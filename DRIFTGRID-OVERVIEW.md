# DriftGrid -- How It Works

## What It Is

DriftGrid is a local-first design iteration platform. Designers and AI agents create HTML-based designs (websites, slides, apps, one-pagers), version them in a visual grid, and share them with clients for review. Think Figma's version history meets a kanban board, but every "card" is a self-contained HTML file that an agent wrote.

The core loop: **design > drift (iterate) > compare > share > collect feedback > repeat.**

## Architecture

- **Next.js 14** (App Router) on **Vercel** (driftgrid.ai)
- **Supabase** (Postgres + Auth + Storage) for cloud features (sharing, comments, user accounts)
- **Stripe** for Pro tier billing
- **Local-first**: the dev server runs on localhost:3000. All project files live on disk. Cloud is opt-in (push-on-share).

### Repo layout

```
~/driftgrid/
├── app/                    # Next.js routes (app router)
│   ├── api/                # All API endpoints
│   ├── admin/[client]/     # Designer view (localhost)
│   ├── s/[...parts]/       # Public share pages (driftgrid.ai/s/...)
│   ├── login/              # Auth pages
│   └── page.tsx            # Landing / dashboard
├── components/             # React components (Viewer, GridView, AnnotationOverlay, etc.)
├── lib/                    # Shared utils, types, hooks, Supabase client
├── mcp/                    # MCP server (stdio) -- exposes tools for agents
├── bin/                    # CLI scripts (init, dev wrapper, smoke tests, image gen)
├── scripts/                # Build/ops (PDF/PNG export, thumbnails)
├── projects/               # All design project files live here
│   └── {client-slug}/
│       ├── brand/          # Brand guidelines, logos, assets
│       └── {project-slug}/
│           ├── manifest.json
│           └── concept-{name}/
│               ├── v1.html
│               ├── v2.html
│               └── round-2/v1.html  (if rounds enabled)
└── tests/                  # Unit tests + smoke test docs
```

## Core Concepts

### Grid Model

The grid is a 2D layout:
- **Columns = Concepts** (design directions). Named descriptively: "Bold Minimal", "Dark Editorial", etc.
- **Rows = Versions** (iterations within a direction). Auto-numbered: v1, v2, v3...
- **Rounds** (optional) = pages/phases. Like Figma pages. Each round has its own set of concepts/versions. Used for multi-phase projects (Round 1 = initial directions, Round 2 = refinements from client feedback).

### manifest.json

Every project has a `manifest.json` that defines its structure. This is the source of truth for the grid.

```
{
  "project": { name, slug, client, canvas, output, created, links },
  "concepts": [
    {
      "id": "concept-bold",
      "label": "Bold Minimal",
      "position": 0,
      "visible": true,
      "versions": [
        { "id": "v1", "number": 1, "file": "concept-bold/v1.html", "changelog": "Initial direction", "starred": false, "annotations": [...] },
        { "id": "v2", "number": 2, "file": "concept-bold/v2.html", "changelog": "Larger hero", "starred": true }
      ]
    }
  ],
  "rounds": [...],        // optional, for multi-round projects
  "workingSets": [...],   // named selections of versions
  "stars": ["concept-bold:v2"]  // starred (favorited) versions
}
```

**Rounds footgun:** When rounds are enabled, concepts live inside `manifest.rounds[N].concepts[]`. The top-level `manifest.concepts` becomes a stale alias. Any code that reads `manifest.concepts` directly on a rounds project gets an empty array.

### Design Files

Every version is a **self-contained HTML file**. No external dependencies except Google Fonts via `<link>` tags. CSS and JS are inlined. This makes them exportable as standalone files, PDFs, or PNGs.

Canvas presets control dimensions:
- `desktop` (1440px wide, scrollable)
- `mobile` (375px, scrollable)
- `landscape-16-9` (1920x1080, locked -- for slides/decks)
- `a4-portrait` (794x1123, locked -- for documents)
- `tablet` (768px, scrollable)

### Output Types

- `vector` (default): HTML/CSS/SVG. Any agent can produce these.
- `image`: PNG files. Requires an image-capable model (OpenAI gpt-image, Gemini).
- `hybrid`: HTML with `<img>` slots that get regenerated. Layout is HTML, imagery is raster.

## Key Workflows

### Iterating (Drifting)

"Drift" = create a new version. Two directions:
- **Drift up** (D key): copy current version to v(N+1) in the same concept, apply changes. Used for iteration.
- **Drift right** (Shift+D): create a new concept column. Used for exploring a new direction.

Never overwrite existing versions. Always create new ones.

### Annotations & Prompts

Annotations are pinned comments on a design frame. Two types:
- **Designer prompts** (author: "designer"): instructions for an agent to apply
- **Client comments** (isClient: true): feedback from client review. Designers decide what to act on.

The "Copy for Agent" button saves the prompt and copies a formatted payload to clipboard, ready to paste into Claude/Codex/Gemini.

Annotations support threading (parentId), resolving, and provider routing (route a prompt to a specific agent).

### Sharing

1. Designer clicks Share in the grid
2. If first time: authenticates with driftgrid.ai via popup
3. Project files push to Supabase Storage
4. A public share link is generated: `driftgrid.ai/s/{client}/{token}#{concept}/v{N}`
5. Clients browse, navigate with arrows, and leave comments (no account needed)
6. Client comments are stored in Supabase (`client_comments` table)
7. Email notifications sent to the project owner on new comments

### Multi-Agent Support

DriftGrid is provider-agnostic. Multiple AI agents can work on the same project:
- Each prompt can be routed to a specific provider via the `provider` field
- Agents identify themselves when replying (`author: "claude"`, `author: "codex"`, etc.)
- An MCP server (`mcp/server.ts`) exposes tools: `get_feedback`, `add_feedback`, `create_version`, `branch_concept`, `create_project`, `close_round`, etc.

## API Endpoints (localhost:3000)

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/current` | GET | What the user is currently viewing |
| `/api/iterate` | POST | Create a new version (drift up) |
| `/api/branch` | POST | Fork into a new concept (drift right) |
| `/api/create-project` | POST | Create a new project |
| `/api/html/{client}/{project}/{path}` | GET/PUT | Read/write design HTML files |
| `/api/manifest?client=X&project=Y` | GET/PUT | Read/write manifest.json |
| `/api/annotations` | GET/POST/PATCH/DELETE | CRUD for annotations/prompts |
| `/api/annotations/all` | GET | All annotations across a project |
| `/api/rounds` | POST | Close/create/copy rounds |
| `/api/paste` | POST | Copy a version into a target concept |
| `/api/share` | POST | Generate a share link |
| `/api/s/[token]/comments` | GET/POST/DELETE | Client comments on shared projects |
| `/api/export` | POST | Export HTML/PDF/PPTX |
| `/api/thumbs-generate` | POST | Generate thumbnails |
| `/api/watch` | GET (SSE) | File change events |
| `/api/brand/{client}` | GET | Brand guidelines |
| `/api/screenshot` | POST | Capture a frame screenshot |

## Key Components

| Component | What it does |
|-----------|-------------|
| `Viewer.tsx` | Main viewer -- manages frame display, annotation handlers, share mode overrides |
| `GridView.tsx` | The card grid -- keyboard navigation, drag/reorder, multi-select |
| `AnnotationOverlay.tsx` | Pin-based comment/prompt UI on frames, Copy for Agent flow |
| `HtmlFrame.tsx` | iframe wrapper that renders design HTML files |
| `SharePanel.tsx` | Slide-out panel for sharing (auth, sync, link generation) |
| `CommentsHub.tsx` | Designer-side comments panel (all prompts/threads) |
| `ClientCommentsHub.tsx` | Client-side comments panel on share pages |
| `Dashboard.tsx` | Project list / home page |
| `CanvasView.tsx` | Frame view (single design, zoomed in) |
| `CommandPalette.tsx` | Cmd+K command palette |
| `ExportButton.tsx` | PDF/HTML/PPTX export |

## Key Libraries/Utils

| File | Purpose |
|------|---------|
| `lib/manifest.ts` | Read/write/mutate manifest.json |
| `lib/types.ts` | All TypeScript types (Concept, Version, Annotation, Round, etc.) |
| `lib/hooks/useManifestMutations.ts` | React hooks for manifest mutations (round-aware) |
| `lib/hooks/useClientComments.ts` | Hook for client comment CRUD on share pages |
| `lib/supabase-storage.ts` | Upload/download project files to Supabase Storage |
| `lib/email.ts` | Email notifications for comments |
| `lib/slug.ts` | Slug validation |
| `lib/agent-payload.ts` | Build the "Copy for Agent" clipboard payload |

## Testing

### Smoke Tests (`bin/smoke.ts`, ~1100 lines)

API-level suite with 15 phases. Run against the dev server:

```bash
npm run dev          # terminal 1
npm run smoke        # terminal 2
```

Phases cover: project lifecycle, frame editing, drift, branch, paste, stars, reorder, annotations, rounds, sharing, cloud push, export, SSE watch, delete/undo, Stripe.

Flags: `--phase N` (single phase), `--verbose`, `--no-cleanup`, `SMOKE_INCLUDE_STRIPE=1`.

Regression guards protect against known bugs: path traversal, share dedup, rounds-alias drift/annotations, SSE watcher leak.

### Unit Tests (`tests/`)

- `canvas-layout.test.ts` -- canvas dimension logic
- `filter-manifest.test.ts` -- manifest filtering
- `manifest.test.ts` -- manifest read/write
- `typecheck.test.ts` -- TypeScript compilation check

## Infrastructure

- **Domain:** driftgrid.ai (Vercel production), docs.driftgrid.ai (Nextra docs site)
- **Supabase project:** `ktdksitbxmsnzgeflueg`
- **Stripe:** Pro tier at $10/mo or $96/yr. Free tier = 3 boards, 1 share link.
- **GitHub:** github.com/jsbzy/driftgrid (MIT license)
- **Deploy:** push to `main` auto-deploys via Vercel

## Common Dev Tasks

```bash
# Start dev server
cd /Users/jeffbzy/driftgrid && npm run dev

# Create a new project
node bin/driftgrid.js init "client-name" "project-name" --canvas desktop

# Run smoke tests
npm run smoke

# Generate thumbnails
npm run generate-thumbs

# Export PDF
npm run export-pdf

# TypeScript check
npx tsc --noEmit

# Kill orphan dev server
lsof -ti:3000 | xargs kill -9
```
