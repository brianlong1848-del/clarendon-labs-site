-- Site Supabase (ref dffpelfiqsxtlgvmnzgv, same as studio_posts).
-- Paid promotions ("boosts") started from /post or the Studio app. One row per
-- boost: the post it promotes, the Meta campaign / ad set / ad it created, the
-- budget, dates and audience. Live numbers (spend, reach, clicks) are read from
-- Meta on demand; nightly spend lands in the Studio DB's ad_spend like TikTok.
create table if not exists public.studio_promotions (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  post_id uuid references public.studio_posts(id) on delete set null,
  network text not null default 'meta' check (network in ('meta', 'tiktok')),
  platform text not null check (platform in ('facebook', 'instagram', 'threads', 'tiktok')),
  remote_id text not null,
  permalink text,
  goal text not null default 'engagement',
  daily_budget_cents integer not null check (daily_budget_cents > 0),
  start_at timestamptz not null,
  end_at timestamptz not null,
  audience jsonb not null default '{}'::jsonb,
  campaign_id text,
  adset_id text,
  ad_id text,
  status text not null default 'creating' check (status in ('creating', 'active', 'paused', 'ended', 'failed')),
  error text,
  source text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.studio_promotions enable row level security;  -- service role only, no policies
create index if not exists studio_promotions_post on public.studio_promotions (post_id);
create index if not exists studio_promotions_recent on public.studio_promotions (created_at desc);
