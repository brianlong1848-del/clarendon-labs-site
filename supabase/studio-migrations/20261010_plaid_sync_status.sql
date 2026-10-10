-- Sync status for the Money tab: when each Plaid item last synced cleanly and
-- the last error (null once a sync succeeds). Additive; safe to re-run.
alter table public.plaid_items add column if not exists last_synced_at timestamptz;
alter table public.plaid_items add column if not exists last_error text;
