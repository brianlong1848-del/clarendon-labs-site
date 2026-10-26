-- Per-platform media: a platform's own cut of the video (the TikTok edit for
-- TikTok, the Reels edit for Instagram/Facebook…), replacing the shared
-- `media` on that platform only. Shape: { "tiktok": [MediaItem, …], … }.
-- Null / {} = every platform gets `media` (see src/lib/publish/rules.ts mediaFor).
alter table public.studio_posts add column if not exists media_overrides jsonb;
alter table public.studio_post_series add column if not exists media_overrides jsonb;
