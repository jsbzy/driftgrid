-- Enforce uniqueness on stripe_subscription_id so a single subscription can't
-- be claimed by two profiles. The webhook handler updates profiles
-- `WHERE stripe_subscription_id = X` — without this constraint, corrupted
-- data could silently cause one event to touch multiple rows.

alter table public.profiles
  add constraint profiles_stripe_subscription_id_unique unique (stripe_subscription_id);

-- Index hot columns for webhook lookups. Partial index on customer id is
-- cheap because only Pro users have one.
create index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;
