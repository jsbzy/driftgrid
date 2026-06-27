# DriftGrid Cloud — Foundation Spec

> **Status:** Approved *direction* (2026-06-26), not yet built. The current app is still the local `manifest.json` file-model; this is the target architecture we build toward in sequenced phases. **Local keeps working the entire way.** Each build phase gets its own detailed plan when started.

## Context

DriftGrid is local-first today: project structure lives in `manifest.json` + HTML files on disk, served by a local dev server; cloud (Supabase) is a bolted-on mirror for sharing. The Sync feature + local-first desktop app (shipped 2026-06-26) exposed two things: (1) the `manifest.json`-as-source-of-truth model is the root of the recurring corruption bugs, and (2) the local/cloud split is encoded awkwardly across the app. The decision: evolve DriftGrid into **one coherent system — local-first kept, cloud + an agent MCP added** — on a model that fixes corruption at the root and maps cleanly to a business.

**Guiding priority:** agent-first interaction, with commenting and sharing as the core loop. The architecture serves that.

## The model: local + cloud as interchangeable backends

The desktop/web app is a **client** (think Git client / VS Code / Obsidian). It opens either:
- a **local workspace** — a folder on disk (HTML files + a local SQLite index), offline, runs on your machine, **free**; or
- a **cloud workspace** — your account on Supabase (Postgres + Storage), accessible anywhere, multi-user, **paid**.

Same UI, same actions, same MCP — you choose per session and can switch. **Sync** moves a project between them (`git push`/`pull`-style). Local-first is never lost; local and cloud become two backends for one app.

## Data model — "Path 2": a DB everywhere

Relational data (structure, comments, shares) lives in a database; content (HTML) stays as files.

- **Structure** (projects / rounds / concepts / versions), **comments**, **share state** → **DB**: SQLite locally, Postgres in the cloud (+ RLS for multi-tenancy).
- **HTML versions** → **files**: on disk locally, in Supabase Storage in the cloud, referenced by version rows. Agents still generate HTML files.
- **`manifest.json`** → a **derived export** (for git/portability), not the source of truth.

**Why (agent / comment / share lens):**
- *Agent-first* — the MCP sits on a transactional store; concurrent agents are safe and state is queryable, identical local and cloud. Files make the MCP race-prone (the corruption).
- *Commenting* — comments are relational + concurrent + queried; a DB is their home everywhere.
- *Sharing* — cloud-native; publishing is a DB→DB push, client comments sync back as rows.
- The model is **append-mostly** (drift never overwrites — it adds a version), so sync is a **union of versions**, not a byte-merge problem; only metadata (order/starred/comments) needs a last-write-wins tiebreak.

## Three clients over one data layer

```
   Desktop / web app        Web MCP            Sync
   (humans, via API)        (agents)          (DB ↔ DB)
          └──────────────┬──────┴────────────────┘
                         ▼
     Data layer:  SQLite (local) / Postgres (cloud) + HTML files
```

- **App UI** — humans drift/star/comment/share via the app's API routes. No MCP needed.
- **Web MCP** — the existing local MCP tool surface, hosted + per-user auth, on the cloud DB. Additive (agents could hit the raw API); the premium hook ("your agents work your projects from anywhere, multi-user").
- **Sync** — git-style DB↔DB push/pull, append-mostly union.

## Business model — freemium: full product free, gate scale

**Don't gate the aha (sharing a round with a client — the magic moment); gate the *scale*.** Free users get the COMPLETE loop so they feel the value, and you charge as they grow (PLG: Slack/Figma/Notion all give full features free and gate seats/teams/scale).
- **Free — the entire product, small scale:** everything local (full editor, agents, drift) + enough cloud to feel it — sync + share, capped (a couple active share links / one live cloud project); share pages carry a subtle "Made with DriftGrid" (free marketing).
- **Paid (Pro) — scale + collaboration + agents:** unlimited sharing/cloud projects; the full hosted **cloud workspace** (all projects managed, web app, multi-device — the "management feature set"); the **web MCP** (agents from anywhere); **multi-user / teams**; branding removal / custom share domain.
- **Upgrade triggers are moments of success** — more clients, a teammate, agents-everywhere. Even free shares cost a little hosting, so the cap bounds acquisition cost, not stinginess.
- Local-first underpins the economics: free runs on the user's hardware (≈ zero cost to you) and is the adoption driver. Stripe + a Pro tier are already live. **Exact caps/prices: TBD.**

## Build sequence (high level — each phase is its own detailed plan later)

1. **Schema** — Postgres tables (projects/rounds/concepts/versions/comments/shares) + RLS; SQLite mirror; `lib/storage` gains a DB backend alongside the file one.
2. **Migration** — `manifest.json` → rows (mechanical; the manifest *is* the row hierarchy), local + cloud, with `manifest-doctor`-style validation.
3. **Repoint the app** — API routes (`/api/iterate`, `/api/branch`, `/api/annotations`, `/api/share`) read/write the DB instead of manifest files. HTML still to disk/Storage.
4. **Sync** — git-style DB↔DB push/pull (append-mostly union; metadata last-write-wins).
5. **Web MCP** — host the MCP tool surface on the cloud DB; per-user auth; multi-tenant.
6. **Workspaces UI** — open/switch local vs cloud workspaces in the app.
7. **Billing** — freemium: free = full product at small scale (capped shares/projects, branded share pages); Pro gates *scale* — unlimited + hosted cloud workspace + web MCP + teams + branding removal.
8. **Dashboard reimagine** — folds in here (the unified visual library — thumbnails, status-first, New Project, kill the `LocalServerBar` — on the new foundation, no throwaway sync-state infra).

## Risks / open questions

- **Migration risk** — `manifest.json` → rows is mechanical but load-bearing; validate with the doctor; keep `.bak` exports.
- **Sync conflicts** — mitigated by append-mostly; nail the metadata tiebreak rule (order/starred/comments → last-write-wins by timestamp).
- **Scope** — multi-week foundational build. Sequence it so **local keeps working throughout** (the file backend stays until the DB backend is proven, then becomes the export path).
- **The dashboard reimagine waits for this** — building it on the file-model first would throw away the sync-state infra. Its model-agnostic visual parts could ship early for interim progress.
- **Open:** exact pricing/tiers + free-cloud limits; whether local also moves to SQLite (Path 2 full) or keeps `manifest.json` as the local source with a derived DB (Path 2 lite) — leaning full SQLite for one clean model.
