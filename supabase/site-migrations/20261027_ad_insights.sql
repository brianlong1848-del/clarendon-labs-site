-- Ad insights narrative cache (FEAT-CLA-023): one Claude write-up per day,
-- app ("all" or an app id) and range, so /analytics, Money → Ads and the
-- Studio app share it and "Regenerate" replaces it.
create table if not exists public.studio_ad_insights (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  app text not null,
  range text not null,
  narrative jsonb not null,
  model text,
  created_at timestamptz not null default now(),
  unique (day, app, range)
);
alter table public.studio_ad_insights enable row level security;
-- Service role only (the site's REST helper); no anon / authenticated policies on purpose.
