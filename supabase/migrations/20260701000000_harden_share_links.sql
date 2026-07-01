-- =======================================================
-- Harden share_links: close anonymous enumeration + capture the token default.
-- =======================================================

-- 1. Drop the anonymous public-read policy.
--
-- The original `share_links_read_public_active` policy allowed any holder of the
-- (public, browser-shipped) anon key to `select` every active row — leaking all
-- tokens, user_ids, clients, and projects across all users. The intent was
-- "look a share up by token", but RLS `for select using (is_active = true)`
-- permits full-table listing, not just point lookups.
--
-- Every public token resolution in the app goes through the service-role admin
-- client (see lib/share-token.ts, lib/auth.ts, app/api/s/**), which bypasses RLS
-- entirely, so no legitimate path depends on this policy.
drop policy if exists "share_links_read_public_active" on public.share_links;

-- 2. Give share_links.token a cryptographically-random default.
--
-- v1_schema.sql declared `token text primary key` with no default; prod had a
-- default added out-of-band, so migrations drifted from the live schema and a
-- fresh environment could not insert shares (every insert omits `token`). This
-- captures the intended generator so migrations reproduce prod.
--
-- 24 random bytes → 48 hex chars: unguessable and URL-safe.
alter table public.share_links
  alter column token set default encode(gen_random_bytes(24), 'hex');
