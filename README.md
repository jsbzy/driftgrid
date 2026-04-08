# DriftGrid

**The design iteration workspace for AI-generated work.**

Your AI tool generates HTML. DriftGrid versions it, compares it, and presents it to clients. Concepts across, versions down -- drift around the grid until you reach your selects.

<!-- TODO: hero GIF here -->
<!-- ![DriftGrid](docs/hero.gif) -->

## Why DriftGrid

AI coding tools (Claude Code, Cursor, Copilot) are incredibly fast at generating designs -- but there's no good way to manage the output. You end up with dozens of HTML files, no way to compare them, and a messy handoff to clients.

DriftGrid fixes this. It gives every design a place on a 2D grid where you can zoom, browse, star your picks, and present them -- all from `localhost:3000`.

- **BYO AI** -- DriftGrid doesn't generate designs. It's the workspace where your AI-generated work lives.
- **Local-first** -- runs on your machine, no cloud dependency. Your files, your filesystem.
- **Live HTML** -- every frame is a real HTML page, not a static screenshot. Interactive prototypes work out of the box.

## Quick Start

```bash
git clone https://github.com/jsbzy/driftgrid.git
cd driftgrid
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). The included demo project shows a 4-concept landing page iteration.

### Create your first project

```bash
npm run init -- my-client landing-page
```

This scaffolds a project at `projects/my-client/landing-page/` with a manifest, starter HTML, and brand directory. Point your AI tool at the HTML files and start iterating.

## How It Works

```
projects/
└── {client}/
    ├── brand/              # Brand guidelines, logos, assets
    └── {project}/
        ├── manifest.json   # Source of truth
        ├── concept-1/
        │   ├── v1.html     # Version 1
        │   └── v2.html     # Version 2 (iterated)
        └── concept-2/
            └── v1.html     # Different direction
```

**Concepts** are design directions (columns on the grid). **Versions** are iterations within a concept (rows). Your AI tool creates the HTML files, and DriftGrid reads the manifest to display them.

### The Grid

The infinite canvas shows all your work at a glance. Zoom in to browse, zoom out to compare. Five zoom levels let you go from full overview to single-card focus:

| Key | View |
|-----|------|
| `` ` `` | Full overview |
| `1` | Column |
| `2`-`4` | Card close-ups |
| `Enter` | Enter frame (live HTML) |
| `Esc` | Back out |

Arrow keys navigate. `Space` to pan. `D` to drift (duplicate + iterate). `S` to toggle selects. `?` for all shortcuts.

### Selects & Presentation

Star your picks with `S`, then present them as a fullscreen slideshow. Working sets let you save named selections -- "Round 1 picks", "Client favorites" -- for export or review.

### Client Review

Share a separate review URL (`/review/{client}/{project}`) where clients see only what you've made visible. They can suggest text edits and leave comments without touching your working grid.

### Export

Export from the UI or CLI:

```bash
npm run export-pdf -- my-client landing-page
npm run export-png -- my-client landing-page
```

Formats: PDF, PNG, PPTX, raw HTML. Working sets export as multi-page documents.

## Canvas Presets

| Preset | Width | Height | Behavior |
|--------|-------|--------|----------|
| A4 Portrait | 794px | 1123px | locked |
| 16:9 Landscape | 1920px | 1080px | locked |
| Desktop | 1440px | auto | scroll |
| Tablet | 768px | auto | scroll |
| Mobile | 375px | auto | scroll |
| Freeform | custom | custom | configurable |

```bash
npm run init -- acme pitch-deck --canvas landscape-16-9
```

## MCP Server

DriftGrid includes an MCP server for direct integration with Claude Code and other AI tools:

```bash
npm run mcp
```

This lets your AI tool create projects, add versions, read feedback, manage rounds, and more -- without leaving the conversation.

## Tech Stack

- Next.js 16, React 19, TypeScript
- Tailwind CSS v4
- Playwright (thumbnails + export)
- SWR (data fetching)
- No database -- filesystem is the source of truth

## CLI Reference

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run init -- <client> <project>` | Scaffold a new project |
| `npm run doctor` | Validate all projects |
| `npm run generate-thumbs` | Regenerate thumbnails |
| `npm run export-pdf -- <client> <project>` | Export to PDF |
| `npm run export-png -- <client> <project>` | Export to PNG |
| `npm run mcp` | Start the MCP server |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
