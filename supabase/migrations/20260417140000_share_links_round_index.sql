-- Index share_links.round_number so the round-aware queries introduced in
-- 20260417000000_share_rounds.sql don't full-scan the table. The partial
-- unique index already indexes (user_id, client, project, round_number)
-- together, but a standalone index on round_number helps the Dashboard's
-- "all rounds for this project" style queries too.

create index if not exists share_links_round_number_idx
  on public.share_links (round_number)
  where round_number is not null;
