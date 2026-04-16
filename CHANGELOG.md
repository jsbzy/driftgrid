# Changelog

All notable changes to DriftGrid are tracked here. Dates are YYYY-MM-DD. This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added
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
- Free tier updated: one shareable project (all rounds), unlimited local projects.
- Pro tier copy rewritten as benefits ("Share every round of every project") rather than bullets.
- `share_links` table now has `updated_at` + `round_number` columns, and a partial unique index on (user_id, client, project, round_number) — fixes the bug where every republish was inserting a new row.
- `createCloudShare` and `/api/cloud/share-status` are now round-aware.
- Stripe SDK now uses `createFetchHttpClient()` for reliability on Vercel.
- Manifest cache is now shared (`lib/manifest-cache.ts`) and invalidated on every `writeManifest` so thumbnails don't serve stale data.
- Annotation popup placement is now viewport-aware and flips above/below with a dynamic max height.

### Fixed
- Stripe webhook now scopes profile updates by `user_id` from subscription metadata, with logging when an event matches no rows.
- Share creation no longer duplicates rows on republish (caused 13+ active tokens per project before the unique index).
- Thumbnail cache write failures are now logged instead of silently swallowed.
- `.single()` swapped to `.maybeSingle()` in Stripe checkout's profile lookup so missing rows don't throw.
- `interval` param in Stripe checkout is now whitelisted to `month` | `year`.

### Security
- Slug validation on all user-supplied `client` / `project` segments that hit the filesystem.
- Unique constraint on `profiles.stripe_subscription_id` so webhook updates can't accidentally touch multiple rows.
