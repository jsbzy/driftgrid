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

- [ ] `cloud` **Sync-overwrite guard** — `npm run push` / Sync silently clobbers the cloud copy with local state. Fine for one careful user; data loss for everyone else. Compare a last-synced marker against the cloud manifest before writing; require `--force` (CLI) / explicit confirm (UI) when cloud is newer. _(Found dogfooding 2026-07-09: the storyboard now lives in two places with no conflict signal.)_
- [ ] `web` **Document PATs + headless push publicly** — the `dg_pat_` flow (account → access tokens → `npm run push -- <client>/<project> --share`) is the agent story ("your agent ships designs straight to the web") and it's invisible. README section + docs.driftgrid.ai page.
- [ ] `ux` **Onboarding friction pass** — replay of the 2026-07-09 dogfooding session as a fresh user: token minting fails with a raw Postgres error when the migration is missing (needs a human message), the account page doesn't explain what a PAT is for, no guidance on local-vs-cloud project "home", `/admin` vs `/review` vs `/s/` modes are unlabeled in the UI.
- [ ] `web` **Define + publish the new-user funnel** — two lanes: WEB (sign up on driftgrid.ai, free tier, zero install — most accessible) and LOCAL (git clone, free OSS, agent-first). PAT is the bridge from local → web. Needs a written flow before promotion so the README/landing tell one coherent story.
- [ ] `web` **Cloud thumbnails are broken on Vercel** — `/api/thumbs-generate` writes to the ephemeral `projects/` fs and renders via `file://` (app/api/thumbs-generate/route.ts:55-85); cloud dashboards get blank/broken tiles. Options: push locally-generated `.thumbs/*.webp` during sync (cheap, works today) and/or a cloud render path via `@sparticuz/chromium` reading from Storage. _(Audit 2026-07-09.)_
- [ ] `ux` **Seed a demo project for new cloud users** — fresh signups land on an empty dashboard ("No shared projects yet"); copy the bundled demo into `{userId}/demo/...` on first login (or a shared read-only demo) so there's something to explore before installing anything. _(Audit 2026-07-09.)_
- [ ] `cloud` **Review + merge Phases 1–4** — SQLite + Postgres backends, manifest→DB mapper, DB↔DB Sync, parity tests. Already built on `feat/cloud-schema`, behind a flag. (Blocked by the update-from-main card above.)
- [ ] `web` **Finish + merge marketing PRs #2 & #3** (em-dash sweep; hero-voice / branching differentiator) — both still Draft. Quick wins.
- [ ] `sec` **Decision: scrub RecovryAI client IP from git history.** Removed at HEAD in #4, still retrievable from history (commits `9c6bcbc`, `7c8edd1`, `3cb3aee`). Full removal = history rewrite + force-push a public repo. Go / no-go.
- [ ] `web` **Decision: keep `CLOUD-FOUNDATION.md` / `docs/SHOW-HN.md` public?**

## 🔵 Later — the rebuild + launch (CLOUD-FOUNDATION phases 5–8)

- [ ] `cloud` **In-browser project creation** — **in review: PR #12** (dual-mode `lib/create-project`, Dashboard New Project UI, raw-HTML paste lane). Post-merge acceptance: create→add_version→share on driftgrid.ai with a real PAT.
- [ ] `cloud` **Phase 5 — Web MCP** — **in review: PR #12** (`/api/mcp`, stateless streamable HTTP, PAT auth, 7 tools; see docs/MCP.md). Follow-ups below.
- [ ] `cloud` **MCP OAuth for claude.ai web** — claude.ai custom connectors require OAuth (dynamic client registration); PAT headers cover Claude Code / Codex / Cursor but not claude.ai web. Needed for the "connect from any chat" story.
- [ ] `debt` **Smoke phase for `/api/mcp`** — the endpoint is hand-verified (full loop, local mode); wants a phase in bin/smoke.ts so regressions surface.
- [ ] `ux` **Cloud thumbnails for cloud-born projects** — PR #10 covers pushed projects (local generates + uploads); projects created in the browser still have no tiles until a cloud render path (`@sparticuz/chromium` reading from Storage) exists.
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

- [x] `cloud` **Personal access tokens + headless push (PR #9)** — `dg_pat_` tokens (hashed at rest, mint/revoke on `/account`), `resolveCloudUser` accepts JWT or PAT on `verify`/`push`/`share`, and `npm run push -- <client>/<project> --share` pushes a project to the cloud with no browser session. Migration applied to prod + verified end-to-end (storyboard pushed headless) 2026-07-09. _(agent memory: `headless-push-pat.md`)_
- [x] `ops` **Rotated the exposed test Supabase key** — deleted the leaked `default` secret key on the `twhanwpskndjgkmnfxav` ("Driftgrid test") project; a fresh secret key replaces it. 2026-07-02.
- [x] `sec` **profiles + cloud_annotations RLS** — restored RLS on both (prod had drifted with it off, leaking emails + Stripe IDs to the public key). `profiles` gets back its owner-scoped read/update policies; `cloud_annotations` is deny-all except service-role. Applied + verified on prod 2026-07-02 (anon read now returns `[]`). _(agent memory: `prod-rls-gaps.md`)_
- [x] `sec` **PR #5** — actually closed the `share_links` anon-enumeration hole (RLS enabled on prod; the #4 migration was a no-op + failed to apply). Applied + verified on prod 2026-07-01.
- [x] `sec` `cloud` `debt` **PR #4** — pre-prod sweep: account-takeover (`/connect`) fix, share-revocation bypass fix, slug/path-traversal guards, prod PDF export fix, manifest-write integrity, thumbnail concurrency cap, Stripe webhook retry, repo hygiene, CI lint+smoke jobs. Merged + deployed 2026-07-01.
