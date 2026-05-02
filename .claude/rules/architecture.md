---
description: DriftGrid architecture context — stack, structure, current state
---

# DriftGrid Architecture Context

## Stack
- Next.js 14 (App Router) on Vercel
- Supabase (Postgres + Auth + Storage)
- Stripe (subscriptions, Pro tier — **live** keys, not test)
- Domain: driftgrid.ai, docs at docs.driftgrid.ai

## Key Directories
- `app/` — Next.js routes (app router)
- `lib/` — shared utilities, Supabase client, Stripe helpers
- `components/` — React components
- `supabase/migrations/` — database migrations
- `bin/` — CLI scripts (init, ops, deploy helpers)
- `projects/` — user design project files (HTML, brand, manifest.json)

## Current State (update weekly)
- **Auth:** email + password + password reset flow. No OAuth.
- **Billing:** Stripe live, Pro tier active. Free tier = 3 boards.
- **Sharing:** one pinned URL per round, public `/share/[slug]` pages, "Last published" timestamps.
- **OSS:** README, LICENSE, CONTRIBUTING scaffolded. Public surface: OG meta, nav links, Pro copy.
- **Manifesto:** page was built then reverted (both `/manifesto` route and nav link removed). Do not re-add without Jeff's OK.

## Deployment
- Push to `main` → auto-deploy via Vercel
- Supabase migrations run via `supabase db push`
- Stripe env vars are **live** — `clear-stripe-ids` and `demote-pro` scripts exist for ops only

## Watch Out
- `/share/[slug]` has no auth gate — URLs are public
- Slug validation + webhook ownership checks were recently hardened — don't regress these
- Shared manifest cache exists — invalidate on manifest writes
- The `clear-stripe-ids` script is for test→live switchover — **never run in prod**

### Rounds-alias footgun
Rounds-enabled projects store concepts inside `manifest.rounds[N].concepts[]`. The top-level `manifest.concepts` is a convenience alias that is **empty or stale** on rounds projects. Any code that iterates `manifest.concepts` directly will silently get `[]` and return 404 / no-op.

- Use `findConceptAndVersion()` helper in `app/api/annotations/route.ts` (searches across all rounds).
- Or the round-aware `getActiveConcepts` / `withUpdatedConcepts` in `lib/hooks/useManifestMutations.ts`.
- Fixed in GET/POST/DELETE/PATCH `/api/annotations` and `useUndoManager` (commit 26e7481, 2026-04-22). Other endpoints may still have it — audit before trusting.

### React + iframe src
Setting `iframe.src` via JSX attribute does not reliably re-navigate the iframe (React reuses the DOM node). Fix: imperative `iframeRef.current.src = url` inside a `useEffect` keyed on `src`. See `components/HtmlFrame.tsx`.

### Dev server lifecycle
`npm run dev` launched via the Agent tool's `run_in_background` is terminated when the agent task completes. For durability: `nohup npm run dev > /tmp/driftgrid-dev.log 2>&1 & disown`, or have the user run it. Kill orphan servers with `lsof -ti:3000 | xargs kill -9` before starting.

### Prod vs localhost
`driftgrid.ai` is prod. Local changes only appear there after merge to `main` → Vercel deploy completes. When the user reports "not seeing the fix," check deploy status before debugging code.

## Grid vs Frame UX Contract

- **Grid** = structural. Drift (`D`), branch (`Shift+D`), reorder (`Alt+Arrow`), star (`S`), copy/paste (`Cmd+C`/`Cmd+V`). **No comment UI in grid.** `D` from grid is a silent copy (stays in grid).
- **Frame** = conversation. Prompts and comments happen here. `D` from frame = copy + stays in frame + auto-enables pin annotation.
- Multi-select (`Shift+Arrow`) + `D` drifts each selected frame into its own concept in one pass. Single "Drifted N frames" toast. No batch undo.
- Resolved pins are fully invisible when comment mode is off. A muted "N RESOLVED" counter signals the history exists.
- `components/GridPromptInput.tsx` is unreachable as of commit 26e7481 — safe to delete in a follow-up.

## Testing

- **Smoke test:** `bin/smoke.ts` — API-level suite across 15 phases covering every endpoint. Run before every beta release:
  ```bash
  npm run dev            # in one terminal
  npm run smoke          # in another
  ```
  Flags: `--phase N`, `--verbose`, `--no-cleanup`. Stripe phase behind `SMOKE_INCLUDE_STRIPE=1`. Creates/tears down projects under `__smoke__/`. See `tests/SMOKE.md` for the full phase list and how to add cases.
- **Regression guards** are flagged inline with `// REGRESSION GUARD: <bug>` comments — do not delete these without confirming the original bug stayed fixed. Currently guarded: path traversal, share dedup, rounds-alias drift/annotations, SSE watcher leak.
- **Unit tests:** `tests/*.test.ts` (canvas-layout, filter-manifest, manifest, typecheck) — run directly via tsx.
