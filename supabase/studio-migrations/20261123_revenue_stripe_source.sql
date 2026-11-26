-- Website (Stripe) sales join the revenue table as source 'stripe' (src/lib/money/stripeRevenue.ts),
-- and test purchases get their own rows flagged is_test so Money never counts them as customer revenue.
-- Applied to clarendon-studio 2026-11-23 (Supabase MCP, migration revenue_stripe_source).
alter table public.revenue drop constraint if exists revenue_source_check;
alter table public.revenue add constraint revenue_source_check
  check (source = any (array['asc'::text, 'play'::text, 'stripe'::text, 'revenuecat'::text, 'other'::text]));

alter table public.revenue add column if not exists is_test boolean not null default false;

-- The P&L, ROAS and by-store views read every revenue row; make each skip test rows.
-- Rewrites only the revenue WHERE clause of the live definition (fails loudly if it isn't there).
do $$
declare
  v record;
  d text;
  nd text;
begin
  for v in select * from (values
    ('v_roas_daily', 'WHERE (revenue.app_slug IS NOT NULL)', 'WHERE ((revenue.app_slug IS NOT NULL) AND (NOT revenue.is_test))'),
    ('v_app_pnl_monthly', 'WHERE (revenue.app_slug IS NOT NULL)', 'WHERE ((revenue.app_slug IS NOT NULL) AND (NOT revenue.is_test))'),
    ('v_revenue_source_monthly', 'WHERE (app_slug IS NOT NULL)', 'WHERE ((app_slug IS NOT NULL) AND (NOT is_test))')
  ) as t(name, old, new) loop
    d := pg_get_viewdef(('public.' || v.name)::regclass);
    if position(v.new in d) > 0 then continue; end if; -- already applied
    nd := replace(d, v.old, v.new);
    if nd = d then raise exception 'revenue filter not found in %', v.name; end if;
    execute format('create or replace view public.%I with (security_invoker = true) as %s', v.name, nd);
  end loop;
end $$;
