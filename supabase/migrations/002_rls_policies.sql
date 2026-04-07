-- DriftGrid Cloud RLS Policies
-- Migration 002: Row-Level Security for multi-tenant isolation

-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE concepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE working_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_views ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper: check if current user is a member of a workspace
-- ============================================================
CREATE OR REPLACE FUNCTION is_workspace_member(p_workspace_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if current user is owner/admin of a workspace
CREATE OR REPLACE FUNCTION is_workspace_admin(p_workspace_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES
-- ============================================================
CREATE POLICY "Users can read their own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Allow reading profiles of workspace co-members
CREATE POLICY "Users can read co-member profiles"
  ON profiles FOR SELECT
  USING (
    id IN (
      SELECT wm.user_id FROM workspace_members wm
      WHERE wm.workspace_id IN (
        SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- ============================================================
-- WORKSPACES
-- ============================================================
CREATE POLICY "Members can read their workspaces"
  ON workspaces FOR SELECT
  USING (is_workspace_member(id));

CREATE POLICY "Admins can update their workspaces"
  ON workspaces FOR UPDATE
  USING (is_workspace_admin(id));

-- Insert handled by handle_new_user trigger (SECURITY DEFINER)

-- ============================================================
-- WORKSPACE MEMBERS
-- ============================================================
CREATE POLICY "Members can read workspace membership"
  ON workspace_members FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "Admins can manage workspace membership"
  ON workspace_members FOR INSERT
  WITH CHECK (is_workspace_admin(workspace_id));

CREATE POLICY "Admins can remove workspace members"
  ON workspace_members FOR DELETE
  USING (is_workspace_admin(workspace_id));

-- ============================================================
-- API KEYS
-- ============================================================
CREATE POLICY "Users can read their own API keys"
  ON api_keys FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can create API keys for their workspaces"
  ON api_keys FOR INSERT
  WITH CHECK (user_id = auth.uid() AND is_workspace_member(workspace_id));

CREATE POLICY "Users can delete their own API keys"
  ON api_keys FOR DELETE
  USING (user_id = auth.uid());

-- ============================================================
-- PROJECTS
-- ============================================================
CREATE POLICY "Members can read workspace projects"
  ON projects FOR SELECT
  USING (is_workspace_member(workspace_id));

CREATE POLICY "Members can create projects"
  ON projects FOR INSERT
  WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "Members can update projects"
  ON projects FOR UPDATE
  USING (is_workspace_member(workspace_id));

CREATE POLICY "Admins can delete projects"
  ON projects FOR DELETE
  USING (is_workspace_admin(workspace_id));

-- ============================================================
-- CONCEPTS (scoped through project → workspace)
-- ============================================================
CREATE POLICY "Members can read concepts"
  ON concepts FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE is_workspace_member(workspace_id)
    )
  );

CREATE POLICY "Members can manage concepts"
  ON concepts FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE is_workspace_member(workspace_id)
    )
  );

-- ============================================================
-- VERSIONS (scoped through concept → project → workspace)
-- ============================================================
CREATE POLICY "Members can read versions"
  ON versions FOR SELECT
  USING (
    concept_id IN (
      SELECT c.id FROM concepts c
      JOIN projects p ON c.project_id = p.id
      WHERE is_workspace_member(p.workspace_id)
    )
  );

CREATE POLICY "Members can manage versions"
  ON versions FOR ALL
  USING (
    concept_id IN (
      SELECT c.id FROM concepts c
      JOIN projects p ON c.project_id = p.id
      WHERE is_workspace_member(p.workspace_id)
    )
  );

-- ============================================================
-- ROUNDS (scoped through project → workspace)
-- ============================================================
CREATE POLICY "Members can read rounds"
  ON rounds FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM projects WHERE is_workspace_member(workspace_id)
    )
  );

CREATE POLICY "Members can manage rounds"
  ON rounds FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE is_workspace_member(workspace_id)
    )
  );

-- ============================================================
-- ANNOTATIONS
-- Public read for annotations on versions accessible via review links.
-- Write access for workspace members + anonymous review link viewers.
-- ============================================================
CREATE POLICY "Members can manage annotations"
  ON annotations FOR ALL
  USING (
    version_id IN (
      SELECT v.id FROM versions v
      JOIN concepts c ON v.concept_id = c.id
      JOIN projects p ON c.project_id = p.id
      WHERE is_workspace_member(p.workspace_id)
    )
  );

-- Anyone with a valid review link can read annotations
CREATE POLICY "Review link viewers can read annotations"
  ON annotations FOR SELECT
  USING (
    version_id IN (
      SELECT v.id FROM versions v
      JOIN concepts c ON v.concept_id = c.id
      JOIN projects p ON c.project_id = p.id
      JOIN review_links rl ON rl.project_id = p.id
      WHERE rl.expires_at IS NULL OR rl.expires_at > now()
    )
  );

-- Anyone can insert annotations (client reviewers, no auth)
-- The API layer validates review link access before allowing inserts
CREATE POLICY "Anyone can create annotations via API"
  ON annotations FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- CLIENT EDITS
-- ============================================================
CREATE POLICY "Members can read client edits"
  ON client_edits FOR SELECT
  USING (
    version_id IN (
      SELECT v.id FROM versions v
      JOIN concepts c ON v.concept_id = c.id
      JOIN projects p ON c.project_id = p.id
      WHERE is_workspace_member(p.workspace_id)
    )
  );

-- Anyone can submit client edits (via review link, validated at API layer)
CREATE POLICY "Anyone can submit client edits via API"
  ON client_edits FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Members can manage client edits"
  ON client_edits FOR UPDATE
  USING (
    version_id IN (
      SELECT v.id FROM versions v
      JOIN concepts c ON v.concept_id = c.id
      JOIN projects p ON c.project_id = p.id
      WHERE is_workspace_member(p.workspace_id)
    )
  );

-- ============================================================
-- WORKING SETS
-- ============================================================
CREATE POLICY "Members can manage working sets"
  ON working_sets FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE is_workspace_member(workspace_id)
    )
  );

-- ============================================================
-- REVIEW LINKS
-- ============================================================
-- Members can manage review links for their projects
CREATE POLICY "Members can manage review links"
  ON review_links FOR ALL
  USING (
    project_id IN (
      SELECT id FROM projects WHERE is_workspace_member(workspace_id)
    )
  );

-- Anyone can look up a review link by slug (needed for public access)
CREATE POLICY "Anyone can read review links by slug"
  ON review_links FOR SELECT
  USING (true);

-- ============================================================
-- REVIEW VIEWS (analytics)
-- ============================================================
-- Members can read analytics for their review links
CREATE POLICY "Members can read review analytics"
  ON review_views FOR SELECT
  USING (
    review_link_id IN (
      SELECT rl.id FROM review_links rl
      JOIN projects p ON rl.project_id = p.id
      WHERE is_workspace_member(p.workspace_id)
    )
  );

-- Anyone can insert view events (tracked when clients view review pages)
CREATE POLICY "Anyone can log view events"
  ON review_views FOR INSERT
  WITH CHECK (true);
