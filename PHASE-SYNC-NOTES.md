# DriftGrid Cloud — Sync (DB↔DB) notes

Branch `feat/cloud-schema`. Builds the git-style reconcile that makes local and
cloud "two backends for one app." Now possible because both backends (SQLite
local, Postgres cloud) exist and are verified.

## Model — append-mostly union + metadata last-write-wins
- **Versions are immutable** (drift adds a version, never overwrites). So the
  merge is a **union of versions by id** — a design that exists on either side
  always survives. This is what makes sync safe: no byte-merge, nothing lost.
- Rounds / concepts / annotations likewise **union by id**.
- **Mutable metadata** (names, order/position, starred, visible, status,
  selects, resolved flags, project meta) is resolved **last-write-wins at
  project granularity**: the side whose `projects.updated_at` is newer wins for
  rows present on both sides. The other side's *unique* rows are still merged in.

### Known limitation (documented, not a bug)
Project-level LWW is coarse: star on the older side + rename on the newer side in
the same window → the older star loses (the *design* is never lost, only the
star). **Field-level LWW** needs per-row `updated_at` columns — that's the next
refinement, and a genuine product call (how granular should conflict resolution
be?). For now this is the conservative never-lose-a-design rule.

## Code
- `lib/sync.ts`
  - `mergeManifests(a, b, {preferA})` — **pure**, the heavily-tested core.
    Handles null sides (first push), union at every level, LWW for the winner,
    versions re-sorted by number.
  - `syncProject(a, b, client, project)` — store-generic orchestrator: read both,
    pick winner by `modifiedAt`, merge, write the merged result to **both** so
    they converge. Idempotent.
  - `SyncStore` interface — any backend pair (local/cloud/…) can be synced.

## Verified
- `tests/sync.test.ts` — 10 tests: null handling, version union, cloud-only
  concept/round preserved, metadata LWW (label + star, both winner directions),
  unique-row metadata survives, annotation union + resolved LWW, version sort,
  and 3 orchestration tests (convergence, first-push, idempotency).
- `bin/sync-verify.ts` — **real** local SQLite ↔ **real** test Supabase: first
  push, divergent drift on BOTH sides → union converges to v1+v2+v3, re-sync
  no-op. Ran green.
- Full suite: `npm test` = **36/36**, `tsc --noEmit` clean.

## Not yet wired
- A UI "Sync" button / CLI in the app (the workspaces phase) — `syncProject` is
  ready for it; needs the two real stores constructed with the logged-in user.
- Field-level LWW (per-row `updated_at`) — see limitation above.
