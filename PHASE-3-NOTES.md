# DriftGrid Cloud — Phase 3 Notes (Repoint the app at the DB)

Branch: `feat/cloud-schema`. Scope: make the running app work on the DB backend,
**behind the `DRIFTGRID_DB_BACKEND=sqlite` flag**. Flag unset = the file model,
unchanged. No cloud cutover, no prod changes.

## The core insight

Most write-path routes already went through `lib/storage` (the dispatch wired in
Phase 1), so iterate/branch/annotations/rounds/paste worked on the DB the moment
the flag flipped. Phase 3 was really two things:

1. **Close the bypasses.** When the flag is on, writes go to the DB and
   `manifest.json` goes stale — so *every reader* must go through the dispatch or
   the UI/exports show stale data. A handful still imported `lib/manifest`
   directly.
2. **Fix the one direct writer.** `create-project` did a raw `fs.writeFile` of the
   manifest (also an invariant #1 violation).

## Changes (all additive / behavior-preserving when the flag is off)

| File | Change |
|---|---|
| `app/api/create-project/route.ts` | Manifest write now goes through `storage.writeManifest`. Also emits the **canonical rounds shape** (concept in round-1) instead of top-level `concepts` + empty `rounds`. |
| `app/api/manifest/[client]/[project]/route.ts` | GET + If-Match read go through `storage.getManifest` in all modes (removed the `getManifestLocal` bypass). |
| `lib/manifest-cache.ts` | `getCachedManifest` reads via the dispatch (dynamic import, optional `userId`). Used by thumbnail generation. |
| `app/api/export/route.ts`, `app/api/export-doc/route.ts` | Read via the dispatch. |
| `app/admin/.../page.tsx`, `app/review/.../page.tsx` | Read via the dispatch. |
| `lib/sqlite-storage.ts` | DB writer wraps legacy top-level `concepts` into round-1 (belt-and-suspenders for any legacy writer). |
| `lib/db/schema-sqlite.ts` (new) | SQLite schema **inlined as a string** (replaces the `.sql` file). |
| `lib/db/sqlite.ts` | Bootstraps from the inlined schema — no filesystem read. |

For readers, the pattern is `getManifest(null, client, project)`: `null` userId
means "cloud → file (unchanged), local → file or SQLite per the flag", so cloud
and default-local behavior are identical to before.

## Two real bugs caught by verification

1. **Turbopack + `__dirname`.** Reading `schema-sqlite.sql` via `__dirname`
   resolved to a virtual `/ROOT/...` under Next/Turbopack → `ENOENT`, every API
   route 500'd. **Fix:** inline the schema as a TS string constant — no file read
   in any runtime (tsx, Next, Tauri), from any cwd.
2. **`create-project` dropped its concept in file mode.** Routing through
   `writeManifest` strips the top-level `concepts` alias before writing; since the
   concept lived *only* at top-level with empty `rounds`, it was written away →
   empty project → all downstream smoke phases failed. **Fix:** emit the canonical
   rounds shape. (DB mode had masked this via the round-1 wrap.)

> Aside, not a bug: `next dev -p 3100` collided with the DriftGrid **launcher**
> already on :3100 (it answers JSON `{"error":"Not found"}` for unknown paths).
> First smoke run was hitting the launcher, not the app. Used a free port instead.

## Verified — full smoke suite, both backends

Ran `bin/smoke.ts` (15 phases, real HTTP) against a dev server in each mode:

| Mode | Result |
|---|---|
| **DB** (`DRIFTGRID_DB_BACKEND=sqlite`) | **81 pass / 0 fail / 3 skip** |
| **File** (default) | **81 pass / 0 fail / 3 skip** |

The 3 skips are the cloud Sharing / Cloud-push / Stripe phases (correctly skipped
outside cloud mode). Everything else — project lifecycle, frame editing, drift,
branch, paste, stars, reorder, annotations, rounds (incl. drift into a non-latest
round), export (HTML+PDF), SSE watch, delete+undo — passes identically on both.
`npx tsc --noEmit` clean throughout.

## What's NOT done (still later phases)

- **Cloud (Postgres) path:** in cloud mode the app still uses Supabase Storage.
  The Postgres write backend + cloud cutover are Phase 2-cloud / later.
- **`app/api/cloud/push-and-share`** still reads `manifest.json` from disk
  directly. In DB mode that would push stale data — but it's the cloud-publish
  flow (Phase 4/5 sync territory), out of scope here. Flagged for that phase.
- **The `driftgrid` CLI** (`bin/driftgrid.js`) writes manifests to disk directly;
  in DB mode the app won't see CLI-created projects. Acceptable for now (CLI is a
  local authoring tool); revisit when the DB becomes the default.
- Sync (4), web MCP (5), workspaces UI (6), billing (7), dashboard reimagine (8).

## How to try it

```bash
cd /Users/jeffbzy/driftgrid
npx tsx bin/migrate-to-db.ts --all        # backfill the DB from manifests (Phase 2)
DRIFTGRID_DB_BACKEND=sqlite npm run dev    # run the app on the DB
# (omit the env var for the normal file model)
```
