# DriftGrid Roadmap

> **What this is:** the system of record for DriftGrid's build — the full plan, kanban-style.
> **What this is NOT:** an active-work tracker. Only the 2–3 cards you're actually working right now belong on the cross-project `WORK.md` window; this file holds the whole roadmap.
> Columns are status. Tags are track. No assignees or due dates on purpose — a board with upkeep starts to lie. Move a line between sections as its status changes.
>
> Tracks: `cloud` (the CLOUD-FOUNDATION rebuild) · `ux` (design / dashboard) · `web` (hosted app + marketing + launch) · `sec` (security) · `ops` (infra/accounts) · `debt` (cleanup)

---

## 🔴 Now — do next

- [ ] `ops` **Preview sandbox** — Vercel Preview deploys currently hit the **prod** DB + **live** Stripe. Stand up a throwaway Supabase + Stripe-test, scope Preview-only env vars in Vercel so PR previews are safe to poke.
- [ ] `cloud` **⚠️ Blocker: bring `feat/cloud-schema` up to date with `main`.** That branch predates the security work in #4/#5 — merging it as-is would **revert** the share-token fix and re-add the RecovryAI client files. Rebase/merge main in *before* any further cloud work.

## 🟡 Next

- [ ] `cloud` **Review + merge Phases 1–4** — SQLite + Postgres backends, manifest→DB mapper, DB↔DB Sync, parity tests. Already built on `feat/cloud-schema`, behind a flag. (Blocked by the update-from-main card above.)
- [ ] `web` **Finish + merge marketing PRs #2 & #3** (em-dash sweep; hero-voice / branching differentiator) — both still Draft. Quick wins.
- [ ] `sec` **Decision: scrub RecovryAI client IP from git history.** Removed at HEAD in #4, still retrievable from history (commits `9c6bcbc`, `7c8edd1`, `3cb3aee`). Full removal = history rewrite + force-push a public repo. Go / no-go.
- [ ] `web` **Decision: keep `CLOUD-FOUNDATION.md` / `docs/SHOW-HN.md` public?**

## 🔵 Later — the rebuild + launch (CLOUD-FOUNDATION phases 5–8)

- [ ] `cloud` **Phase 5 — Web MCP.** Host the MCP tool surface on the cloud DB; per-user auth; multi-tenant. The "your agents work your projects from anywhere" premium hook.
- [ ] `cloud` **Phase 6 — Workspaces UI.** Open / switch between a local and a cloud workspace in the app (Git-client model).
- [ ] `cloud` **Phase 7 — Billing polish.** Freemium caps (share links / cloud projects); fill Stripe lifecycle gaps: `trialing` / `past_due` / `invoice.payment_failed`.
- [ ] `ux` **Phase 8 — Dashboard reimagine.** Unified visual library — thumbnails, status-first, New Project, kill `LocalServerBar`. Built on the new DB foundation. _(This is the "design UX" track.)_
- [ ] `ux` **Mobile polish** — client + designer phone UI. Reconcile the older `claude/driftgrud-mobile-planning` branch (likely superseded by the cloud line — confirm before reusing).
- [ ] `web` **Show-HN launch prep** (`docs/SHOW-HN.md`) + decide the public doc/OSS surface.

## 🧹 Tech debt (deferred from PR #4)

- [ ] `debt` **ETag TOCTOU redesign** — compare-inside-serializer.
- [ ] `debt` **Lint burn-down** — ~74 `any` + react-hooks warnings (currently downgraded to warnings so CI stays green on new errors).
- [ ] `debt` **Stale branch cleanup** — `refactor/v1` (empty), `beta-review-baseline`, `mobile-planning` (if superseded).

## ✅ Shipped

- [x] `ops` **Rotated the exposed test Supabase key** — deleted the leaked `default` secret key on the `twhanwpskndjgkmnfxav` ("Driftgrid test") project; a fresh secret key replaces it. 2026-07-02.
- [x] `sec` **profiles + cloud_annotations RLS** — restored RLS on both (prod had drifted with it off, leaking emails + Stripe IDs to the public key). `profiles` gets back its owner-scoped read/update policies; `cloud_annotations` is deny-all except service-role. Applied + verified on prod 2026-07-02 (anon read now returns `[]`). _(agent memory: `prod-rls-gaps.md`)_
- [x] `sec` **PR #5** — actually closed the `share_links` anon-enumeration hole (RLS enabled on prod; the #4 migration was a no-op + failed to apply). Applied + verified on prod 2026-07-01.
- [x] `sec` `cloud` `debt` **PR #4** — pre-prod sweep: account-takeover (`/connect`) fix, share-revocation bypass fix, slug/path-traversal guards, prod PDF export fix, manifest-write integrity, thumbnail concurrency cap, Stripe webhook retry, repo hygiene, CI lint+smoke jobs. Merged + deployed 2026-07-01.
