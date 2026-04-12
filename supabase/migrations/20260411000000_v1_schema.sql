-- ============================================================================
-- DriftGrid v1 — Core cloud schema
-- ----------------------------------------------------------------------------
-- Sets up the three tables v1 needs:
--   1. profiles       — extends auth.users with tier + Stripe info
--   2. share_links    — tokens for project shares (1 lifetime on free tier)
--   3. client_comments — anonymous comments left on shared projects
--
-- Project manifest.json and HTML files continue to live in Supabase Storage
-- bucket `projects`, scoped to {userId}/{client}/{project}/... — no table
-- needed for project metadata (the manifest IS the metadata).
-- ============================================================================

-- =======================================================
-- PROFILES — extends auth.users
-- =======================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  display_name text,
  tier text not null default 'free' check (tier in ('free', 'pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text,
  subscription_status text,  -- null | 'trialing' | 'active' | 'canceled' | 'past_due' | 'incomplete'
  subscription_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_read_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Service role bypasses RLS (used by webhooks + server-side admin client).

-- =======================================================
-- Auto-create profile on signup
-- =======================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =======================================================
-- Shared updated_at trigger helper
-- =======================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =======================================================
-- SHARE_LINKS — tokens for shared projects
-- =======================================================
-- Free tier: 1 lifetime share (checked via count query when creating).
-- Pro tier: unlimited.
-- A single user can have one active share per (client, project) combo.
-- =======================================================
create table public.share_links (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  client text not null,
  project text not null,
  round_number int,         -- optional: pin share to a specific round. null = follow latest.
  mode text not null default 'full' check (mode in ('full', 'review')),
  created_at timestamptz not null default now(),
  expires_at timestamptz,   -- null = never expires (Jeff: shares live forever until revoked)
  is_active boolean not null default true,
  unique (user_id, client, project)
);

alter table public.share_links enable row level security;

create policy "share_links_read_own" on public.share_links
  for select using (auth.uid() = user_id);

create policy "share_links_insert_own" on public.share_links
  for insert with check (auth.uid() = user_id);

create policy "share_links_update_own" on public.share_links
  for update using (auth.uid() = user_id);

create policy "share_links_delete_own" on public.share_links
  for delete using (auth.uid() = user_id);

-- Anonymous clients can read active shares by token (no auth).
-- Token lookup is safe because tokens are unguessable.
create policy "share_links_read_public_active" on public.share_links
  for select using (is_active = true);

create index share_links_user_idx on public.share_links (user_id);

-- =======================================================
-- CLIENT_COMMENTS — anonymous comments on share links
-- =======================================================
-- Client enters a display name on first visit (localStorage on their browser).
-- No authentication required. Comments attach to a specific version by
-- concept_id + version_id. Threading via parent_comment_id.
-- =======================================================
create table public.client_comments (
  id uuid primary key default gen_random_uuid(),
  share_token text not null references public.share_links(token) on delete cascade,
  concept_id text not null,
  version_id text not null,
  author_name text not null,
  body text not null,
  x_rel numeric check (x_rel is null or (x_rel >= 0 and x_rel <= 1)),
  y_rel numeric check (y_rel is null or (y_rel >= 0 and y_rel <= 1)),
  element_selector text,
  parent_comment_id uuid references public.client_comments(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

alter table public.client_comments enable row level security;

-- Anyone can read comments for an active share link (clients and owner both).
create policy "client_comments_read_for_active_share" on public.client_comments
  for select using (
    exists (
      select 1 from public.share_links s
      where s.token = client_comments.share_token and s.is_active = true
    )
  );

-- Anyone can insert comments on an active share link.
create policy "client_comments_insert_for_active_share" on public.client_comments
  for insert with check (
    exists (
      select 1 from public.share_links s
      where s.token = client_comments.share_token and s.is_active = true
    )
  );

-- Only project owners can update/delete their clients' comments, via service role
-- (e.g. resolving a comment server-side). No policy needed — admin client bypasses RLS.

create index client_comments_token_idx on public.client_comments (share_token);
create index client_comments_target_idx on public.client_comments (share_token, concept_id, version_id);
create index client_comments_created_idx on public.client_comments (created_at desc);

-- =======================================================
-- STORAGE BUCKET — projects
-- =======================================================
-- This SQL creates the bucket if it doesn't exist. Apply via the Supabase
-- Dashboard or include it in the migration. All project files (manifest.json,
-- HTML files, thumbnails) live under {user_id}/{client}/{project}/... in this
-- bucket. Access is gated by server-side admin client, not RLS, so we don't
-- declare per-file policies here — the server fetches on behalf of the user.
-- =======================================================
insert into storage.buckets (id, name, public)
values ('projects', 'projects', false)
on conflict (id) do nothing;

-- Note: Storage bucket access policies are managed server-side via the
-- admin service role key. Users never connect to Storage directly from
-- the browser in v1. If we ever want direct client uploads (e.g. image
-- assets), we'd add policies here.

-- =======================================================
-- HELPER FUNCTION — count active shares for a user
-- =======================================================
-- Used by Free tier paywall check: if this returns > 0 for a free user and
-- they try to create another share, block it and prompt upgrade.
-- =======================================================
create or replace function public.count_user_shares(u_id uuid)
returns int
language sql
stable
as $$
  select count(*)::int from public.share_links
  where user_id = u_id and is_active = true;
$$;
