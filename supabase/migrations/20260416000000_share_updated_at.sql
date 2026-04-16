-- Track when a share was last (re-)published so the Dashboard can show
-- "Last published 5 min ago" next to every share URL. Republishing bumps
-- updated_at via /api/cloud/share; the row itself still keeps the same token.

alter table public.share_links
  add column if not exists updated_at timestamptz not null default now();

-- Backfill for any existing rows (default already applies, but be explicit).
update public.share_links
  set updated_at = created_at
  where updated_at < created_at or updated_at is null;
