-- Account balances from Plaid (/accounts/get, refreshed on every sync).
-- Cents; available can be null (Plaid doesn't always send it). Additive.
alter table public.money_accounts add column if not exists balance_current_cents bigint;
alter table public.money_accounts add column if not exists balance_available_cents bigint;
alter table public.money_accounts add column if not exists balance_currency text;
alter table public.money_accounts add column if not exists balance_updated_at timestamptz;
