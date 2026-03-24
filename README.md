# DriftGrid

**Rapid design iteration with AI -- version everything, compare anything, present to clients.**

DriftGrid is a local-first design iteration platform built for the AI coding era. Your AI tool (Claude Code, Cursor, etc.) generates HTML designs, and DriftGrid versions, compares, and presents them in a 2D grid: concepts across, versions down. Drift around the grid until you reach your selects.

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Features

- **2D Grid Model** -- concepts as columns, versions as rows
- **Infinite Canvas** -- pan, zoom, and navigate with keyboard shortcuts
- **Live HTML Frames** -- interactive, not static mockups
- **BYO AI** -- no built-in AI; use Claude Code, Cursor, or any tool to create HTML
- **Selects & Presentation** -- star your picks, present as a slideshow
- **Export** -- PDF, PNG, PPTX, and raw HTML
- **Client Review** -- separate view with editable text and comments
- **Auto Thumbnails** -- Playwright-generated screenshots with stale detection
- **Dark Mode** -- toggle between light and dark themes
- **Working Sets** -- save named selections for export or review
- **Brand System** -- per-client brand guidelines, logos, and assets

## Canvas Presets

| Preset | Slug | Width | Height | Behavior |
|--------|------|-------|--------|----------|
| A4 Portrait | `a4-portrait` | 794px | 1123px | locked |
| 16:9 Landscape | `landscape-16-9` | 1920px | 1080px | locked |
| Desktop | `desktop` | 1440px | auto | responsive |
| Tablet | `tablet` | 768px | auto | responsive |
| Mobile | `mobile` | 375px | auto | responsive |
| Freeform | `freeform` | custom | custom | configurable |

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Arrow keys | Navigate concepts (left/right) and versions (up/down) |
| `` ` `` | Zoom to overview |
| `1` | Zoom to column |
| `2` | Zoom to 3 cards |
| `3` | Zoom to 1.5 cards |
| `4` | Zoom to single card |
| `Enter` | Enter focused frame |
| `Escape` | Exit to grid |
| `Space` (hold) | Pan mode |
| `S` | Toggle selects |
| `D` | Drift (duplicate + iterate) |
| `Delete` | Delete current version |
| `Cmd+Z` | Undo last delete |
| `?` | Toggle shortcuts panel |

## Project Structure

```
driftgrid/
+-- app/                    # Next.js app (App Router)
+-- components/             # React components
+-- lib/                    # Utilities, types, hooks
+-- scripts/                # CLI tools
+-- projects/
|   +-- {client}/
|       +-- brand/          # Brand guidelines, logo, assets
|       +-- {project}/
|           +-- manifest.json
|           +-- .thumbs/
|           +-- concept-1/
|           |   +-- v1.html
|           |   +-- v2.html
|           +-- concept-2/
|               +-- v1.html
+-- CLAUDE.md               # Claude Code conventions
+-- DRIFTGRID.md            # Master build plan
+-- STATUS.md               # Build progress tracker
```

## CLI Commands

### Initialize a project

```bash
npm run init -- <client> <project> [--canvas <preset>]
```

Scaffolds a new project with manifest, starter HTML, and brand directory.

```bash
npm run init -- acme landing-page
npm run init -- acme pitch-deck --canvas landscape-16-9
```

### Validate all projects

```bash
npm run doctor
```

Checks all projects for missing files, duplicate IDs, orphaned HTML, and other issues.

### Generate thumbnails

```bash
npm run generate-thumbs
```

Regenerates Playwright-based PNG thumbnails for all versions.

### Export

```bash
npm run export-pdf -- <client> <project> [--set <working-set>]
npm run export-png -- <client> <project>
```

## Tech Stack

- Next.js 16 + React 19
- TypeScript
- Tailwind CSS v4
- SWR for data fetching
- Playwright for thumbnails and export
- Puppeteer for PDF generation

## Architecture

- **Local-first** -- runs as a local dev server, all data in the filesystem
- **BYO AI** -- no built-in AI; your tool generates the HTML, DriftGrid manages it
- **Cloud-optional** -- paid tier planned for sharing, teams, and analytics

## License

MIT
