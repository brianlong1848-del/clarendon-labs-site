-- Market editions: one post, a local edition per country & language
-- (see src/lib/publish/markets.ts). Editions of the same post share an
-- edition_group; market is the MarketId ('us', 'gb', 'cafr', …). Both are
-- null for ordinary single-market posts.
alter table public.studio_posts add column if not exists market text;
alter table public.studio_posts add column if not exists edition_group uuid;
create index if not exists studio_posts_edition_group_idx on public.studio_posts (edition_group) where edition_group is not null;
