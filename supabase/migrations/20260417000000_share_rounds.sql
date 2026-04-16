-- Round-aware share links. One share per (user, project, round) instead of
-- one per (user, project) — so each round gets its own pinned URL and
-- republishing within a round reuses the same token.
--
-- Also fixes a latent bug: the original table was created without the
-- UNIQUE (user_id, client, project) constraint from the schema migration,
-- so every "republish" has been INSERTing a new row (13+ active rows for
-- some projects). This migration deduplicates and enforces uniqueness.

alter table public.share_links
  add column if not exists round_number int;

-- Deduplicate: per (user_id, client, project, round_number), keep only the
-- newest active row (by updated_at then created_at). Older duplicates become
-- inactive — their tokens still resolve for clients who already have the URL,
-- but they no longer count toward free-tier limits and won't show on the
-- Dashboard.
with ranked as (
  select token,
    row_number() over (
      partition by user_id, client, project, coalesce(round_number, -1)
      order by updated_at desc nulls last, created_at desc
    ) as rn
  from public.share_links
  where is_active = true
)
update public.share_links
  set is_active = false
where token in (select token from ranked where rn > 1);

-- Enforce uniqueness on the (user, project, round) active tuple going forward.
-- COALESCE lets us treat NULL round_number (legacy rows) as a distinct sentinel
-- so new round-aware shares don't collide with old untracked ones.
create unique index if not exists share_links_active_unique_idx
  on public.share_links (user_id, client, project, coalesce(round_number, -1))
  where is_active = true;
