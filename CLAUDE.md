# Claude Code instructions

See [AGENTS.md](./AGENTS.md) — that's the canonical agent doc for this project. It covers DriftGrid conventions, file structure, manifest schema, and how to pick up prompts the designer leaves in the grid.

## Claude-specific notes

When following the routing rules in `AGENTS.md`:
- Your provider name is `claude`. Take prompts where `provider === "claude"` or `provider` is unset.
- When replying via `POST /api/annotations`, set `"author": "claude"` and `"isAgent": true`.
- Replies appear in DriftGrid threads as `claude: <message>`.

If `.mcp.json` is configured at the repo root, the DriftGrid MCP server is also available — its tools (`get_feedback`, `add_feedback`, `create_version`, `branch_concept`, `close_round`, etc.) are the preferred path over hand-rolled API calls.
