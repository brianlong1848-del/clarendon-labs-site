-- Household, section B: data model (FEAT-CLA-027, 2026-11-07).
-- Target project: clarendon-studio (lgkalsyfnanpfgvlyvno). Applied 2026-11-07
-- with the Supabase MCP as migration household_schema. Needs
-- 20261107_household_members.sql first (is_studio_member, force_studio_owner).
--
-- Personal accounts and investments live in the same tables as the business
-- books, told apart by scope = 'household'. Every business view, export and
-- matcher filters scope = 'studio', so household rows never reach Clarendon's
-- P&L, owed-to-owner, recurring radar, Schedule C export, Triage or the rules
-- engine. transactions carries its own scope (copied from the account on
-- insert) so plain row filters work without a join.

-- ── 1. Scope on accounts, items and transactions ─────────────────────────────
alter table public.money_accounts
  add column if not exists scope text not null default 'studio' check (scope in ('studio','household')),
  add column if not exists account_type text,       -- plaid type: depository / credit / investment / loan …
  add column if not exists account_subtype text;    -- plaid subtype: checking / 401k / brokerage / ira …
alter table public.plaid_items
  add column if not exists scope text not null default 'studio' check (scope in ('studio','household')),
  add column if not exists products text[] not null default '{transactions}',   -- what the link token asked for
  add column if not exists investments_synced_to date;                            -- last /investments/transactions end_date
alter table public.transactions
  add column if not exists scope text not null default 'studio' check (scope in ('studio','household'));
create index if not exists transactions_scope_idx on public.transactions (scope, posted_on desc);
create index if not exists money_accounts_scope_idx on public.money_accounts (scope);

-- A transaction takes its account's scope. Fires before flag_possible_duplicate
-- (alphabetical), which only concerns the business books.
create or replace function public.transactions_inherit_scope()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.account_id is not null then
    new.scope := coalesce((select scope from money_accounts where id = new.account_id), new.scope, 'studio');
  end if;
  return new;
end $$;
drop trigger if exists a_transactions_inherit_scope on public.transactions;
create trigger a_transactions_inherit_scope before insert on public.transactions
  for each row execute function public.transactions_inherit_scope();

-- Duplicate guard is for the business books only.
create or replace function public.flag_possible_duplicate()
returns trigger
language plpgsql
set search_path = public
as $$
declare dup uuid; theirs text;
begin
  if new.scope <> 'studio' or new.source <> 'plaid' or new.possible_duplicate_of is not null then
    return new;
  end if;
  theirs := lower(coalesce(nullif(trim(new.merchant), ''), new.raw_description, ''));
  if length(theirs) < 3 then
    return new;
  end if;
  select t.id into dup
    from transactions t
   where t.owner_id = new.owner_id
     and t.scope = 'studio'
     and t.source in ('manual', 'recurring')
     and t.status = 'business'
     and t.amount_cents = new.amount_cents
     and t.posted_on between new.posted_on - 3 and new.posted_on + 3
     and length(split_part(lower(trim(t.merchant)), ' ', 1)) >= 3
     and (theirs like '%' || split_part(lower(trim(t.merchant)), ' ', 1) || '%'
          or lower(t.merchant) like '%' || split_part(theirs, ' ', 1) || '%')
     and not exists (select 1 from transactions p where p.possible_duplicate_of = t.id)
   order by abs(t.posted_on - new.posted_on)
   limit 1;
  if dup is not null then
    new.possible_duplicate_of := dup;
    new.status := 'unreviewed';
  end if;
  return new;
end $$;

-- ── 2. Investments ───────────────────────────────────────────────────────────
create table if not exists public.securities (
  id text primary key,                        -- plaid security_id
  ticker text, name text, type text,          -- equity, etf, mutual fund, cash, fixed income, derivative …
  cusip text, isin text, currency text default 'USD',
  is_cash_equivalent boolean default false,
  close_price numeric, close_price_as_of date,
  updated_at timestamptz default now()
);
create index if not exists securities_ticker_idx on public.securities (ticker);

create table if not exists public.holdings (
  account_id uuid not null references public.money_accounts(id) on delete cascade,
  security_id text not null references public.securities(id),
  owner_id uuid not null default auth.uid() references auth.users(id),
  quantity numeric not null,
  cost_basis_cents bigint,
  institution_price numeric,
  institution_value_cents bigint not null,
  as_of date not null,
  updated_at timestamptz default now(),
  primary key (account_id, security_id)
);

create table if not exists public.investment_transactions (
  id text primary key,                        -- plaid investment_transaction_id
  owner_id uuid not null default auth.uid() references auth.users(id),
  account_id uuid not null references public.money_accounts(id) on delete cascade,
  security_id text references public.securities(id),
  posted_on date not null,
  type text not null, subtype text,
  quantity numeric, price numeric,
  amount_cents bigint not null,               -- plaid sign: positive = money out of the account
  fees_cents bigint default 0,
  name text
);
create index if not exists investment_transactions_acct_idx on public.investment_transactions (account_id, posted_on desc);

-- FMP quote cache (15-minute TTL in market hours, 12 h otherwise).
create table if not exists public.quotes (
  ticker text primary key,
  price numeric not null, change_pct numeric,
  day_low numeric, day_high numeric, year_low numeric, year_high numeric,
  market_cap bigint, pe numeric,
  as_of timestamptz not null,
  source text default 'fmp'
);

-- Slow FMP endpoints (profile, ratios, news, dividends…), 24 h TTL.
create table if not exists public.fmp_cache (
  key text primary key,                       -- <endpoint>:<ticker>
  value jsonb not null,
  fetched_at timestamptz not null default now()
);

-- One row per key; both members edit. Keys: target_allocation, cash_buffer_months,
-- goals, risk_note, tax_bracket_note, advisor_schedule, fmp_calls_today, watchlist.
create table if not exists public.household_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz default now()
);

-- ── 3. Advisor ───────────────────────────────────────────────────────────────
create table if not exists public.advisor_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  requested_by uuid references auth.users(id),
  kind text not null check (kind in ('weekly','on_demand','question')),
  question text,
  input_snapshot jsonb not null,
  output jsonb not null,
  output_md text not null,
  model text not null,
  input_tokens int, output_tokens int,
  created_at timestamptz default now()
);
create index if not exists advisor_runs_created_idx on public.advisor_runs (created_at desc);

create table if not exists public.advisor_actions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.advisor_runs(id) on delete cascade,
  kind text not null check (kind in ('move_cash','rebalance','buy','sell','trim','harvest','hold','pay_down','review')),
  account_id uuid references public.money_accounts(id) on delete set null,
  ticker text, amount_cents bigint,
  title text not null, rationale text not null,
  urgency text check (urgency in ('now','this_week','this_month','someday')),
  confidence text check (confidence in ('low','medium','high')),
  status text not null default 'open' check (status in ('open','done','dismissed')),
  decided_by uuid references auth.users(id), decided_at timestamptz
);
create index if not exists advisor_actions_run_idx on public.advisor_actions (run_id);
create index if not exists advisor_actions_status_idx on public.advisor_actions (status);

-- ── 4. RLS: members with 2FA, read and write (service role for the jobs) ─────
do $$
declare t text;
begin
  foreach t in array array['securities','holdings','investment_transactions','quotes','fmp_cache','household_settings','advisor_runs','advisor_actions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_member', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_studio_member()) with check (public.is_studio_member())', t || '_member', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', t);
  end loop;
  foreach t in array array['holdings','investment_transactions','advisor_runs']
  loop
    execute format('drop trigger if exists force_studio_owner on public.%I', t);
    execute format('create trigger force_studio_owner before insert on public.%I for each row execute function public.force_studio_owner()', t);
  end loop;
end $$;

-- ── 5. Keep the books clean: business views see scope = 'studio' only ───────
-- Manual / cash rows have no account; they are business by definition and keep
-- scope 'studio' (the default), so the filter is on the transaction itself.
create or replace view public.v_owner_contributions with (security_invoker = true) as
 select t.id, t.owner_id, t.posted_on, t.merchant, t.amount_cents, t.app_slug, t.schedule_c, t.reimbursed_at,
        coalesce(a.name, case t.paid_from when 'cash' then 'Cash' when 'other_personal' then 'Personal (other)' end) as account_name,
        case when t.reimbursed_at is null then t.amount_cents else 0::bigint end as owed_cents,
        sum(case when t.reimbursed_at is null then t.amount_cents else 0::bigint end)
          over (partition by t.owner_id order by t.posted_on, t.id) as running_owed_cents
 from public.transactions t
 left join public.money_accounts a on a.id = t.account_id
 where t.scope = 'studio'
   and t.status = 'business'
   and (a.ownership = 'personal' or t.paid_from in ('other_personal','cash'));

create or replace view public.v_recurring with (security_invoker = true) as
 with t as (
   select owner_id, lower(trim(merchant)) as mk, merchant, posted_on, amount_cents, app_slug,
          posted_on - lag(posted_on) over (partition by owner_id, lower(trim(merchant)) order by posted_on) as gap
     from public.transactions
    where scope = 'studio' and status = 'business' and merchant is not null and amount_cents > 0
 ), agg as (
   select owner_id, mk, max(merchant) as merchant, count(*) as charges, min(posted_on) as first_charge, max(posted_on) as last_charge,
          round(avg(gap), 1) as avg_gap_days, round(coalesce(stddev_samp(gap), 0), 1) as gap_stddev,
          (array_agg(amount_cents order by posted_on desc))[1] as last_amount_cents,
          round(avg(amount_cents))::bigint as avg_amount_cents,
          (array_agg(app_slug order by posted_on desc))[1] as app_slug
     from t group by owner_id, mk having count(*) >= 2
 )
 select owner_id, merchant, charges, first_charge, last_charge, avg_gap_days, last_amount_cents, avg_amount_cents, app_slug,
        case when avg_gap_days between 26 and 35 and charges >= 3 and gap_stddev <= 6 then 'monthly'
             when avg_gap_days between 350 and 380 then 'annual' end as cadence,
        last_charge + round(avg_gap_days)::int as next_expected,
        case when avg_gap_days between 26 and 35 then last_amount_cents * 12
             when avg_gap_days between 350 and 380 then last_amount_cents end as est_annual_cents
   from agg
  where (avg_gap_days between 26 and 35 and charges >= 3 and gap_stddev <= 6) or (avg_gap_days between 350 and 380);

create or replace view public.v_app_pnl_monthly with (security_invoker = true) as
 with cost_tx as (
   select x.owner_id, x.m, x.app_slug, sum(x.c) as c
   from (
     select t.owner_id, date_trunc('month', t.posted_on)::date as m, t.app_slug, t.amount_cents::numeric as c
       from public.transactions t
      where t.scope = 'studio' and t.status = 'business' and coalesce(t.schedule_c,'') <> 'advertising' and t.split_apps is null
        and not exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
     union all
     select t.owner_id, date_trunc('month', t.posted_on)::date, s.slug, t.amount_cents::numeric / cardinality(t.split_apps)
       from public.transactions t cross join lateral unnest(t.split_apps) s(slug)
      where t.scope = 'studio' and t.status = 'business' and coalesce(t.schedule_c,'') <> 'advertising' and t.split_apps is not null
        and not exists (select 1 from public.transaction_splits sp where sp.transaction_id = t.id)
     union all
     select t.owner_id, date_trunc('month', t.posted_on)::date, sp.app_slug, t.amount_cents::numeric * sp.share
       from public.transactions t join public.transaction_splits sp on sp.transaction_id = t.id
      where t.scope = 'studio' and t.status = 'business' and coalesce(t.schedule_c,'') <> 'advertising'
   ) x
   group by x.owner_id, x.m, x.app_slug
 ), rev as (
   select owner_id, date_trunc('month', period)::date as m, app_slug, sum(proceeds_cents) as proceeds
     from public.revenue where app_slug is not null group by owner_id, date_trunc('month', period)::date, app_slug
 ), ads as (
   select owner_id, date_trunc('month', day)::date as m, app_slug, sum(spend_cents) as spend
     from public.ad_spend where app_slug is not null group by owner_id, date_trunc('month', day)::date, app_slug
 ), months as (
   select owner_id, m from cost_tx union select owner_id, m from rev union select owner_id, m from ads
 ), real_apps as (select slug from public.apps where slug <> 'studio'),
 grid as (select mo.owner_id, mo.m, a.slug as app_slug from months mo cross join public.apps a),
 shares as (
   select g.owner_id, g.m, g.app_slug,
     case
       when exists (select 1 from public.allocations al where al.owner_id = g.owner_id and al.month = g.m)
         then coalesce((select al.share from public.allocations al where al.owner_id = g.owner_id and al.month = g.m and al.app_slug = g.app_slug), 0::numeric)
       when g.app_slug = 'studio' then 0::numeric
       else 1.0 / (select count(*) from real_apps)::numeric
     end as share
   from grid g
 ), pnl as (
   select g.owner_id, g.m as month, g.app_slug,
     coalesce(r.proceeds, 0::numeric)::bigint as revenue_cents,
     coalesce(d.c, 0::numeric)::bigint as direct_cost_cents,
     round(coalesce(s.c, 0::numeric) * sh.share)::bigint as allocated_cost_cents,
     coalesce(ad.spend, 0::numeric)::bigint as ad_spend_cents
   from grid g
   join shares sh on sh.owner_id = g.owner_id and sh.m = g.m and sh.app_slug = g.app_slug
   left join rev r on r.owner_id = g.owner_id and r.m = g.m and r.app_slug = g.app_slug
   left join cost_tx d on d.owner_id = g.owner_id and d.m = g.m and d.app_slug = g.app_slug
   left join cost_tx s on s.owner_id = g.owner_id and s.m = g.m and s.app_slug is null
   left join ads ad on ad.owner_id = g.owner_id and ad.m = g.m and ad.app_slug = g.app_slug
 )
 select owner_id, month, app_slug, revenue_cents, direct_cost_cents, allocated_cost_cents, ad_spend_cents,
        revenue_cents - direct_cost_cents - allocated_cost_cents - ad_spend_cents as profit_cents,
        sum(revenue_cents - direct_cost_cents - allocated_cost_cents - ad_spend_cents)
          over (partition by owner_id, app_slug order by month) as cumulative_profit_cents
 from pnl
 where revenue_cents <> 0 or direct_cost_cents <> 0 or allocated_cost_cents <> 0 or ad_spend_cents <> 0;

-- v_owed_to_owner and v_owner_equity read v_owner_contributions / owner_flow rows;
-- owner_flow is only ever set from Triage, which is studio-only, so they need no change.

-- ── 6. Household read helpers ────────────────────────────────────────────────
-- Net worth right now: assets − liabilities across household accounts.
-- Investment accounts use the sum of holdings when present, else the balance.
create or replace view public.v_household_accounts with (security_invoker = true) as
 select a.id, a.institution, a.name, a.mask, a.account_type, a.account_subtype, a.plaid_item_id,
        a.balance_current_cents, a.balance_available_cents, a.balance_currency, a.balance_updated_at,
        coalesce(h.value_cents, a.balance_current_cents, 0)::bigint as value_cents,
        case when a.account_type in ('credit','loan') then true else false end as is_liability,
        i.status as item_status, i.last_synced_at, i.last_error, i.products
   from public.money_accounts a
   left join (select account_id, sum(institution_value_cents) as value_cents from public.holdings group by account_id) h on h.account_id = a.id
   left join public.plaid_items i on i.id = a.plaid_item_id
  where a.scope = 'household';
grant select on public.v_household_accounts to authenticated, service_role;
