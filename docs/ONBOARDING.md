# The new-user flow

This is the canonical map of how someone goes from "never heard of DriftGrid" to sharing designs with a client. The landing page, README, and docs should all tell this story the same way.

## The one-sentence model

**Two doors, one grid: install nothing (driftgrid.ai) or install locally (free OSS). The cloud is where designs meet other people** (share links, client comments, review from any device).

Cloud-standalone shipped 2026-07-09: projects can be created in the browser, agents connect via the web MCP (`/api/mcp`, PAT auth — see docs/MCP.md), and chat-only users paste HTML from a Claude/ChatGPT conversation. Promotion can lead with either door — "zero install" for reach, local for the agent-power story.

## Lane A — the designer with an agent (primary funnel)

The person DriftGrid is built for: they use Claude Code / Cursor / any HTML-writing agent and need to manage the output.

```
git clone → npm install → npm run dev          (2 minutes, no account)
   ↓
open localhost:3000 → explore the demo project
   ↓
agent creates a real project (CLAUDE.md / AGENTS.md conventions, or MCP server)
   ↓
iterate in the grid: drift (D), branch, star selects
   ↓  — first cloud touchpoint —
sign up at driftgrid.ai (free) → Share from the project
   ↓
client opens the share URL: browses, zooms, comments — no login
   ↓  — upgrade moment —
second client project needs sharing → free tier covers one → Pro ($10/mo)
```

Free-tier gate (the actual paywall): **one shareable project** — all its rounds, republished forever. Pro unlocks sharing every project, plus cloud sync across devices.

### The agent loop (what makes this lane different)

Once a personal access token is set up (`/account` → access tokens → `.driftgrid-pat`), the human never has to touch the machine the agent works on:

```
you: "make the hero darker, push it"
agent: edits v3.html → npm run push -- client/project --share
you: refresh the share URL on your phone
```

Pushes are overwrite-guarded: if the cloud copy changed since that machine last pushed, the CLI refuses (override with `--force`).

## Lane B — the client (no funnel, by design)

Clients receive a share URL. They browse the grid, open live frames, leave comments. No account, no install, nothing to learn. Their comments flow back to the designer's next session. A client who asks "what is this tool?" is the referral loop — the share page footer is the only pitch they should ever see.

## Lane C — the self-hoster

Same as Lane A, but instead of driftgrid.ai they run their own Supabase (README → "Cloud setup"). Everything is free forever; they trade $10/mo for owning their infra. This lane keeps the OSS promise honest and is worth protecting, not monetizing.

## What NOT to promise yet

Audited 2026-07-09 (see ROADMAP for the cards):

- **Thumbnails for cloud-created projects** — there's no cloud-side renderer; tiles appear only for projects pushed from a local machine (push generates + uploads them). Cloud-born projects show placeholder tiles until the cloud-render card lands.
- **A demo to explore on driftgrid.ai** — new accounts aren't seeded with one yet.
- **claude.ai web custom connectors** — need OAuth on the MCP endpoint (roadmap card); today claude.ai-web users take the paste lane, while Claude Code / Codex / Cursor use the web MCP with a token.

## Where the money is

Free = the funnel (unlimited local, one shared project — enough to fall in love and to show one real client). Pro = the habit (every client project shared, synced everywhere). The upgrade trigger is the *second* concurrent client — which is exactly the moment DriftGrid has proven itself in a real engagement.
