# DriftGrid Cloud — Phase 2 Notes (Migration + parity validation)

Branch: `feat/cloud-schema` (continues Phase 1). Scope: backfill the **local
SQLite** DB from `manifest.json` files, with manifest-doctor-style validation.
Still additive — the file model and the app are untouched; this is a one-way
backfill into the new DB plus a safety check. The Phase 3 API-route cutover is
NOT done.

## What shipped

| Artifact | Path | What it is |
|---|---|---|
| Parity validator | `lib/db/parity.ts` | `canonicalManifest` / `compareManifests` — structural equality tolerant of benign empty-vs-absent / default differences. |
| Migration CLI | `bin/migrate-to-db.ts` | Backfills every project into `projects/.driftgrid/db.sqlite` and verifies round-trip parity. `--all` (default), `<client>/<project>`, `--check` (validate only). Exit 1 on any mismatch/error. |
| Robustness fix | `lib/sqlite-storage.ts` | Synthesizes a deterministic `manifest_id` at each level when a legacy object lacks an `id`, so the backfill never crashes; original legacy keys are preserved in `extras`. |
| cwd fix | `lib/db/sqlite.ts` | Schema bootstrap path is module-relative (`__dirname`) so the tool runs from any directory; only the data DB stays cwd/workspace-relative. |

## Result — ran against all 25 real projects

**24 ok, 1 mismatch, 0 error.** Every active project round-trips losslessly
(structure, order, untyped fields). The one mismatch is `recovryai/demo-storyboard`
(an ARCHIVE project): its round 4 is a legacy shape — it has `label` instead of
`name` and no `id`. The migration handles it gracefully (synthesizes
`id:"round-4"`, defaults `name:""`; preserves `label`/`createdAt`/etc. in
`extras`) and the validator reports the precise diff rather than crashing.

This is the intended behavior: the tool is a migration-readiness gate that
surfaces exactly which projects carry non-standard data, with a human-readable
reason. demo-storyboard is the only one, and it's archived.

## How to run

```bash
cd /Users/jeffbzy/driftgrid
npx tsx bin/migrate-to-db.ts --all          # backfill + validate every project
npx tsx bin/migrate-to-db.ts --all --check  # validate parity only (after a backfill)
npx tsx bin/migrate-to-db.ts recovryai/demo-v4
```

The DB is written to `projects/.driftgrid/db.sqlite` (gitignored). Nothing the
app uses reads it yet (the DB backend is still behind `DRIFTGRID_DB_BACKEND=sqlite`).

## Open questions

1. **demo-storyboard legacy round.** Leave the synthesize-on-migrate behavior, or
   one-time repair the manifest file itself (set `id`/`name` on round 4) so it
   round-trips byte-clean? It's archived, so low urgency.
2. **Cloud (Postgres) migration not implemented** — same blocker as Phase 1: it
   needs the Postgres write backend. This tool covers the local mirror only.
3. **Migration is re-runnable / idempotent** (upsert + prune), so re-backfilling
   after edits is safe. When Phase 3 cuts the app over, decide the trigger:
   one-time migrate, or migrate-on-first-open per workspace.
