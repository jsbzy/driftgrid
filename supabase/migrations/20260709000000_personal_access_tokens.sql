-- =======================================================
-- Personal access tokens — headless auth for the cloud API.
-- =======================================================
--
-- Motivation: every cloud write path (push, sync, share) authenticates with a
-- short-lived Supabase JWT obtained through a *browser* sign-in popup
-- (lib/cloud-auth.ts). That makes headless / CLI / agent pushes impossible —
-- there is no browser to run the popup. PATs are the account-level, long-lived
-- credential that fills that gap: mint once in the browser, then any non-browser
-- client (the `driftgrid push` CLI, an agent on a dev box) presents it as a
-- Bearer token and the cloud resolves it to the owning user.
--
-- Security posture mirrors share_links (see 20260411000000_v1_schema.sql):
--   • Only the SHA-256 hash of the token is stored — the plaintext is shown to
--     the user exactly once at creation and is unrecoverable afterwards. A DB
--     leak yields hashes, not usable tokens.
--   • RLS is enabled with owner-scoped read/delete policies. Anon/authenticated
--     get nothing without matching auth.uid(); the service-role admin client
--     (every legitimate app path — lib/cloud-auth-server.ts, the tokens API,
--     the push/share/verify routes) bypasses RLS as before.
--   • gen_random_uuid lives in the `extensions` schema (pgcrypto) and MUST be
--     schema-qualified — the migration role's search_path omits `extensions`, so
--     the bare name fails to resolve (SQLSTATE 42883). Same lesson as
--     20260701000000_harden_share_links.sql.

create table public.personal_access_tokens (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                 -- human label, e.g. 'dev-box push'
  token_hash text unique not null,    -- sha256(hex) of the plaintext token; plaintext never stored
  token_prefix text not null,         -- first chars for display, e.g. 'dg_pat_ab12cd' — NOT sensitive
  created_at timestamptz not null default now(),
  last_used_at timestamptz,           -- bumped on each successful auth (best-effort)
  expires_at timestamptz,             -- null = never expires
  revoked_at timestamptz              -- null = active; set on revoke (soft delete for audit)
);

alter table public.personal_access_tokens enable row level security;

-- Owner may read their own token metadata (never the hash in practice — the API
-- selects a metadata-only column list) and revoke/delete their own tokens.
create policy "pat_read_own" on public.personal_access_tokens
  for select using (auth.uid() = user_id);

create policy "pat_delete_own" on public.personal_access_tokens
  for delete using (auth.uid() = user_id);

-- No insert/update policies: tokens are only ever minted and mutated by the
-- service-role admin client (which bypasses RLS). Clients cannot forge rows.

create index personal_access_tokens_user_idx on public.personal_access_tokens (user_id);
create index personal_access_tokens_hash_idx on public.personal_access_tokens (token_hash);
