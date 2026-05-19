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

## Manifest safety

The manifest is shared mutable state across the UI, MCP tools, thumbnail regen, and any agent edits. Corruption has happened in the past from concurrent writers. **These rules are not optional — breaking them re-introduces lost-update bugs.**

### Operational rules (when working on a project)

- **One agent at a time** per project. The MCP server hits the same HTTP routes as the UI; two agents firing `create_version` / `add_feedback` / `close_round` in parallel can clobber each other's writes.
- **One browser tab** per project. Every UI mutation does a full-manifest PUT — two tabs press `D` simultaneously and the second silently wins.
- **No agent edits while the grid view is opening on a cold cache.** Cold-open triggers ~N parallel thumbnail regenerations; each does a manifest read-modify-write.
- **Snapshot before risky sessions**: `cp projects/<client>/<project>/manifest.json projects/<client>/<project>/manifest.json.bak-pre-$(date +%s)`. The system also keeps a rotating ring of 5 `.bak-<ts>` files automatically.
- **Don't branch on rounds projects** — `/api/branch` is silently a no-op on rounds-enabled projects (uses the rounds-alias; fix queued as P2.5). Use drift + manual concept create until the fix lands.

### Sanity check

```bash
npx tsx bin/manifest-doctor.ts <client>/<project>
```

Read-only. Reports: missing `version.file` paths, `version.thumbnail` fields that don't match the canonical `.thumbs/${concept.id}-${version.id}.webp` form, duplicate concept/version IDs. Run before/after every agent session.

### Invariants (when modifying DriftGrid itself)

These are load-bearing — breaking them re-introduces the corruption bug class:

1. **All manifest writes go through `lib/storage.writeManifest`.** It owns the per-`(client, project)` in-process serializer. Never import `writeManifest` from `lib/manifest` directly. Never `fs.writeFile` a `manifest.json` from anywhere else.
2. **`lib/manifest.writeManifest` is atomic** (temp file + rename) and rotates 5 `.bak-<ts>` snapshots. Don't replace with a direct `fs.writeFile`.
3. **`manifest.concepts` is a read-only alias** for the latest round. Never mutate it directly. Mutate `manifest.rounds[N].concepts[]`. The alias is stripped on serialize — splice/push on the alias does not persist.
4. **Never iterate `manifest.concepts` to find a concept by id on a rounds project.** Use `findConceptAndVersion` (currently in `app/api/annotations/route.ts`, will move to `lib/manifest-lookup.ts` in P2). It searches all rounds.
5. **`version.thumbnail` must match `.thumbs/${concept.id}-${version.id}.webp` exactly.** If you write any other value, the doctor will flag it. (Phase 2: this field is deprecated and derived from convention.)
