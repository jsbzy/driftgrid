# DriftGrid — Master Build Plan

> This file is the source of truth for the DriftGrid product build. Every new conversation should read this + STATUS.md to understand where we are.

## What DriftGrid Is

Local-first design iteration platform for the AI coding era. BYO AI generates HTML → DriftGrid versions, compares, and presents it. Concepts across, versions down. Drift around the grid until you reach selects.

**Pitch:** "Rapid design iteration with AI — version everything, compare anything, present to clients."

## Core Vocabulary

- **Grid** — the infinite grid workspace
- **Concept** — a design direction (column on the grid)
- **Version** — an iteration within a concept (row within a column)
- **Frame** — a single HTML design file (static, interactive, animated, or video)
- **Selects** — your best picks, ready for presentation/export

## Architecture

- **Local-first** — `npx driftgrid` runs a local server
- **BYO AI** — no built-in AI; your tool (Claude Code, Cursor, etc.) creates the HTML
- **Cloud-optional** — paid tier for sharing, teams, analytics
- **MIT license** — monetize with hosted cloud tier
- **Tech stack:** Next.js 16 + React 19 + Tailwind v4 + TypeScript + SWR + Playwright

## Differentiators

1. Interactive frames (live HTML, not static mockups)
2. 2D grid model (concepts × versions) vs linear versioning
3. BYO AI avoids the "AI wrapper" trap
4. Code-first — every frame is production-ready HTML

---

## Build Phases

### Phase 0: Stabilize & Fix
> Fix the things that break before adding anything new.

- **0.1** Frame sizing reliability — audit presets, fix export dimension bugs
- **0.2** Project setup consistency — `driftgrid init`, manifest validation
- **0.3** Local → production parity — `driftgrid doctor`, deployment docs
- **0.4** Selects UX overhaul — persistent bar, clear visual state, present/export/share
- **0.5** Auto-thumbnails — watch mode, stale detection, lazy generation

### Phase 1: Polish the Grid
> The Grid is the core. It must feel like Figma-quality.

- **1.1** Smooth zoom-to-frame transition (animated, overlay-based)
- **1.2** Minimap (viewport position indicator)
- **1.3** Fit-to-view shortcuts (0, 1, double-click)
- **1.4** Card arrangement & concept headers (persistent labels, drag reorder)
- **1.5** Hot reload (file watcher → auto-refresh grid + iframe)

### Phase 2: Frame Types & Interactive Content
> The moat — no design tool can show live interactive HTML.

- **2.1** Interactive frames (JS execution, freeze/unfreeze in grid)
- **2.2** Video frames (Remotion embed, player controls)
- **2.3** Responsive preview (breakpoint toggle, side-by-side comparison)

### Phase 3: Selects → Present → Export
> The funnel from iteration to decision to delivery.

- **3.1** Presentation mode (slideshow from selects)
- **3.2** Comparison view (side-by-side, overlay diff)
- **3.3** Export improvements (PDF deck, PPTX with notes, HTML bundle)
- **3.4** Share link (paid tier — public URL, analytics)

### Phase 4: Developer Experience & Docs
> Make it easy to adopt, contribute to, and extend.

- **4.1** CLI tool (`npx driftgrid`, init, thumbs, export, doctor)
- **4.2** Documentation (README, getting started, API reference, architecture)
- **4.3** Testing (CI pipeline, Playwright smoke tests, unit tests)
- **4.4** Rename to DriftGrid (package, repo, all references)

### Phase 5: Open-Source Launch
- **5.1** Pre-launch checklist (LICENSE, README, CONTRIBUTING, .gitignore, demo project)
- **5.2** Launch assets (hero GIF, demo video, landing page, PH listing, blog post)
- **5.3** Monetization planning (free self-hosted + paid cloud tier)

---

## Agentic Build Rules

### What Claude does autonomously:
- Fix bugs and TypeScript errors
- Refactor code for clarity
- Add error handling and loading states
- Write tests
- Generate documentation from code
- Self-review via screenshots and TypeScript compilation
- Update STATUS.md with progress

### What requires Jeff's approval:
- Changing the visual design language (colors, fonts, spacing)
- Adding new dependencies
- Modifying the manifest schema (breaking change)
- Making architectural decisions (database, auth, new API routes)
- Anything user-facing that changes the workflow

### Context management:
- If context gets full, Claude tells Jeff to start a new conversation
- New conversations read DRIFTGRID.md + STATUS.md to resume
- Git commits after each sub-task for clean rollback

### Git discipline:
- Descriptive commit messages per sub-task
- Phase checkpoints are tagged commits
- Rollback = `git revert` the specific commit

---

## Key Files

| File | Purpose |
|------|---------|
| `DRIFTGRID.md` | This file — master build plan |
| `STATUS.md` | Progress tracker — what's done, what's next |
| `CLAUDE.md` | Development conventions |
| `components/Viewer.tsx` | Master state machine |
| `components/CanvasView.tsx` | Infinite grid |
| `components/HtmlFrame.tsx` | iframe renderer |
| `lib/hooks/useCanvasTransform.ts` | Pan/zoom |
| `lib/hooks/useCanvasLayout.ts` | Card positions |
| `lib/hooks/useKeyboardNav.ts` | Keyboard shortcuts |
| `lib/manifest.ts` | Manifest file I/O |
| `lib/thumbnails.ts` | Screenshot generation |
| `lib/export-pdf.ts` | PDF export |
| `lib/types.ts` | TypeScript interfaces |
| `lib/constants.ts` | Canvas presets |
