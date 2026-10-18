-- Site Supabase project (ref dffpelfiqsxtlgvmnzgv, same as studio_posts).
-- Repeating posts: one studio_post_series row holds the media, targets and
-- schedule rule; the publish runner turns it into ordinary studio_posts rows,
-- one copy at a time, each with a fresh AI caption when caption_mode='fresh'.
create table if not exists public.studio_post_series (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  caption text not null default '',
  overrides jsonb not null default '{}'::jsonb,
  media jsonb not null default '[]'::jsonb,
  targets jsonb not null default '[]'::jsonb,
  frames jsonb not null default '[]'::jsonb,
  notes text not null default '',
  caption_mode text not null default 'fresh' check (caption_mode in ('fresh', 'same')),
  rule jsonb not null,
  starts_at timestamptz,
  ends_at timestamptz,
  max_runs integer check (max_runs is null or max_runs > 0),
  runs integer not null default 0,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  next_at timestamptz,
  last_error text,
  source text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.studio_post_series enable row level security;  -- service role only, no policies
create index if not exists studio_post_series_due on public.studio_post_series (status, next_at);

alter table public.studio_posts
  add column if not exists series_id uuid references public.studio_post_series(id) on delete set null,
  add column if not exists occurrence integer,
  add column if not exists notes text not null default '',
  add column if not exists caption_by text not null default 'brian' check (caption_by in ('brian', 'ai')),
  add column if not exists logged_at timestamptz;
create index if not exists studio_posts_series on public.studio_posts (series_id, status);
create index if not exists studio_posts_unlogged on public.studio_posts (status, logged_at) where logged_at is null;

-- Posts that finished before the Drive post log existed aren't backfilled.
update public.studio_posts set logged_at = now() where status in ('done','partial','failed','canceled') and logged_at is null;
