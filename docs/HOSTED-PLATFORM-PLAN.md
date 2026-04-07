# DriftGrid Cloud — Hosted Platform Plan

> Deep architectural plan for the paid, hosted version of DriftGrid.
> Local-first stays free (MIT). Cloud is a feature you turn on — not a separate product.

---

## Strategic Decisions (Locked In)

1. **Beachhead customer:** Freelance designers and small studios (1-5 people) using AI coding tools. Agencies and enterprise are expansion segments, not launch targets.
2. **Launch strategy:** Open-source + cloud ship simultaneously as one story. Cloud is visible from the first `npx driftgrid` experience.
3. **Monetization gate:** Review links (sharing with clients). Not exports, not storage, not features that work locally.
4. **BYO infrastructure:** Supported at launch. Documented path for self-hosting with your own Supabase + R2. Signals "no lock-in" to developer audience.
5. **Upgrade UX:** Seamless in-context upgrade when hitting review link limit. One-click Stripe checkout, not a settings page redirect.

---

## Product Positioning

**Local DriftGrid (free, open-source):**
- `npx driftgrid` — runs on your machine
- Filesystem storage, single-user, localhost only
- Full feature set including export (PDF/PPTX/HTML)
- "Share" button in UI prompts cloud connection

**DriftGrid Cloud (paid, cloud-enabled):**
- Same local tool + cloud sharing layer
- Shareable review links, client annotations, team workspaces
- Push local designs to cloud for client presentation
- Managed (`app.driftgrid.com`) or BYO Supabase + R2

**Tagline:** *"Built for the speed of AI design. Share with anyone."*

---

## Pricing Model: Freemium — Gate is Sharing

### Free Tier
- Full local product (unlimited projects, export, everything)
- 1 workspace
- 1 active review link (with DriftGrid branding)
- 500MB cloud storage
- 1 designer seat
- Unlimited client reviewers (no client accounts needed)

### Pro ($14/mo or $140/year)
- Unlimited review links
- Custom review link slugs (`app.driftgrid.com/r/acme/rebrand`)
- Remove DriftGrid branding from review pages
- 10GB cloud storage
- Priority thumbnail generation
- Up to 3 designer seats, $9/mo per additional

### Team ($12/designer/mo, 3-seat minimum = $36/mo floor)
- Everything in Pro
- 50GB cloud storage
- Custom domain (`reviews.youragency.com`)
- SSO (Google, SAML)
- Workspace-level brand defaults
- Analytics (view counts, time-on-page, feedback heatmaps)
- API access for CI/CD integration

> **Enterprise:** Not listed at launch. "Contact us" link appears for teams >20 seats. Added when inbound demand warrants it.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    Next.js App                       │
│              (same codebase, mode flag)              │
│                                                      │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │ Dashboard  │  │  Viewer   │  │  Review (client) │ │
│  └───────────┘  └───────────┘  └──────────────────┘ │
│                       │                              │
│              ┌────────┴────────┐                     │
│              │   API Layer     │                     │
│              │  (route.ts)     │                     │
│              └────────┬────────┘                     │
│                       │                              │
│          ┌────────────┼────────────┐                 │
│          │            │            │                 │
│  ┌───────┴──────┐ ┌──┴───┐ ┌─────┴──────┐         │
│  │  Storage     │ │  DB  │ │   Auth     │          │
│  │  Adapter     │ │      │ │   Layer    │          │
│  └───────┬──────┘ └──┬───┘ └─────┬──────┘         │
└──────────┼────────────┼───────────┼─────────────────┘
           │            │           │
    ┌──────┴──────┐  ┌──┴────┐  ┌──┴──────┐
    │ Cloudflare  │  │ Supa- │  │ Supabase│
    │ R2 / S3     │  │ base  │  │ Auth    │
    │ (files)     │  │ (PG)  │  │ (OAuth) │
    └─────────────┘  └───────┘  └─────────┘
```

### Key Principle: Storage Adapter Pattern

The biggest migration challenge is replacing ~20 API routes that do `fs.readFile()` / `fs.writeFile()`. Rather than rewriting every route, introduce a **storage adapter** that abstracts file operations:

```typescript
// lib/storage/adapter.ts
interface StorageAdapter {
  // Files (HTML designs, brand assets)
  readFile(path: string): Promise<Buffer>;
  writeFile(path: string, data: Buffer | string): Promise<void>;
  copyFile(src: string, dest: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
  listFiles(dir: string): Promise<string[]>;
  
  // Manifest (structured data)
  getManifest(client: string, project: string): Promise<Manifest>;
  putManifest(client: string, project: string, manifest: Manifest): Promise<void>;
  
  // Thumbnails
  getThumbnail(key: string): Promise<Buffer | null>;
  putThumbnail(key: string, data: Buffer): Promise<void>;
}

// lib/storage/local.ts   — wraps current fs calls (for local mode)
// lib/storage/cloud.ts   — wraps Supabase + R2 (for cloud mode)
```

**Runtime selection:** `process.env.DRIFTGRID_MODE === 'cloud'` picks the cloud adapter; default is local.

This lets us:
- Keep local mode working exactly as-is
- Port routes incrementally (swap `fs.readFile` → `storage.readFile`)
- Test cloud mode without breaking local
- Eventually support hybrid (local editing → cloud sync)

---

## Database Schema (Supabase / PostgreSQL)

### Core Tables

```sql
-- Multi-tenancy
CREATE TABLE workspaces (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,         -- URL-safe identifier
  plan        text NOT NULL DEFAULT 'free', -- free, pro, team, enterprise
  stripe_customer_id  text,
  stripe_subscription_id text,
  storage_used_bytes  bigint DEFAULT 0,
  storage_limit_bytes bigint DEFAULT 524288000, -- 500MB free tier
  created_at  timestamptz DEFAULT now()
);

-- Users & auth (extends Supabase auth.users)
CREATE TABLE profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id),
  display_name text,
  avatar_url   text,
  created_at   timestamptz DEFAULT now()
);

-- Workspace membership
CREATE TABLE workspace_members (
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role         text NOT NULL DEFAULT 'designer', -- owner, admin, designer, viewer
  invited_at   timestamptz DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

-- Projects (replaces client/project filesystem structure)
CREATE TABLE projects (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  client_slug  text NOT NULL,
  project_slug text NOT NULL,
  name         text NOT NULL,
  canvas       jsonb NOT NULL DEFAULT '"desktop"',
  links        jsonb DEFAULT '{}',
  created_at   timestamptz DEFAULT now(),
  archived_at  timestamptz,
  UNIQUE (workspace_id, client_slug, project_slug)
);

-- Concepts
CREATE TABLE concepts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  round_id     uuid, -- nullable, for round scoping
  label        text NOT NULL,
  slug         text,
  description  text,
  position     int NOT NULL DEFAULT 0,
  visible      boolean DEFAULT true,
  canvas       jsonb, -- optional per-concept override
  created_at   timestamptz DEFAULT now()
);

-- Versions (each is an HTML file in object storage)
CREATE TABLE versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id   uuid REFERENCES concepts(id) ON DELETE CASCADE,
  number       int NOT NULL,
  file_key     text NOT NULL,     -- R2/S3 object key
  thumb_key    text,              -- R2/S3 thumbnail key
  parent_id    uuid REFERENCES versions(id),
  changelog    text,
  visible      boolean DEFAULT true,
  starred      boolean DEFAULT false,
  file_size    int,
  created_at   timestamptz DEFAULT now()
);

-- Rounds
CREATE TABLE rounds (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  number       int NOT NULL,
  name         text,
  closed_at    timestamptz,
  selects      jsonb DEFAULT '[]',
  created_at   timestamptz DEFAULT now()
);

-- Annotations (feedback pins)
CREATE TABLE annotations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   uuid REFERENCES versions(id) ON DELETE CASCADE,
  x            real,
  y            real,
  text         text NOT NULL,
  author       text,
  is_client    boolean DEFAULT false,
  is_agent     boolean DEFAULT false,
  parent_id    uuid REFERENCES annotations(id),
  resolved     boolean DEFAULT false,
  created_at   timestamptz DEFAULT now()
);

-- Client edits (data-drift-editable changes)
CREATE TABLE client_edits (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id   uuid REFERENCES versions(id) ON DELETE CASCADE,
  field_name   text NOT NULL,
  original     text,
  edited       text,
  status       text DEFAULT 'pending', -- pending, accepted, rejected
  created_at   timestamptz DEFAULT now()
);

-- Working sets
CREATE TABLE working_sets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  name         text NOT NULL,
  selections   jsonb NOT NULL DEFAULT '[]',
  created_at   timestamptz DEFAULT now()
);

-- Review links (shareable URLs for clients)
CREATE TABLE review_links (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  slug         text UNIQUE NOT NULL,        -- e.g., "acme-rebrand-r2"
  password     text,                        -- optional password protection
  expires_at   timestamptz,
  round_id     uuid,                        -- scope to specific round
  created_at   timestamptz DEFAULT now()
);

-- Analytics (view tracking)
CREATE TABLE review_views (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_link_id uuid REFERENCES review_links(id) ON DELETE CASCADE,
  version_id   uuid REFERENCES versions(id),
  viewer_ip    inet,
  viewer_agent text,
  duration_ms  int,
  created_at   timestamptz DEFAULT now()
);
```

### Row-Level Security (RLS)

Every table gets RLS policies scoped to workspace membership:

```sql
-- Example: projects visible only to workspace members
CREATE POLICY "workspace_members_can_read_projects"
  ON projects FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members
      WHERE user_id = auth.uid()
    )
  );

-- Review links: anyone with the slug can read (no auth required)
CREATE POLICY "review_links_public_read"
  ON review_links FOR SELECT
  USING (true);
```

---

## Object Storage (Cloudflare R2)

**Why R2 over S3:** Zero egress fees (critical for serving HTML previews + thumbnails to clients), S3-compatible API, cheaper.

### Bucket Structure

```
driftgrid-files/
  {workspace_id}/
    {project_id}/
      html/
        {concept_id}/{version_id}.html
      thumbs/
        {version_id}.webp
        {version_id}-440w.webp
      brand/
        logo.svg
        assets/
          {filename}
```

### Serving Strategy

- **HTML designs:** Served through Next.js API route (not direct R2 URL) — allows edit script injection, auth checks, CORS headers
- **Thumbnails:** Served via R2 public URL with cache headers (immutable content-addressed keys)
- **Brand assets:** Served through API route (auth-gated)
- **Exports (PDF/PNG):** Generated on-demand, cached in R2 with TTL

### Upload Flow

```
Designer creates version via AI tool
  → AI writes HTML locally
  → MCP tool calls POST /api/iterate
  → API duplicates from previous version in R2
  → Returns new version path for AI to edit
  → AI edits via MCP or direct upload
  → PUT /api/html/{path} writes to R2
  → Thumbnail generated async (queue)
```

---

## Authentication (Supabase Auth)

### Auth Methods

| Method | Tier | Notes |
|--------|------|-------|
| Email + password | All | Default sign-up |
| Google OAuth | All | One-click for Gmail users |
| GitHub OAuth | All | Natural for developer designers |
| Magic link (email) | All | Passwordless option |
| SAML SSO | Team+ | For enterprise identity providers |

### Session Flow

```
1. User signs up → Supabase creates auth.users row
2. Trigger creates profiles row + default workspace
3. Supabase JWT stored in httpOnly cookie
4. Every API request validates JWT via Supabase middleware
5. RLS policies enforce workspace isolation at DB level
```

### Client Reviewers (No Account Required)

Clients access review links without signing up:

```
1. Designer generates review link: app.driftgrid.com/r/{slug}
2. Client opens link → no auth required (or optional password)
3. Client can view designs, leave annotations (stored with session cookie)
4. Client identity = name entered on first comment (stored in localStorage)
5. Analytics tracked per review_link (view counts, time-on-page)
```

This is critical — **never require clients to create accounts.** The friction kills adoption.

---

## Billing (Stripe)

### Integration Points

```typescript
// Stripe webhook handler: /api/webhooks/stripe
// Events to handle:
//   checkout.session.completed  → activate plan
//   customer.subscription.updated → change plan limits
//   customer.subscription.deleted → downgrade to free
//   invoice.payment_failed → grace period, then downgrade
```

### Subscription Flow

```
1. User clicks "Upgrade" in workspace settings
2. Redirect to Stripe Checkout (hosted page)
3. Stripe webhook fires on success
4. Update workspaces.plan + storage limits
5. Webhook on cancellation → schedule downgrade at period end
```

### Enforcement Points

| Limit | Where Enforced | Behavior |
|-------|---------------|----------|
| Project count | POST /api/create-project | Returns 403 + upgrade prompt |
| Storage | PUT /api/html, POST /api/iterate | Returns 413 + storage meter |
| Designer seats | Workspace invite flow | Returns 403 + upgrade prompt |
| Custom domain | Middleware | Falls back to app.driftgrid.com |
| Branding removal | Review page render | Conditional watermark |

### Metering

Track `storage_used_bytes` on every file write:
```typescript
// After R2 upload:
await supabase.rpc('increment_storage', { 
  workspace_id, 
  bytes: fileSize 
});
```

---

## API Layer Changes

### Current → Cloud Migration Map

| Current Route | Filesystem Ops | Cloud Equivalent |
|--------------|----------------|------------------|
| GET /api/manifest/{c}/{p} | `fs.readFile(manifest.json)` | `db.projects + db.concepts + db.versions` (composed) |
| PUT /api/manifest/{c}/{p} | `fs.writeFile(manifest.json)` | Individual DB table updates |
| GET /api/html/{c}/{p}/{path} | `fs.readFile(*.html)` | `r2.get(file_key)` |
| POST /api/iterate | `fs.copyFile()` + manifest write | `r2.copy()` + `db.versions.insert()` |
| POST /api/branch | `fs.mkdir()` + `fs.copyFile()` | `db.concepts.insert()` + `r2.copy()` |
| GET /api/thumbs/{path} | `fs.readFile(.thumbs/)` | `r2.get(thumb_key)` or generate |
| POST /api/annotations | Manifest array mutation | `db.annotations.insert()` |
| POST /api/rounds | HTML file copies + manifest | `r2.copy()` multiple + `db.rounds.insert()` |
| POST /api/bake-edits | `fs.readFile` + regex + `fs.writeFile` | `r2.get()` + transform + `r2.put()` |
| POST /api/export | Puppeteer render + `fs.readFile` | Same, but read from R2 |
| GET /api/clients | `fs.readdir()` recursive | `db.projects.select()` where workspace_id = X |
| POST /api/create-project | Multiple `fs.mkdir` + `fs.writeFile` | `db.projects.insert()` + R2 initial files |

### New Cloud-Only Routes

| Route | Purpose |
|-------|---------|
| POST /api/auth/signup | Supabase Auth sign-up |
| POST /api/auth/login | Supabase Auth login |
| GET /api/workspaces | List user's workspaces |
| POST /api/workspaces | Create workspace |
| POST /api/workspaces/{id}/invite | Invite team member |
| POST /api/review-links | Generate shareable review link |
| GET /api/r/{slug} | Resolve review link → project |
| POST /api/webhooks/stripe | Stripe subscription events |
| GET /api/analytics/{project} | View counts, feedback stats |
| POST /api/upload | Direct file upload (for non-AI workflows) |

---

## MCP Server for Cloud

The MCP server currently wraps localhost API calls. For cloud mode, it needs:

1. **Authentication:** MCP server stores an API key (per-workspace) that authenticates against the cloud API
2. **Remote URL:** `DRIFTGRID_URL=https://app.driftgrid.com` instead of localhost
3. **Upload support:** MCP tool to push HTML content directly to R2 via signed upload URL
4. **New tools:**
   - `share_project(project_id)` → generates review link
   - `get_analytics(project_id)` → view counts, feedback summary

### Local → Cloud Bridge

For designers who still want local AI editing but cloud hosting:

```
1. Designer runs `npx driftgrid login` → authenticates with cloud account
2. AI edits HTML locally in temp directory
3. MCP `create_version` tool uploads HTML to R2 via signed URL
4. Cloud manifest updated via API
5. Client sees new version instantly on review link
```

This is the "best of both worlds" — local AI speed, cloud sharing.

---

## Review Link System

The core monetization driver. The gate is the **second review link.**

### Upgrade Trigger Flow

```
1. Designer clicks "Share" on a project → first review link (free, branded)
2. Designer clicks "Share" on a second project → paywall
3. In-context upgrade modal: "Upgrade to Pro for unlimited sharing — $14/mo"
4. One-click Stripe Checkout (stays in DriftGrid UI, no redirect to settings)
5. Instant activation → second review link created
```

The upgrade moment must feel like unlocking, not blocking. Show the review link preview, let them see what the client will see, then gate the "Generate Link" button.

### URL Structure

```
Free:    app.driftgrid.com/r/{auto-slug}           (with DriftGrid branding)
Pro:     app.driftgrid.com/r/{custom-slug}          (clean)
Team:    reviews.youragency.com/{custom-slug}        (custom domain)
```

### Review Page Features

All review links include the full experience — the gate is quantity, not quality:

| Feature | Free (1 link) | Pro | Team |
|---------|---------------|-----|------|
| View designs | Yes | Yes | Yes |
| Navigate concepts/versions | Yes | Yes | Yes |
| Leave annotations | Yes | Yes | Yes |
| Client text edits | Yes | Yes | Yes |
| Password protection | Yes | Yes | Yes |
| Expiring links | Yes | Yes | Yes |
| DriftGrid watermark | Yes | No | No |
| Custom domain | No | No | Yes |
| View analytics | No | Yes | Yes |
| Round-specific links | No | Yes | Yes |

### Analytics Dashboard

Visible to designers when a client views a review link:

- Total views / unique viewers
- Time spent per version (heatmap on grid)
- Annotation density per concept
- Most-viewed versions
- Client activity timeline

---

## Build Sequence

Ordered by market signal, not engineering difficulty. Everything ships together at launch.

### 1. Storage Adapter + Database

**Why first:** Foundation layer. Everything cloud depends on this.

1. Define `StorageAdapter` interface
2. Implement `LocalStorageAdapter` wrapping current `fs` calls
3. Implement `CloudStorageAdapter` wrapping Supabase + R2
4. Refactor all API routes to use `getStorageAdapter()` instead of direct `fs`
5. Feature flag: `DRIFTGRID_MODE=local|cloud`
6. Set up Supabase project, run migrations (all tables)
7. Set up Cloudflare R2 bucket

### 2. Auth + Workspaces

**Why second:** Need user identity before anything cloud-facing.

1. Add Supabase Auth client (`@supabase/ssr`)
2. Create auth pages: `/signup`, `/login`, `/workspace/new`
3. Middleware: validate JWT, inject workspace context
4. Workspace settings page: members, plan, usage meter
5. API key generation for MCP auth

### 3. Cloud Storage + Push

**Why third:** Enables the core flow — local designs pushed to cloud.

1. Implement `CloudStorageAdapter` file operations (R2)
2. `npx driftgrid push` — uploads local project to cloud
3. `npx driftgrid login` — authenticates with cloud account
4. Signed URL generation for direct R2 uploads
5. Thumbnail generation strategy for cloud (queue-based)

### 4. Review Links + Sharing (The Money Feature)

**Why fourth:** This is the conversion trigger. Must ship at launch.

1. "Share" button in local UI → prompts cloud connection if not connected
2. Review link generation (slug, password, expiry)
3. Public review page route (`/r/[slug]`)
4. Client annotations (no account required, name prompt on first comment)
5. Client text edits (`data-drift-editable`)
6. DriftGrid watermark (conditional on plan)

### 5. Billing + Upgrade Flow

**Why fifth:** Gate the second review link. Seamless in-context upgrade.

1. Stripe products: Free, Pro ($14/mo), Team ($12/designer/mo)
2. In-context upgrade modal at paywall moment (not settings redirect)
3. Stripe Checkout (embedded or hosted)
4. Webhook handler for subscription lifecycle
5. Limit enforcement: review link count, storage, seats
6. Workspace billing settings: portal link, usage meter

### 6. Analytics + Team Features

**Why last:** Upsell features, not conversion features.

1. View tracking on review pages
2. Analytics dashboard (views, time-on-page, annotation density)
3. Custom domain support (CNAME + Cloudflare SSL)
4. SSO (Google, SAML for Team tier)
5. BYO Supabase documentation + setup guide

### 7. Open-Source Launch (Simultaneous)

**Ships alongside cloud.** One launch story, not two.

1. Demo project showcasing the workflow
2. Landing page with "Try locally" + "Share with cloud" CTAs
3. Launch assets (hero GIF, workflow video)
4. README + getting started guide
5. Product Hunt, Hacker News, Twitter/X launch posts

---

## Infrastructure

### Hosting

| Component | Service | Why |
|-----------|---------|-----|
| Next.js app | Vercel or Cloudflare Pages | Edge deployment, zero-config |
| Database | Supabase (Postgres) | Auth + DB + RLS in one |
| Object storage | Cloudflare R2 | Zero egress, S3-compatible |
| Thumbnails | Cloudflare Browser Rendering | Headless Chrome at edge |
| Background jobs | Supabase Edge Functions or Inngest | Thumbnail gen, export gen |
| Email | Resend | Transactional emails (invites, export ready) |
| Payments | Stripe | Industry standard |
| DNS + CDN | Cloudflare | Custom domains, caching |

### Cost Estimate (at 100 paying users)

| Item | Monthly Cost |
|------|-------------|
| Supabase Pro | $25 |
| Cloudflare R2 (50GB stored, ~1M reads) | ~$5 |
| Vercel Pro | $20 |
| Cloudflare Browser Rendering | ~$10 |
| Stripe fees (2.9% + $0.30 per txn) | ~$100 |
| Resend | $0 (free tier) |
| **Total** | **~$160/mo** |

Revenue at 100 users (mix of Pro + Team): **~$2,500-4,000/mo**

---

## Resolved Questions

1. **Local ↔ Cloud sync:** Yes. `npx driftgrid push` uploads local project to cloud. One-way push for now (local is source of truth). Pull/sync comes later if needed.

2. **AI tool integration:** Local-first. AI edits files on disk. MCP server with cloud API key handles push to cloud. No cloud-only editing required at launch.

3. **BYO infrastructure:** Supported at launch via documentation. Same codebase, different env vars. BYO users configure their own Supabase + R2 credentials.

## Open Questions

1. **Thumbnail generation at scale:** Puppeteer is expensive. Options: Cloudflare Browser Rendering, dedicated worker (Lambda/Cloud Run), or client-side (html2canvas). Decision can be made during build.

2. **Export at scale:** Same Puppeteer concern. Job queue (Inngest, BullMQ) with dedicated workers is likely the answer.

3. **Realtime collaboration:** Not at launch. Architecture supports it later via Supabase Realtime (LISTEN/NOTIFY) + presence API. Good upsell for Team tier.

---

## Success Metrics

| Metric | Target (6 months post-launch) |
|--------|-------------------------------|
| Sign-ups | 1,000 |
| Active projects | 500 |
| Review links created | 2,000+ |
| Paid conversions | 5-8% (50-80 paying users) |
| MRR | $1,000-2,000 |
| Client annotations | 10,000+ |
| Churn (monthly) | < 5% |

The conversion funnel: **`npx driftgrid` → local usage → "Share" button → cloud account → 1st review link (free) → 2nd review link → upgrade to Pro ($14/mo).** The upgrade moment is in-context, seamless, and feels like unlocking — not blocking.
