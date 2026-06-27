-- ============================================================================
-- DriftGrid Cloud — Phase 1: relational structure schema ("Path 2")
-- ----------------------------------------------------------------------------
-- Mirrors the manifest.json hierarchy into Postgres tables so that structure,
-- comments (annotations), and share state can live in a transactional store
-- instead of a single mutable JSON file. See CLOUD-FOUNDATION.md.
--
--   manifest.rounds[].concepts[].versions[].annotations[]
--        ▼            ▼            ▼            ▼
--     rounds  ←  concepts  ←  versions  ←  annotations   (all → projects.user_id)
--
-- SCOPE (Phase 1): this migration is ADDITIVE scaffolding. NOTHING in the app
-- reads or writes these tables yet — the file-model (manifest.json in Supabase
-- Storage / on disk) remains the source of truth until Phase 3 repoints the
-- API routes. Apply to a local/branch DB only; do NOT `supabase db push` to
-- prod without explicit owner approval (prod is live, with live Stripe).
--
-- KEY DECISIONS (see PHASE-1-NOTES.md for the full rationale):
--   * Every row keeps a surrogate uuid PK for stable FKs, AND the manifest's
--     own string id ("concept-open", "v-open-1", "round-1") as `manifest_id`.
--     That string id is load-bearing — it is embedded in HTML file paths,
--     thumbnail paths (.thumbs/${concept.id}-${version.id}.webp), and the
--     existing client_comments rows — so it must round-trip exactly.
--   * version.parent_id and annotation.parent_id are stored as the parent's
--     manifest_id (text), NOT a uuid FK, so a tree can be inserted in any order
--     and the manifest round-trips with zero rewriting.
--   * HTML content stays in files (disk / Supabase Storage). versions.file_path
--     references it. No HTML in the DB.
--   * Low-traffic / leaf collections (workingSets, documents, legacy top-level
--     comments, clientEdits) are parked in projects.extras (jsonb) for a
--     lossless round-trip; they can be normalized into their own tables later.
--   * versions are append-mostly: file_path/content never change once written
--     (drift always adds a new version). starred / visible / thumbnail ARE
--     mutable metadata, so there is intentionally NO immutability trigger.
--     Ordering is explicit via (number, created) so a later sync phase can
--     UNION versions across replicas deterministically.
-- ============================================================================

create extension if not exists pgcrypto;  -- gen_random_uuid()

-- =======================================================
-- PROJECTS — one row per (user, client, project)
-- =======================================================
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  client_slug  text not null,
  project_slug text not null,
  name         text not null,
  canvas       text not null,
  output       text check (output is null or output in ('vector', 'image', 'hybrid')),
  links        jsonb not null default '{}'::jsonb,
  -- manifest's own project.created (distinct from row insert time below)
  created      timestamptz,
  -- lossless parking lot for project-level collections not yet normalized:
  -- { workingSets, documents, comments, clientEdits }
  extras       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, client_slug, project_slug)
);

create index if not exists projects_user_idx on public.projects (user_id);

alter table public.projects enable row level security;

create policy "projects_owner_all" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- =======================================================
-- ROUNDS — manifest.rounds[]
-- =======================================================
create table if not exists public.rounds (
  id                  uuid primary key default gen_random_uuid(),
  project_id          uuid not null references public.projects(id) on delete cascade,
  manifest_id         text not null,                    -- 'round-1'
  ord                 int  not null default 0,          -- source array index (display fidelity)
  number              int  not null,
  name                text not null,
  status              text not null default 'open' check (status in ('open', 'closed')),
  note                text,
  created             timestamptz,                      -- round.createdAt
  closed_at           timestamptz,                      -- round.closedAt
  selects             jsonb not null default '[]'::jsonb,   -- [{conceptId, versionId}]
  document_ids        jsonb,                            -- round.documentIds
  summary_document_id text,                             -- round.summaryDocumentId
  extras              jsonb not null default '{}'::jsonb,   -- untyped manifest keys (lossless overflow)
  created_at          timestamptz not null default now(),
  unique (project_id, manifest_id)
);

create index if not exists rounds_project_idx on public.rounds (project_id, number);

alter table public.rounds enable row level security;

create policy "rounds_owner_all" on public.rounds
  for all using (
    exists (select 1 from public.projects p
            where p.id = rounds.project_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.projects p
            where p.id = rounds.project_id and p.user_id = auth.uid())
  );

-- =======================================================
-- CONCEPTS — manifest.rounds[].concepts[]
-- =======================================================
create table if not exists public.concepts (
  id            uuid primary key default gen_random_uuid(),
  round_id      uuid not null references public.rounds(id) on delete cascade,
  manifest_id   text not null,                          -- 'concept-open'
  ord           int  not null default 0,                -- source array index (display fidelity)
  slug          text,
  label         text not null,
  description   text not null default '',
  position      int  not null default 0,
  visible       boolean not null default true,
  branched_from jsonb,                                  -- {conceptId, versionId}
  canvas        jsonb,                                  -- string | {type,width,height}
  extras        jsonb not null default '{}'::jsonb,     -- untyped manifest keys (lossless overflow)
  created_at    timestamptz not null default now(),
  unique (round_id, manifest_id)
);

create index if not exists concepts_round_idx on public.concepts (round_id, position);

alter table public.concepts enable row level security;

create policy "concepts_owner_all" on public.concepts
  for all using (
    exists (select 1 from public.rounds r
            join public.projects p on p.id = r.project_id
            where r.id = concepts.round_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.rounds r
            join public.projects p on p.id = r.project_id
            where r.id = concepts.round_id and p.user_id = auth.uid())
  );

-- =======================================================
-- VERSIONS — manifest.rounds[].concepts[].versions[]  (append-mostly)
-- =======================================================
create table if not exists public.versions (
  id          uuid primary key default gen_random_uuid(),
  concept_id  uuid not null references public.concepts(id) on delete cascade,
  manifest_id text not null,                            -- 'v-open-1'
  ord         int  not null default 0,                  -- source array index (display fidelity)
  number      int  not null,
  file_path   text not null,                            -- 'open/v1.html' (HTML lives in files)
  parent_id   text,                                     -- parent version's manifest_id (nullable)
  changelog   text not null default '',
  visible     boolean not null default true,
  starred     boolean not null default false,
  thumbnail   text,                                     -- '.thumbs/${concept}-${version}.webp'
  created     timestamptz,                              -- version.created
  extras      jsonb not null default '{}'::jsonb,       -- untyped manifest keys (lossless overflow)
  created_at  timestamptz not null default now(),
  unique (concept_id, manifest_id)
);

-- ordering is explicit (number, created) for deterministic sync union later
create index if not exists versions_concept_idx on public.versions (concept_id, number, created);

alter table public.versions enable row level security;

create policy "versions_owner_all" on public.versions
  for all using (
    exists (select 1 from public.concepts c
            join public.rounds r on r.id = c.round_id
            join public.projects p on p.id = r.project_id
            where c.id = versions.concept_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.concepts c
            join public.rounds r on r.id = c.round_id
            join public.projects p on p.id = r.project_id
            where c.id = versions.concept_id and p.user_id = auth.uid())
  );

-- =======================================================
-- ANNOTATIONS — manifest …versions[].annotations[]
-- (the live designer↔agent comment/pin threads — comments become DB rows)
-- =======================================================
create table if not exists public.annotations (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references public.versions(id) on delete cascade,
  manifest_id  text not null,                           -- annotation.id
  ord          int  not null default 0,                 -- source array index (display fidelity)
  x            numeric,
  y            numeric,
  element      text,
  body         text not null,                           -- annotation.text
  author       text not null,
  is_client    boolean not null default false,
  is_agent     boolean not null default false,
  resolved     boolean not null default false,
  parent_id    text,                                    -- parent annotation's manifest_id
  status       text check (status is null or status in ('running')),
  submitted_at timestamptz,
  attachments  jsonb,
  provider     text,
  created      timestamptz,                             -- annotation.created
  extras       jsonb not null default '{}'::jsonb,      -- untyped manifest keys (lossless overflow)
  created_at   timestamptz not null default now(),
  unique (version_id, manifest_id)
);

create index if not exists annotations_version_idx on public.annotations (version_id, created);

alter table public.annotations enable row level security;

create policy "annotations_owner_all" on public.annotations
  for all using (
    exists (select 1 from public.versions v
            join public.concepts c on c.id = v.concept_id
            join public.rounds r on r.id = c.round_id
            join public.projects p on p.id = r.project_id
            where v.id = annotations.version_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.versions v
            join public.concepts c on c.id = v.concept_id
            join public.rounds r on r.id = c.round_id
            join public.projects p on p.id = r.project_id
            where v.id = annotations.version_id and p.user_id = auth.uid())
  );

-- =======================================================
-- RELATE EXISTING TABLES (additive, nullable — back-compat preserved)
-- ----------------------------------------------------------------------------
-- share_links + client_comments predate this schema and key off string
-- (client, project) + manifest concept_id/version_id. We add nullable uuid FKs
-- so new code can link them to the structured rows without breaking any
-- existing insert path (legacy rows simply leave the new columns null).
-- =======================================================
alter table public.share_links
  add column if not exists project_id uuid references public.projects(id) on delete cascade;

create index if not exists share_links_project_idx on public.share_links (project_id);

alter table public.client_comments
  add column if not exists version_ref uuid references public.versions(id) on delete cascade;

create index if not exists client_comments_version_ref_idx on public.client_comments (version_ref);
