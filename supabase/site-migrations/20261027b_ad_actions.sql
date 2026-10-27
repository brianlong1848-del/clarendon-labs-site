-- Every Ad insights action Brian ran from the This week card (FEAT-CLA-023):
-- pause, budget change, duplicate as Traffic — with the ids it touched and
-- what came back, so the card can say "Done <date>" and nothing runs twice.
create table if not exists public.studio_ad_actions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  app text,
  platform text not null,
  action_type text not null,
  campaign_id text,
  source_ids jsonb,
  result_ids jsonb,
  status text not null check (status in ('done', 'failed', 'dry_run')),
  error text,
  source text
);
create index if not exists studio_ad_actions_campaign_idx on public.studio_ad_actions (platform, campaign_id, action_type, created_at desc);
alter table public.studio_ad_actions enable row level security;
comment on table public.studio_ad_actions is 'Ad insights actions run from Studio (FEAT-CLA-023). Service role only — RLS on, no policies.';
