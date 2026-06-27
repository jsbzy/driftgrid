# DriftGrid Cloud — Phase 1 Notes (Database Schema)

Branch: `feat/cloud-schema`. Scope: the schema + access layer only. **Nothing in
the app reads or writes the DB yet** — the file model remains the source of truth
until Phase 3. See `CLOUD-FOUNDATION.md` for the why.

## What shipped

| Artifact | Path | What it is |
|---|---|---|
| Postgres migration | `supabase/migrations/20260626000000_cloud_schema.sql` | `projects / rounds / concepts / versions / annotations` tables + RLS, + relate `share_links` / `client_comments`. **Reviewed, NOT pushed to prod.** |
| SQLite schema | `lib/db/schema-sqlite.sql` | Same hierarchy for the local mirror at `projects/.driftgrid/db.sqlite`. |
| SQLite connection | `lib/db/sqlite.ts` | Lazy-loads `better-sqlite3`, bootstraps schema (WAL, FKs on). |
| Manifest ↔ rows mapper | `lib/db/manifest-mapper.ts` | Pure read reconstruction (`rowsToManifest`) matching the file backend's shape. |
| DB backend | `lib/sqlite-storage.ts` | `getManifestDb` / `writeManifestDb` / `getClientsDb` — the storage interface against the DB. |
| Dispatch flag | `lib/storage.ts` (edited) | Routes manifest reads/writes/list to the DB when `DRIFTGRID_DB_BACKEND=sqlite`. **Additive; file backend is the default and untouched.** |
| Dependency | `package.json` | `better-sqlite3` + `@types/better-sqlite3`. |

## Schema decisions

1. **Surrogate uuid PK + load-bearing `manifest_id`.** Every row has a uuid `id`
   (stable FKs) and the manifest's own string id (`concept-open`, `v-open-1`,
   `round-1`) as `manifest_id`, unique within parent. The string id is embedded
   in HTML file paths, thumbnail paths (`.thumbs/${concept.id}-${version.id}.webp`),
   and existing `client_comments` rows, so it must round-trip exactly.

2. **`parent_id` stored as the parent's `manifest_id` (text), not a uuid FK.**
   A version/annotation tree can be inserted in any order and the manifest
   round-trips with zero rewriting. (Applies to `versions.parent_id` and
   `annotations.parent_id`.)

3. **HTML stays in files.** `versions.file_path` references disk/Storage. No HTML
   in the DB ("Path 2"). The dispatch keeps routing `writeHtmlFile` / `copyFile`
   / `getHtmlFile` / `getAsset` to the filesystem even when the DB backend is on.

4. **Explicit `ord` column** (source array index) on `rounds/concepts/versions/
   annotations`. Reads reproduce the *exact* on-disk array order — legacy data is
   not always in `number`/`position` order, and silently reordering a user's
   versions would be a regression. The `(number, created)` index the handoff
   asked for is kept alongside `ord` for the future sync-union dedup; `ord` is for
   display fidelity, `(number, created)` is the stable sort key for sync.

5. **`extras` jsonb on every child table.** Captures any keys present on a source
   object that the typed schema doesn't model (real example in the data:
   `round.description`; the legacy migration code also references `round.savedAt`).
   Without this, a relational decomposition silently drops untyped fields — the
   exact class of corruption this whole effort exists to end. With it, the mirror
   is genuinely lossless.

6. **Project-level collections parked in `projects.extras`.** `workingSets`,
   `documents`, `comments` (the legacy top-level array), and `clientEdits` are
   low-traffic; stored as one jsonb for a lossless round-trip. Can be normalized
   into their own tables later if/when they get queried.

7. **`annotations` IS the comments table.** The live designer↔agent pin/comment
   threads (`version.annotations[]`) become rows — that's "comments become DB
   rows" from the foundation doc. The anonymous `client_comments` table predates
   this and stays; both now relate to `versions`.

8. **Versions are append-mostly, not hard-immutable.** `file_path`/content never
   change once written (drift adds a new version), but `starred`/`visible`/
   `thumbnail` *are* mutable metadata (the star/hide toggles), so there is
   intentionally **no** immutability trigger that would block those updates.

## RLS

Every new table has RLS enabled. `projects` is gated on `auth.uid() = user_id`;
`rounds/concepts/versions/annotations` use an `EXISTS` join up to
`projects.user_id`. The server's admin (service-role) client bypasses RLS, same
as the existing tables. `share_links.project_id` and `client_comments.version_ref`
are **nullable** additive FKs — no existing insert path breaks; legacy rows leave
them null.

## Verified

- `npx tsc --noEmit` — **clean** (exit 0).
- File model unaffected: `npx tsx bin/manifest-doctor.ts recovryai/demo-v4` runs
  read-only and reports only **pre-existing** thumbnail data issues (3 errors / 46
  warnings already present on that project) — none introduced here. The file
  backend code path is byte-for-byte unchanged.
- DB backend round-trip against the real `recovryai/demo-v4` manifest (6 rounds,
  131 concepts, 508 versions, 3 documents): **structural match PASS**, **idempotent
  re-write PASS**, and `getClientsDb` returns the correct name / counts /
  `lastEditedAt`. (Verified with a throwaway script run under
  `DRIFTGRID_DB_BACKEND=sqlite`; not committed.)
- One real bug caught & fixed during verification: `version.visible` was
  defaulting to `false` when absent — corrected to default `true` (matching the
  schema default and `concept.visible`).

### Benign normalizations (not data loss)

The legacy manifest stores some optional fields inconsistently (e.g. `thumbnail:
""` vs absent; `annotations: []` vs absent; a concept missing `position`/
`description`). The DB backend canonicalizes these: type-required fields are
always emitted with their defaults; empty optionals are treated as absent. These
are equivalence-preserving (`thumbnail` is convention-derived and slated for
deprecation per manifest invariant #5), and were confirmed equal by the
round-trip's order-insensitive comparison.

## Out of scope (later phases — not touched)

API-route cutover (Phase 3), DB↔DB sync (4), web MCP (5), workspaces UI (6),
billing (7), dashboard reimagine (8).

## Open questions for review

1. **Postgres not applied.** Per the hard constraint (prod is live, live Stripe),
   the migration is authored + self-reviewed but not run. It mirrors the proven
   SQLite schema 1:1 + RLS. Suggest applying to a Supabase branch/local DB to
   confirm before it's ever near prod.
2. **Postgres write path.** Phase 1 only implements the **SQLite** backend (the
   local mirror). The cloud (Postgres) DB writer is Phase 2/3 work — the dispatch
   in cloud mode still uses Supabase Storage. Confirm that sequencing is what you
   want, or whether a Postgres backend should land here too.
3. **`extras` vs full normalization.** Project-level collections (workingSets/
   documents/comments/clientEdits) and untyped overflow live in jsonb. Fine for a
   scaffold; flag any you'd rather see as first-class tables now.
4. **`better-sqlite3` (native module).** Chosen per the handoff. It's lazy-imported
   so it never loads unless the flag is set (default/cloud/Vercel never touch it).
   Confirm that's acceptable for the desktop/Tauri build, or whether Node's
   built-in `node:sqlite` is preferred later (blocked today by `@types/node@20`).
5. **Write strategy = upsert + prune in one transaction.** Faithful and atomic,
   but it rewrites the whole project tree per `writeManifest`. Fine at current
   scale; the append-only sync model (Phase 4) will refine this.
