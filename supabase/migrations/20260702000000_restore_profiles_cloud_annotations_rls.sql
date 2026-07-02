-- =======================================================
-- Restore RLS on profiles + cloud_annotations (prod drift repair).
-- =======================================================
--
-- Same failure mode as the share_links enumeration hole (see
-- 20260701000000_harden_share_links.sql): the shipped schema enabled RLS, but
-- prod drifted with RLS *disabled* out-of-band, leaving these tables readable by
-- any holder of the public (browser-shipped) anon key. Verified live 2026-07-01:
-- the anon key could read profiles + cloud_annotations rows.
--
-- Every legitimate access path uses the service-role admin client, which
-- bypasses RLS entirely (lib/auth.ts getProfile, lib/subscription.ts,
-- app/api/stripe/**, app/api/cloud/**). The signup trigger handle_new_user is
-- SECURITY DEFINER and also bypasses RLS. So restoring RLS closes the leak
-- without touching any working flow.

-- 1. profiles — restore the owner-scoped policies from v1_schema.sql.
--    A logged-in user may read/update only their own row; the anon key gets
--    nothing; service-role (webhooks, server admin) bypasses RLS as before.
alter table public.profiles enable row level security;

drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- 2. cloud_annotations — created out-of-band on prod; not defined by any
--    migration and not referenced by any code. Enable RLS with no policies:
--    anon/authenticated are denied all direct access; the service-role admin
--    client (the only thing that would ever touch it) bypasses RLS. If a future
--    cloud phase adopts this table, that migration adds the proper policies.
alter table public.cloud_annotations enable row level security;
