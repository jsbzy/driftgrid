-- ============================================================================
-- DriftGrid v1 — client_comments table (follow-up to v1_schema.sql)
-- ----------------------------------------------------------------------------
-- Splits the client_comments table into its own migration in case the first
-- migration aborted partway. Uses IF NOT EXISTS / DROP IF EXISTS so it can be
-- re-run safely.
-- ============================================================================

-- Ensure pgcrypto is available for gen_random_uuid() (Supabase usually has it
-- pre-installed, but this is safe to run).
create extension if not exists pgcrypto;

-- =======================================================
-- CLIENT_COMMENTS — anonymous comments on share links
-- =======================================================
create table if not exists public.client_comments (
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

-- Drop existing policies if they exist (idempotent re-run support)
drop policy if exists "client_comments_read_for_active_share" on public.client_comments;
drop policy if exists "client_comments_insert_for_active_share" on public.client_comments;

create policy "client_comments_read_for_active_share" on public.client_comments
  for select using (
    exists (
      select 1 from public.share_links s
      where s.token = client_comments.share_token and s.is_active = true
    )
  );

create policy "client_comments_insert_for_active_share" on public.client_comments
  for insert with check (
    exists (
      select 1 from public.share_links s
      where s.token = client_comments.share_token and s.is_active = true
    )
  );

-- Indexes (idempotent)
create index if not exists client_comments_token_idx on public.client_comments (share_token);
create index if not exists client_comments_target_idx on public.client_comments (share_token, concept_id, version_id);
create index if not exists client_comments_created_idx on public.client_comments (created_at desc);

-- =======================================================
-- HELPER FUNCTION — count active shares for a user
-- =======================================================
-- Re-creating in case it didn't land with the first migration.
-- =======================================================
create or replace function public.count_user_shares(u_id uuid)
returns int
language sql
stable
as $$
  select count(*)::int from public.share_links
  where user_id = u_id and is_active = true;
$$;

-- =======================================================
-- STORAGE BUCKET — projects (idempotent, safe to re-run)
-- =======================================================
insert into storage.buckets (id, name, public)
values ('projects', 'projects', false)
on conflict (id) do nothing;
