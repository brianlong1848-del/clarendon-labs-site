-- Site Supabase (ref dffpelfiqsxtlgvmnzgv). Applied 2026-10-18.
-- Audience presets Brian saves from the Promote sheet ("Save as preset").
-- Built-in presets live in code (src/lib/ads/presets.ts).
create table if not exists public.studio_audience_presets (
  id uuid primary key default gen_random_uuid(),
  app_id text not null,
  name text not null,
  platform text check (platform in ('instagram', 'facebook')),
  goal text,
  daily_usd numeric,
  days integer,
  audience jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.studio_audience_presets enable row level security;  -- service role only, no policies
