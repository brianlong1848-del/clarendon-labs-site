-- Site Supabase (ref dffpelfiqsxtlgvmnzgv). Applied 2026-10-18.
-- Per-platform results for each published post, read ~48h after it goes out,
-- so "Best time" learns from Clarendon's own posts instead of general rules.
-- stats = { "<platform>": { "reach": n, "engagement": n, "at": iso } }
alter table public.studio_posts
  add column if not exists stats jsonb,
  add column if not exists stats_at timestamptz;
create index if not exists studio_posts_stats_due on public.studio_posts (status, stats_at) where stats_at is null;
