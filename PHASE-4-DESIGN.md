# DriftGrid Cloud — Phase 4 (cloud Postgres backend + sync)

> Status update (2026-06-27): **the Postgres backend is now BUILT and verified**
> locally via PGlite (real Postgres, in-process, no Docker, zero prod contact).
> The atomicity decision below was made — **plpgsql RPC** — and implemented:
> - `supabase/migrations/20260627000000_write_manifest_rpc.sql` — atomic
>   decompose+upsert+prune in one transaction.
> - `lib/postgres-storage.ts` — supabase-js backend, behind
>   `DRIFTGRID_CLOUD_BACKEND=postgres` (default stays on Storage; prod untouched).
> - `lib/db/manifest-mapper.ts` — made dual-encoding (jsonb objects + native
>   bool/float as well as SQLite's text/0-1).
> - `tests/postgres-storage.test.ts` — 4 tests incl. **cross-backend parity**
>   (Postgres output == SQLite output for the same manifest). `npm test` = 26/26.
>
> **Still needs a real Supabase branch DB** (owner action — not doable here): the
> full migration's `auth.users` FK + RLS policies, and the thin supabase-js glue
> (rpc/select calls) running against live PostgREST. The risky SQL + mapping are
> proven; what remains is the auth/RLS hookup. The original design follows.
>
> ---
>
> Original design (for reference):

## Where Phase 4 picks up

- `lib/sqlite-storage.ts` is the proven local backend (round-trip + prune + ord
  + extras, guarded by `tests/sqlite-storage.test.ts`).
- `lib/db/manifest-mapper.ts:rowsToManifest` reconstructs a Manifest from rows —
  **DB-agnostic already**, reused as-is for cloud reads (one tweak needed, see §3).
- The Postgres schema + RLS already exist: `supabase/migrations/20260626000000_cloud_schema.sql`.
- Cloud mode today still uses **Supabase Storage** (`lib/supabase-storage.ts`,
  `manifest.json` blobs). Phase 4 adds a Postgres backend *alongside* it, selected
  by a flag, so prod behavior is untouched until we flip it.

## 1. The decision that blocks everything: write atomicity

The local backend gets correctness from a single SQLite **transaction**
(decompose → upsert → prune, all-or-nothing). The cloud must match that — a
half-written project tree is exactly the corruption class this whole effort kills.

**`supabase-js` / PostgREST has no client-side transactions.** So the cloud
decompose-write needs one of:

| Option | How | Pros | Cons |
|---|---|---|---|
| **A — plpgsql RPC** (recommended) | One `write_manifest(p_user uuid, p_client text, p_project text, p_manifest jsonb)` function does the whole decompose+upsert+prune server-side, in a transaction. App calls `supabase.rpc('write_manifest', …)`. | Atomic; no new dep; runs under the existing service-role client; keeps RLS story intact; one network round-trip. | Decompose logic written once in SQL (duplicate of the TS walker); plpgsql is less pleasant to test/iterate. |
| **B — direct `pg`** | Add `pg`, connect with the DB connection string, run the existing TS decompose inside a real `BEGIN/COMMIT`. | Reuse the TS walker verbatim; familiar. | New dep + a second connection path (not the Supabase REST client); needs the raw DB URL in env + pooling (PgBouncer) care on Vercel; bypasses PostgREST. |

**Recommendation: A (plpgsql RPC).** It keeps a single client (service role), is
atomic by construction, and avoids a second connection/pooling story on Vercel.
Cost is writing the decompose once in SQL — but the shape is fixed and small, and
reads still use the TS mapper. (If we later want to DRY the two write walkers,
that's a refactor, not a blocker.)

Reads don't need any of this — a few `select * where …` filtered by the project's
`user_id` (service role bypasses RLS; we scope in the query, mirroring how the
Storage backend scopes by `{userId}/...` path) → feed the rows to `rowsToManifest`.

## 2. Dispatch wiring (additive, prod-safe)

`lib/storage.ts` gains a cloud-backend selector, default = current Storage:

```
cloudBackend() => process.env.DRIFTGRID_CLOUD_BACKEND === 'postgres' ? 'pg' : 'storage'

getManifest(userId, client, project):
  if isCloudMode() && userId:
    return cloudBackend()==='pg' ? getManifestPg(userId,…) : getManifestCloud(…)  // ← Storage unchanged by default
  if isDbBackend(): return getManifestDb(…)        // local sqlite (Phase 1-3)
  return file
```

So prod stays on Storage until `DRIFTGRID_CLOUD_BACKEND=postgres` is set. New
backend lives in `lib/postgres-storage.ts` (mirrors `sqlite-storage.ts`).

## 3. One mapper tweak for the cloud read path

`rowsToManifest` uses `parseJson(string)` for jsonb columns and `bool(0|1)` for
booleans — SQLite encodings. Postgres returns **native** jsonb (objects) and
booleans. Make the helpers dual-encoding (tiny, safe):
- `parseJson`: if the value isn't a string, return it as-is (already an object).
- `bool`: already handles `true|false|1|0`. ✓

Then the same `rowsToManifest` serves both backends.

## 4. Migration to cloud (Phase 2's cloud half)

`bin/migrate-to-db.ts` already backfills + parity-checks the **local** DB. Add a
`--target=cloud --user=<uuid>` mode that calls the Postgres writer per project and
runs the same parity check (write → read back → structural compare). Run it against
a **branch DB first**.

## 5. Sync (the actual Phase 4 feature, once the backend exists)

Git-style DB↔DB push/pull, **append-mostly** (per CLOUD-FOUNDATION.md):
- **Versions** never mutate content (drift only adds) → sync is a **union** keyed
  by `(concept manifest_id, version manifest_id)`. The `ord`/`number`/`created`
  columns give a deterministic merge order. No byte-merge.
- **Metadata** (round/concept order, `starred`, `visible`, `selects`, annotations'
  `resolved`) → **last-write-wins by timestamp**. This is the one tiebreak rule to
  nail; everything else is additive.
- **Comments/annotations** → union by `manifest_id`; `resolved` is LWW.
- Conflicts are therefore rare-by-design; the risky case (two edits to the same
  metadata field) resolves by timestamp, logged so it's never silent.

## Suggested order when resumed

1. Apply the migration to a Supabase **branch** DB (owner action).
2. Decide A vs B (recommend A). Write `write_manifest` plpgsql + `lib/postgres-storage.ts`.
3. Dual-encode the mapper helpers; wire `cloudBackend()` dispatch.
4. `bin/migrate-to-db.ts --target=cloud` against the branch DB; parity-check.
5. Then build sync on top (union + LWW), and the web MCP (Phase 5) on the same backend.
