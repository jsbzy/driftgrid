# DriftGrid

**Design iteration for agents. Present to clients.**

Your AI agent creates HTML designs. DriftGrid versions them on an infinite canvas, lets you browse and compare, then share a link with your client. Concepts across, versions down — drift around the grid until you reach your selects.

<!-- TODO: hero GIF here -->

## Why DriftGrid

AI tools generate designs fast — but there's no good way to manage the output. You end up with dozens of HTML files, no way to compare them, and a messy handoff to clients.

DriftGrid is the missing layer:

- **BYO AI** — works with Claude Code, Cursor, Copilot, Claude Managed Agents, or any tool that writes HTML
- **Local-first** — your files, your filesystem, no lock-in
- **Cloud sharing (optional)** — push to the cloud, share a link, clients review and comment
- **Live HTML** — every frame is a real HTML page, not a screenshot

## Quick Start — local (zero config)

Everything below works with no Supabase, no Stripe, no accounts. Your designs stay on your machine.

```bash
git clone https://github.com/jsbzy/driftgrid.git
cd driftgrid
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). The included demo project shows a multi-concept design iteration.

## Cloud setup (optional, for share links)

Cloud mode lets you share projects with clients via `https://yourdomain.com/s/{client-slug}/{token}` links. Required only if you want multi-device sync or public client review.

1. Create a Supabase project — free tier works.
2. Run the migrations in `supabase/migrations/` via `supabase db push` (or paste them into the SQL editor).
3. Copy `.env.example` → `.env.local` and fill in:
   ```
   NEXT_PUBLIC_SUPABASE_URL=
   NEXT_PUBLIC_SUPABASE_ANON_KEY=
   SUPABASE_SERVICE_ROLE_KEY=
   DRIFT_CLOUD=1
   ```
4. *(Paid tier only)* add Stripe keys:
   ```
   STRIPE_SECRET_KEY=
   STRIPE_WEBHOOK_SECRET=
   NEXT_PUBLIC_STRIPE_PRICE_ID=             # monthly
   NEXT_PUBLIC_STRIPE_PRICE_ID_ANNUAL=      # annual
   ```
5. Restart `npm run dev`.

For the hosted version, just sign up at [driftgrid.ai](https://driftgrid.ai).

## The workflow

```
Agent creates HTML → DriftGrid organizes it → Push to cloud → Share with client
     (local)              (local)              (one click)     (public link)
```

1. **Your agent writes HTML** — point Claude Code (or any AI tool) at the project. The `CLAUDE.md` conventions file tells the agent how to create versioned designs.
2. **Browse the grid** — zoom, navigate, compare concepts side by side. Star your picks.
3. **Push to cloud** — one button on the dashboard uploads the starred versions from the current round.
4. **Share a link** — your client gets a public review URL. No login needed. Republish and they see the update at the same URL.

## How it works

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

**Concepts** are design directions (columns). **Versions** are iterations (rows). **Rounds** are presentation cycles — each round can have its own pinned share URL. The manifest tracks everything.

## Keyboard shortcuts (grid view)

| Key | Action |
|-----|--------|
| Arrow keys | Navigate between cards |
| Shift + Arrow | Extend multi-selection |
| Alt/⌥ + Arrow | Reorder cards / columns |
| `Enter` | Enter frame (live HTML) |
| `Esc` | Back out / clear selection |
| `G` | Toggle grid / frame |
| `D` | Drift (new version copied from current) |
| `Shift + D` | Drift right (new concept column) |
| `C` | Comment on the current frame |
| `S` | Star / unstar current card |
| `P` | Present starred versions fullscreen |
| `H` | Hide overlay chrome |
| `Cmd/Ctrl + C` | Copy card(s) to clipboard |
| `Cmd/Ctrl + V` | Paste into current concept |
| `Cmd/Ctrl + K` | Command palette |
| `` ` `` | Full overview / zoom out |
| `1`–`4` | Zoom levels |
| `Space` (hold) | Pan canvas |

See [docs.driftgrid.ai](https://docs.driftgrid.ai) for the full reference.

## Client review

Share links give clients a read-only view of the grid. They can browse, zoom into frames, and leave inline comments — without touching your working environment. One URL per round, republished in place when you push updates.

## Pricing

- **Free** — unlimited local projects, one shareable project (all its rounds), MCP server, file watcher
- **Pro ($10/mo or $96/yr)** — share every round of every project, cloud sync across devices, client commenting, priority support

Self-hosted with your own Supabase is free forever. See [driftgrid.ai/pricing](https://driftgrid.ai/pricing) for the current breakdown.

## Canvas presets

| Preset | Dimensions | Behavior |
|--------|-----------|----------|
| 16:9 Landscape | 1920 × 1080 | locked |
| A4 Portrait | 794 × 1123 | locked |
| Desktop | 1440 × auto | scroll |
| Tablet | 768 × auto | scroll |
| Mobile | 375 × auto | scroll |

## MCP server

DriftGrid includes an MCP server for direct agent integration:

```bash
npm run mcp
```

Your AI tool can create projects, add versions, read feedback, manage rounds — all without leaving the conversation. See `mcp/README.md` for the tool surface.

## Contributing

Issues, PRs, and ideas welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Please be kind — [Code of Conduct](CODE_OF_CONDUCT.md).

## Tech stack

Next.js 16, React 19, TypeScript, Tailwind v4, SWR, Playwright. No database locally — the filesystem is the source of truth. Cloud tier uses Supabase for storage + auth and Stripe for billing.

## License

[MIT](LICENSE)
