# DriftGrid MCP — local and web

DriftGrid exposes its tool surface to agents two ways. Same tools, different transport:

| | Local MCP | Web MCP |
|---|---|---|
| Where | `npm run mcp` (stdio) | `https://driftgrid.ai/api/mcp` (streamable HTTP) |
| Backs onto | your `projects/` folder | your cloud account (Supabase) |
| Auth | none (local) | personal access token (`dg_pat_…`) |
| For | agents on your machine | agents anywhere — no local install |

## Web MCP setup

Mint a token once at [driftgrid.ai/account](https://driftgrid.ai/account) → **access tokens**.

**Claude Code**

```bash
claude mcp add --transport http driftgrid https://driftgrid.ai/api/mcp \
  --header "Authorization: Bearer dg_pat_YOUR_TOKEN"
```

**Codex CLI** (`~/.codex/config.toml`)

```toml
[mcp_servers.driftgrid]
url = "https://driftgrid.ai/api/mcp"
http_headers = { "Authorization" = "Bearer dg_pat_YOUR_TOKEN" }
```

**Cursor / other header-capable MCP clients** — HTTP transport, same URL + header.

**Clients that can't set headers** — append the token to the URL instead: `https://driftgrid.ai/api/mcp?key=dg_pat_YOUR_TOKEN`. Works, but URLs can end up in logs; prefer the header, and revoke/re-mint the token if you've shared the URL anywhere.

> **claude.ai (web) custom connectors** require OAuth, which the web MCP doesn't speak yet (roadmap). Until then, claude.ai users use the copy/paste lane: ask Claude for a full HTML document, paste it into the grid; copy feedback back into the chat.

## Tools

- `list_projects` — clients + projects in the workspace
- `get_project` — rounds → concepts → versions with ids (feed these to other tools)
- `create_project` — new project (canvas required; free cloud tier is capped)
- `add_version` — ship a design: full self-contained HTML → new version in a concept
- `get_feedback` — annotations + client comments from share pages
- `add_feedback` — leave an annotation on a version
- `create_share` — mint/refresh the public client-review URL (cloud only)

The conventions in `AGENTS.md` apply: HTML must be self-contained (inline CSS/JS, Google Fonts via `<link>`), never overwrite a version — add a new one.

## Local MCP

Unchanged: `npm run mcp` speaks stdio against `http://localhost:3000` (override with `DRIFTGRID_URL`). See `mcp/server.ts`.
