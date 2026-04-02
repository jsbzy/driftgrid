# Drift V1 — Complete Feature Plan

## Phase 1: Local Full-Screen Viewer

**Goal:** Run `npm run dev`, see projects, navigate concepts/versions with arrow keys.

| Feature | Status |
|---------|--------|
| Dashboard listing clients and projects (grouped, two-level) | DONE |
| Full-screen HTML viewer with iframe (served via API route) | DONE |
| Arrow key navigation: left/right = concepts, up/down = versions | DONE |
| Top bar: client / project / concept label / version number | DONE |
| CLAUDE.md with full conventions including project initiation flow | DONE |

---

## Phase 2: Grid View & Thumbnails

**Goal:** Zoomed-out 2D grid with auto-generated PNG thumbnails. Toggle between grid and full-screen.

| Feature | Status |
|---------|--------|
| Grid view: concepts as columns, versions as rows, thumbnail PNGs in each cell | DONE |
| Playwright-based thumbnail generation | DONE |
| Toggle: `G` key switches grid ↔ full-screen, `Escape` returns to grid | DONE |
| Click thumbnail to enter full-screen at that position | DONE |
| CLI script for batch thumbnail regeneration (`npm run generate-thumbs`) | DONE |

---

## Phase 3: Client Views

**Goal:** Client-facing review routes with visibility filtering.

| Feature | Status |
|---------|--------|
| Client-facing view: minimal chrome, design is hero, only `visible: true` items | DONE |
| Client dashboard listing projects for a client | DONE |

---

## Phase 4: Working Sets

**Goal:** Curated presentation sets for export.

| Feature | Status |
|---------|--------|
| Named working sets: select which version of each concept to include | DONE |
| Save/load named working sets (persisted to manifest) | DONE |
| `S` key shortcut, multiple saved sets as tabs | DONE |
| Select mode: click cells to toggle selection | DONE |

---

## Phase 5: Export

**Goal:** PDF, PNG, PPTX export from UI and CLI. Multi-page PDF from working sets.

| Feature | Status |
|---------|--------|
| Export button in top bar with dropdown: PDF, PNG, PPTX | DONE |
| Single version → PDF or PNG | DONE |
| Working set → multi-page PDF (one page per concept) | DONE |
| Working set → PPTX (PNG screenshots as slides) | DONE |
| Raw HTML download | DONE |
| CLI: `npx tsx scripts/export-pdf.ts demo getting-started --set round-1` | DONE |
| CLI: `npx tsx scripts/export-png.ts demo getting-started` | DONE |

---

## Phase 6: Polish

| Feature | Status |
|---------|--------|
| Canvas type shown in viewer top bar | DONE |
| Keyboard shortcuts panel (`?` to show) | DONE |
| Dynamic page titles | DONE |
| Brand API (`GET /api/brand/{client}`) | DONE |

---

## V2 Backlog

- Links panel: button + dropdown showing key-value links from manifest
- Brand panel: UI to view guidelines.md, logo, and assets
- Selects UX polish: borders, empty placeholders, Edit/Done placement
- Visibility toggles: eye icon per concept/version in designer mode
- Subdomain routing: `{client}.yourdomain.com/{project}` via middleware
- Drift wordmark in client view
- Comments system: slide-out panel per concept/version
- Editable text: `data-drift-editable` elements in client view
- `?set=round-1` query param for client URLs
- Password protection
- Responsive viewer chrome for tablet
- Figma export via MCP
- Analytics, Slack integration, multi-user / SaaS

---

## Key Decisions

- **Single repo:** app + all project files together
- **Flat JSON manifests** (future: DB for multi-user)
- **Font:** JetBrains Mono for app UI
- **SWR** for client data fetching
- **Brand folder:** `projects/{client}/brand/` with `guidelines.md`, `logo.svg`, `assets/`
- **Export:** UI button + CLI, PDF/PNG via Playwright, PPTX via pptxgenjs, pdf-lib for merge
- **Design-to-production:** clean break — copy HTML to own repo when ready
