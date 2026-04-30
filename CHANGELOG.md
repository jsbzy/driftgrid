# Changelog

All notable changes to DriftGrid are tracked here. Dates are YYYY-MM-DD. This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/).

> **Cutting the launch release:** rename `[Unreleased]` below to `[1.0.0] — YYYY-MM-DD`, bump `package.json` `"version"` to `1.0.0`, then start a fresh `[Unreleased]` block above for ongoing work.

## [Unreleased]

### Added
- **Multi-provider routing.** Annotations can be tagged for `claude`, `codex`, or `gemini` via a pill picker in the comment popup. Each provider only acts on its own queue (or untagged prompts).
- **Plan mode for prompts.** Toggle "Plan first" in the comment popup to prefix the prompt with `[plan]` — agent discusses approaches in chat before drifting, then posts one summary reply to the DriftGrid thread.
- **gpt-image-2 image generation** via `bin/gen-image.js`. Saves directly into `projects/{client}/{project}/...` for export-safe embedding.
- **Last edited timestamp** on every project card on the dashboard, derived from the most recent version or annotation in each manifest.
- **Sticky close button** on annotation thread popups — the × stays reachable while scrolling long threads.
- **Skeleton + shimmer** on grid cards while their thumbnails are still loading (no more "dead-looking" blank cards on big projects).
- **AGENTS.md** — canonical cross-provider agent doc (forked from CLAUDE.md, restructured by frequency-of-use). CLAUDE.md slimmed to a pointer.
- **MCP setup docs** for Claude Code, Codex CLI, and Gemini CLI inside AGENTS.md, plus an explicit fallback path for non-MCP agents.
- **`copyTextSafely` utility** — modern Clipboard API with a legacy `execCommand` fallback so Copy buttons work on insecure dev origins.
- One pinned share URL per round — republishing within a round reuses the same token, moving to a new round mints a new URL (old round URLs stay alive for historical review).
- `Last published X ago` timestamp on Dashboard share cards and in the SharePanel header.
- Password reset flow — `/forgot-password` requests a magic link, `/reset-password` sets a new password.
- Stripe live mode wired end-to-end: checkout, webhook, portal, and the `/pricing` upgrade path.
- `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue templates, PR template, this changelog.
- `OG` image + proper meta tags on the landing page for shareable previews.
- `Docs` and `Pricing` links in the landing nav and footer.
- `lib/slug.ts` — reusable slug validator, applied to 12 API routes to prevent path traversal.
- Cycling playful status messages during cloud publish (spinner + rotating copy) replacing the confusing "0 of 62 files" counter.

### Changed
- **Default version workflow flipped.** Agents now create a new version on every change unless explicitly told to edit in place ("edit directly", "no new version", etc.).
- **Cloud dashboard project names are now clickable** to enter the local admin view (previously only the Share button was active).
- **Tour overlay** shows literal `Shift` text instead of the ⇧ glyph so first-time users don't misread it as an up arrow.
- **"Copy for Agent" payload** now leads with a `Frame URL: ...` line and embeds the user's actual host (read from `window.location.origin`).
- **Copy for Agent on existing annotations** now picks up any unsaved reply draft from the input box and includes it as the `CURRENT REQUEST` block.
- Free tier updated: one shareable project (all rounds), unlimited local projects.
- Pro tier copy rewritten as benefits ("Share every round of every project") rather than bullets.
- `share_links` table now has `updated_at` + `round_number` columns, and a partial unique index on (user_id, client, project, round_number) — fixes the bug where every republish was inserting a new row.
- `createCloudShare` and `/api/cloud/share-status` are now round-aware.
- Stripe SDK now uses `createFetchHttpClient()` for reliability on Vercel.
- Manifest cache is now shared (`lib/manifest-cache.ts`) and invalidated on every `writeManifest` so thumbnails don't serve stale data.
- Annotation popup placement is now viewport-aware and flips above/below with a dynamic max height.

### Fixed
- **Rage-click bug on Copy for Agent** — clicking quickly saved 12+ duplicate annotations because there was no in-flight guard and no visible "Copied" feedback. Added `inFlightRef` lock + 600ms hold so the success state is visible before the popup closes.
- **Double-click on grid cards no longer cascades** through highlight → z4 zoom → frame entry. Single-clicks are deferred 220ms; a follow-up dblclick cancels the pending click and goes straight to frame view.
- **Tailwind v4 was scanning `_archive/` and stale `.next.*` directories**, generating broken CSS rules from binary thumbnail bytes (`.bg-[var(--SA)]`) that crashed the parser. Renamed `_archive` → `.archive`; stale Next.js caches now live outside the project root.
- Stripe webhook now scopes profile updates by `user_id` from subscription metadata, with logging when an event matches no rows.
- Share creation no longer duplicates rows on republish (caused 13+ active tokens per project before the unique index).
- Thumbnail cache write failures are now logged instead of silently swallowed.
- `.single()` swapped to `.maybeSingle()` in Stripe checkout's profile lookup so missing rows don't throw.
- `interval` param in Stripe checkout is now whitelisted to `month` | `year`.

### Removed
- `components/GridPromptInput.tsx` — unreachable since the grid/frame UX split (commit `26e7481`).
- 5 one-off `.mjs` debug scripts at the repo root (`capture-landing.mjs`, `check-height.mjs`, `full-shot.mjs`, `measure-local.mjs`, `qa-v2.mjs`).
- 2 stale agent worktrees in `.claude/worktrees/`.
- Brief experiment with `driftgrid.local` custom hostname — reverted because the Clipboard API requires a secure context (HTTPS or literal `localhost`/`127.0.0.1`) and silently failed on plain-HTTP custom hosts.

### Security
- Slug validation on all user-supplied `client` / `project` segments that hit the filesystem.
- Unique constraint on `profiles.stripe_subscription_id` so webhook updates can't accidentally touch multiple rows.
