-- Applied to clarendon-studio 2026-10-05 as migration money_ad_spend_campaign_metrics.
-- Per-campaign ad reporting (TikTok now, Meta later): spend, reach, installs,
-- cost per install and the platform's own attributed purchase value, per day.
alter table public.ad_spend
  add column if not exists impressions integer,
  add column if not exists conversions integer,
  add column if not exists purchase_value_cents bigint,
  add column if not exists currency text default 'USD',
  add column if not exists advertiser_id text,
  add column if not exists synced_at timestamptz default now();
create index if not exists ad_spend_app_day_idx on public.ad_spend (owner_id, app_slug, day);
