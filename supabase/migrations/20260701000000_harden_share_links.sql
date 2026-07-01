-- =======================================================
-- Harden share_links: close anonymous enumeration + capture the token default.
-- =======================================================

-- 1. Close anonymous read access to share_links.
--
-- The (public, browser-shipped) anon key could `select` every row — leaking all
-- tokens, user_ids, clients, and projects across all users. Verified live on
-- prod 2026-07-01: the anon key returned full token+user_id rows.
--
-- The original design assumed a `share_links_read_public_active` RLS policy was
-- the culprit, but prod has RLS *disabled* on this table entirely, with a blanket
-- `anon`/`authenticated` SELECT grant — so dropping the policy alone fixes
-- nothing. The real fix is to enable RLS: with zero policies, both anon and
-- authenticated are denied all direct access.
--
-- Every legitimate path (share creation, resolution, comments — see
-- lib/share-token.ts, lib/auth.ts, app/api/share/**, app/api/cloud/**) uses the
-- service-role admin client, which bypasses RLS entirely. No app path depends on
-- anon/authenticated access to this table.
drop policy if exists "share_links_read_public_active" on public.share_links;
alter table public.share_links enable row level security;

-- 2. Give share_links.token a cryptographically-random default.
--
-- v1_schema.sql declared `token text primary key` with no default; prod had a
-- default (`gen_random_bytes(16)`) added out-of-band, so migrations drifted from
-- the live schema and a fresh environment could not insert shares (every insert
-- omits `token`). This captures the intended generator so migrations reproduce
-- prod, and widens it to 24 bytes.
--
-- gen_random_bytes lives in the `extensions` schema (pgcrypto). It must be
-- schema-qualified: the migration role's search_path does not include
-- `extensions`, so the bare name fails to resolve (SQLSTATE 42883).
--
-- 24 random bytes → 48 hex chars: unguessable and URL-safe.
alter table public.share_links
  alter column token set default encode(extensions.gen_random_bytes(24), 'hex');
