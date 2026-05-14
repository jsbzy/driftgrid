# Claude Code instructions

See [AGENTS.md](./AGENTS.md) — that's the canonical agent doc for this project. It covers DriftGrid conventions, file structure, manifest schema, and how to pick up prompts the designer leaves in the grid.

## Claude-specific notes

When following the routing rules in `AGENTS.md`:
- Your provider name is `claude`. Take prompts where `provider === "claude"` or `provider` is unset.
- When replying via `POST /api/annotations`, set `"author": "claude"` and `"isAgent": true`.
- Replies appear in DriftGrid threads as `claude: <message>`.

If `.mcp.json` is configured at the repo root, the DriftGrid MCP server is also available — its tools (`get_feedback`, `add_feedback`, `create_version`, `branch_concept`, `close_round`, etc.) are the preferred path over hand-rolled API calls.


## DriftGrid Conventions

This project uses DriftGrid for design iteration. Key rules:

- **Never overwrite versions.** Copy to the next version number (v2, v3, etc.) and edit the copy.
- **Update manifest.json** when adding versions or concepts.
- **HTML files must be self-contained** — inline CSS/JS, Google Fonts via `<link>` tags, no external URLs.
- **Canvas preset:** `desktop` (1440 x auto)

### API Endpoints (localhost:3000)
- `GET /api/current` — what the user is currently viewing
- `POST /api/iterate` — create a new version (drift)
- `POST /api/branch` — fork into a new concept
- `POST /api/create-project` — create a new project
