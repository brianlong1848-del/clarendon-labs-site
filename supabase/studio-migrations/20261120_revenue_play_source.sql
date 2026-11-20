-- Google Play proceeds join App Store Connect in the revenue table (source 'play').
-- Applied to clarendon-studio 2026-11-20 (Supabase MCP, migrations revenue_play_source + v_revenue_source_monthly).
alter table public.revenue drop constraint if exists revenue_source_check;
alter table public.revenue add constraint revenue_source_check
  check (source = any (array['asc'::text, 'play'::text, 'revenuecat'::text, 'other'::text]));

-- Revenue by store (asc = App Store, play = Google Play) per app per month, for Money's split line.
create or replace view public.v_revenue_source_monthly with (security_invoker = true) as
select owner_id,
       date_trunc('month', period)::date as month,
       app_slug,
       source,
       sum(proceeds_cents)::bigint as proceeds_cents,
       sum(coalesce(units, 0))::bigint as units
from public.revenue
where app_slug is not null
group by owner_id, date_trunc('month', period)::date, app_slug, source;
grant select on public.v_revenue_source_monthly to authenticated;
