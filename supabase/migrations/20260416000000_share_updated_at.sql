-- Track when a share was last (re-)published so the Dashboard can show
-- "Last published 5 min ago" next to every share URL. Republishing bumps
-- updated_at via /api/cloud/share; the row itself still keeps the same token.

alter table public.share_links
  add column if not exists updated_at timestamptz not null default now();

-- Backfill: existing rows don't have a real "last republished" time, so
-- seed updated_at from created_at. Only touch rows where the two disagree
-- (which they will initially, because the ALTER default stamped now()).
update public.share_links
  set updated_at = created_at
  where updated_at <> created_at;
