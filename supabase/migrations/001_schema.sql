-- DriftGrid Cloud Schema
-- Migration 001: Core tables for multi-tenant cloud platform

-- ============================================================
-- WORKSPACES (multi-tenancy root)
-- ============================================================
CREATE TABLE workspaces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text UNIQUE NOT NULL,
  plan            text NOT NULL DEFAULT 'free',  -- free, pro, team
  stripe_customer_id      text,
  stripe_subscription_id  text,
  storage_used_bytes      bigint NOT NULL DEFAULT 0,
  storage_limit_bytes     bigint NOT NULL DEFAULT 524288000,  -- 500MB free tier
  review_link_limit       int NOT NULL DEFAULT 1,             -- 1 for free tier
  designer_seat_limit     int NOT NULL DEFAULT 1,             -- 1 for free tier
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name    text,
  avatar_url      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- WORKSPACE MEMBERS
-- ============================================================
CREATE TABLE workspace_members (
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role            text NOT NULL DEFAULT 'designer',  -- owner, admin, designer, viewer
  invited_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- ============================================================
-- API KEYS (for MCP server authentication)
-- ============================================================
CREATE TABLE api_keys (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name            text NOT NULL DEFAULT 'Default',
  key_hash        text NOT NULL,        -- SHA-256 hash of the API key
  key_prefix      text NOT NULL,        -- First 8 chars for identification (e.g., "dg_abc12...")
  last_used_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_slug     text NOT NULL,
  project_slug    text NOT NULL,
  name            text NOT NULL,
  canvas          text NOT NULL DEFAULT 'desktop',
  links           jsonb NOT NULL DEFAULT '{}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  archived_at     timestamptz,
  UNIQUE (workspace_id, client_slug, project_slug)
);

-- ============================================================
-- CONCEPTS
-- ============================================================
CREATE TABLE concepts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  round_id        uuid,  -- nullable, for round scoping
  label           text NOT NULL,
  slug            text,
  description     text NOT NULL DEFAULT '',
  position        int NOT NULL DEFAULT 0,
  visible         boolean NOT NULL DEFAULT true,
  canvas_override jsonb,  -- optional per-concept canvas
  branched_from   jsonb,  -- { conceptId, versionId }
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- VERSIONS (each maps to an HTML file in R2)
-- ============================================================
CREATE TABLE versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id      uuid NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  number          int NOT NULL,
  file_key        text NOT NULL,        -- R2 object key
  thumb_key       text,                 -- R2 thumbnail key
  parent_id       uuid REFERENCES versions(id),
  changelog       text NOT NULL DEFAULT '',
  visible         boolean NOT NULL DEFAULT true,
  starred         boolean NOT NULL DEFAULT false,
  file_size       int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ROUNDS
-- ============================================================
CREATE TABLE rounds (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  number          int NOT NULL,
  name            text NOT NULL,
  note            text,
  closed_at       timestamptz,
  selects         jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- ANNOTATIONS (feedback pins on versions)
-- ============================================================
CREATE TABLE annotations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  x               real,
  y               real,
  element         text,
  text            text NOT NULL,
  author          text NOT NULL DEFAULT 'designer',
  is_client       boolean NOT NULL DEFAULT false,
  is_agent        boolean NOT NULL DEFAULT false,
  parent_id       uuid REFERENCES annotations(id),
  resolved        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- CLIENT EDITS (data-drift-editable changes)
-- ============================================================
CREATE TABLE client_edits (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id      uuid NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  field_name      text NOT NULL,
  original_text   text,
  edited_text     text,
  author          text,
  status          text NOT NULL DEFAULT 'pending',  -- pending, accepted, rejected
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- WORKING SETS
-- ============================================================
CREATE TABLE working_sets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name            text NOT NULL,
  selections      jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- REVIEW LINKS (shareable URLs for clients)
-- ============================================================
CREATE TABLE review_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  slug            text UNIQUE NOT NULL,
  password_hash   text,                 -- bcrypt hash, null = no password
  expires_at      timestamptz,
  round_id        uuid,                 -- scope to specific round
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- REVIEW VIEWS (analytics)
-- ============================================================
CREATE TABLE review_views (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_link_id  uuid NOT NULL REFERENCES review_links(id) ON DELETE CASCADE,
  version_id      uuid REFERENCES versions(id) ON DELETE SET NULL,
  viewer_hash     text,                 -- hashed IP for uniqueness, not stored raw
  viewer_agent    text,
  duration_ms     int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_projects_workspace ON projects(workspace_id);
CREATE INDEX idx_projects_client ON projects(workspace_id, client_slug);
CREATE INDEX idx_concepts_project ON concepts(project_id);
CREATE INDEX idx_concepts_round ON concepts(round_id);
CREATE INDEX idx_versions_concept ON versions(concept_id);
CREATE INDEX idx_annotations_version ON annotations(version_id);
CREATE INDEX idx_client_edits_version ON client_edits(version_id);
CREATE INDEX idx_working_sets_project ON working_sets(project_id);
CREATE INDEX idx_review_links_project ON review_links(project_id);
CREATE INDEX idx_review_links_slug ON review_links(slug);
CREATE INDEX idx_review_views_link ON review_views(review_link_id);
CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Increment storage usage atomically
CREATE OR REPLACE FUNCTION increment_storage(p_workspace_id uuid, p_bytes bigint)
RETURNS void AS $$
BEGIN
  UPDATE workspaces
  SET storage_used_bytes = storage_used_bytes + p_bytes,
      updated_at = now()
  WHERE id = p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
DECLARE
  new_workspace_id uuid;
  workspace_slug text;
BEGIN
  -- Create profile
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- Create default workspace
  workspace_slug := 'ws-' || substring(NEW.id::text, 1, 8);
  INSERT INTO workspaces (name, slug)
  VALUES (
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'My Workspace'),
    workspace_slug
  )
  RETURNING id INTO new_workspace_id;

  -- Add user as owner
  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for auto-creating profile + workspace on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workspaces_updated_at
  BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
