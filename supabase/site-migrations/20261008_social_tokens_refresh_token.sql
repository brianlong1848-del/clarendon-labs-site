-- Site Supabase project (the one in SUPABASE_URL — currently ref dffpelfiqsxtlgvmnzgv,
-- where studio_posts and studio_social_tokens live). Applied 2026-10-08.
-- TikTok access tokens last 24h; the 365-day refresh token is kept alongside.
alter table public.studio_social_tokens
  add column if not exists refresh_token text,
  add column if not exists refresh_expires_at timestamptz;
