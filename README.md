# DriftGrid

**Design iteration for agents. Present to clients.**

Your AI agent creates HTML designs. DriftGrid versions them on an infinite canvas, lets you browse and compare, then share a link with your client. Concepts across, versions down — drift around the grid until you reach your selects.

<!-- TODO: hero GIF here -->

## Why DriftGrid

AI tools generate designs fast — but there's no good way to manage the output. You end up with dozens of HTML files, no way to compare them, and a messy handoff to clients.

DriftGrid is the missing layer:

- **BYO AI** — works with Claude Code, Cursor, Copilot, Claude Managed Agents, or any tool that writes HTML
- **Local-first** — your files, your filesystem, no lock-in
- **Cloud sharing** — push to the cloud, share a link, clients review and comment
- **Live HTML** — every frame is a real HTML page, not a screenshot

## Quick Start

```bash
git clone https://github.com/jsbzy/driftgrid.git
cd driftgrid
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). The included demo project shows a multi-concept design iteration.

## The Workflow

```
Agent creates HTML → DriftGrid organizes it → Push to cloud → Share with client
     (local)              (local)              (one click)     (public link)
```

1. **Your agent writes HTML** — point Claude Code (or any AI tool) at the project. The CLAUDE.md conventions file tells the agent how to create versioned designs.
2. **Browse the grid** — zoom, navigate, compare concepts side by side. Star your picks.
3. **Push to cloud** — one button on the dashboard uploads everything.
4. **Share a link** — your client gets a public review URL. No login needed.

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

**Concepts** are design directions (columns). **Versions** are iterations (rows). The manifest tracks everything. Your AI tool creates files, DriftGrid displays them.

### Navigation

| Key | Action |
|-----|--------|
| `` ` `` | Full overview |
| `1`–`4` | Zoom levels |
| `Enter` | Enter frame (live HTML) |
| `Esc` | Back out |
| `D` | Drift (new version) |
| `S` | Star / unstar |
| `P` | Present starred |
| Arrow keys | Navigate |
| `Space` | Pan |

### Client Review

Share links give clients a read-only view of the grid. They can browse, zoom into frames, and leave annotations — without touching your working environment.

### Cloud Tier

Self-hosted is free forever. The cloud tier ($10/month or $96/year) adds:

- **Push to cloud** — upload from your local dashboard
- **Share links** — public URLs for client review, no login required
- **Archive** — your full design practice, always accessible

## Canvas Presets

| Preset | Dimensions | Behavior |
|--------|-----------|----------|
| 16:9 Landscape | 1920 × 1080 | locked |
| A4 Portrait | 794 × 1123 | locked |
| Desktop | 1440 × auto | scroll |
| Tablet | 768 × auto | scroll |
| Mobile | 375 × auto | scroll |

## MCP Server

DriftGrid includes an MCP server for direct agent integration:

```bash
npm run mcp
```

Your AI tool can create projects, add versions, read feedback, manage rounds — all without leaving the conversation.

## Tech Stack

Next.js 16, React 19, TypeScript, Tailwind v4, SWR, Playwright. No database locally — filesystem is the source of truth. Cloud tier uses Supabase for storage and auth.

## License

[MIT](LICENSE)
