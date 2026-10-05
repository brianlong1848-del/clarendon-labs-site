-- Admin "Money" — manual ledger, recurring subscriptions, splits, receipts.
-- Implements addendum 1 (B1-B4) and addendum 2 on top of money_phase1_schema.
-- Target project: clarendon-studio (lgkalsyfnanpfgvlyvno). Applied 2026-10-03 as
-- migrations money_manual_ledger_tables, money_post_due_recurring,
-- money_views_splits_owner_contrib, money_receipts_storage. Purely additive:
--   * transactions.receipt_path is kept but deprecated (unused; receipts table replaces it)
--   * v_app_pnl_monthly and v_owner_contributions are replaced with the same columns

-- ── 1. transactions: where it came from, who paid, duplicate pointer ─────────
alter table public.transactions
  add column if not exists source text not null default 'plaid'
    check (source in ('plaid','manual','recurring')),
  add column if not exists paid_from text,  -- money_accounts.id as text, or 'other_personal' / 'cash'
  add column if not exists possible_duplicate_of uuid references public.transactions(id) on delete set null,
  add column if not exists recurring_id uuid;
comment on column public.transactions.receipt_path is 'Deprecated 2026-10-03: unused, replaced by public.receipts. Safe to remove later.';
create index if not exists transactions_source_idx on public.transactions (owner_id, source);
create index if not exists transactions_dup_idx on public.transactions (possible_duplicate_of) where possible_duplicate_of is not null;

-- ── 2. manual_recurring: subscriptions paid from personal cards/accounts ─────
create table if not exists public.manual_recurring (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users,
  vendor text not null,
  amount_cents bigint not null check (amount_cents > 0),   -- positive = money out
  cadence text not null check (cadence in ('monthly','annual')),
  anchor_date date,                                         -- first charge; occurrences are counted from it
  next_date date not null,
  app_slug text references public.apps,
  split_apps text[],                                        -- even split across these apps
  paid_from text not null,                                  -- money_accounts.id as text, or 'other_personal' / 'cash'
  schedule_c text,
  active boolean not null default true,
  moved_to_business_on date,                                -- set = Plaid picks it up; auto-posting stops
  notes text,
  created_at timestamptz not null default now(),
  check (app_slug is null or split_apps is null)
);
alter table public.transactions add constraint transactions_recurring_id_fkey
  foreign key (recurring_id) references public.manual_recurring(id) on delete set null;

-- ── 3. transaction_splits: split any transaction across apps (share = 0..1) ──
create table if not exists public.transaction_splits (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  app_slug text not null references public.apps,
  share numeric not null check (share > 0 and share <= 1),
  owner_id uuid not null default auth.uid() references auth.users,
  primary key (transaction_id, app_slug)
);

-- ── 4. receipts (addendum 2) ─────────────────────────────────────────────────
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users,
  transaction_id uuid references public.transactions(id) on delete set null,  -- null = unmatched; receipt outlives the transaction
  storage_path text not null,
  file_name text, mime_type text, size_bytes bigint,
  extracted jsonb,                                          -- vendor, date, amount, line items read by Claude
  status text not null default 'unmatched' check (status in ('unmatched','matched','dismissed')),
  uploaded_via text check (uploaded_via in ('web','ios','email')),
  created_at timestamptz not null default now()
);
create index if not exists receipts_tx_idx on public.receipts (transaction_id);
create index if not exists receipts_owner_status_idx on public.receipts (owner_id, status);

-- ── 5. RLS: owner-only AND second factor completed (same rule as phase 1) ────
alter table public.manual_recurring enable row level security;
revoke all on public.manual_recurring from anon;
create policy manual_recurring_owner on public.manual_recurring for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy aal2_required on public.manual_recurring as restrictive for all to authenticated using (((select auth.jwt()) ->> 'aal') = 'aal2') with check (((select auth.jwt()) ->> 'aal') = 'aal2');
alter table public.transaction_splits enable row level security;
revoke all on public.transaction_splits from anon;
create policy transaction_splits_owner on public.transaction_splits for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy aal2_required on public.transaction_splits as restrictive for all to authenticated using (((select auth.jwt()) ->> 'aal') = 'aal2') with check (((select auth.jwt()) ->> 'aal') = 'aal2');
alter table public.receipts enable row level security;
revoke all on public.receipts from anon;
create policy receipts_owner on public.receipts for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy aal2_required on public.receipts as restrictive for all to authenticated using (((select auth.jwt()) ->> 'aal') = 'aal2') with check (((select auth.jwt()) ->> 'aal') = 'aal2');

-- ── 6. Private storage bucket for receipt files (never public) ───────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760, array['image/jpeg','image/png','application/pdf'])
on conflict (id) do nothing;

-- Files live at <owner uuid>/<file>; only that owner, with 2FA, can touch them.
create policy receipts_objects_owner on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text and ((select auth.jwt()) ->> 'aal') = 'aal2')
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text and ((select auth.jwt()) ->> 'aal') = 'aal2');

-- ── 7. Daily posting of due recurring charges. Occurrences are computed from
--      the anchor date so a charge on the 31st returns to the 31st after
--      February. Idempotent via transactions.external_id. Service role only.
create or replace function public.post_due_recurring(p_today date default ((now() at time zone 'America/Chicago')::date))
returns integer
language plpgsql
set search_path = public
as $$
declare r record; n integer := 0; d date; k integer; c integer; step interval; anchor date;
begin
  for r in
    select * from manual_recurring
    where active and moved_to_business_on is null and next_date <= p_today
    for update
  loop
    step := case r.cadence when 'monthly' then interval '1 month' else interval '1 year' end;
    anchor := coalesce(r.anchor_date, r.next_date);
    k := 0;
    loop
      d := (anchor + k * step)::date;
      exit when d > p_today;
      if d >= r.next_date then
        insert into transactions (owner_id, posted_on, amount_cents, merchant, status, app_slug, split_apps,
                                  schedule_c, source, paid_from, account_id, external_id, recurring_id)
        values (r.owner_id, d, r.amount_cents, r.vendor, 'business', r.app_slug, r.split_apps,
                r.schedule_c, 'recurring', r.paid_from,
                (select m.id from money_accounts m where m.id::text = r.paid_from),
                'recurring:' || r.id || ':' || d, r.id)
        on conflict (external_id) do nothing;
        get diagnostics c = row_count;
        n := n + c;
      end if;
      k := k + 1;
    end loop;
    update manual_recurring set next_date = d, anchor_date = anchor where id = r.id;
  end loop;
  return n;
end $$;
revoke execute on function public.post_due_recurring(date) from public, anon, authenticated;
grant execute on function public.post_due_recurring(date) to service_role;

-- ── 8. Views ─────────────────────────────────────────────────────────────────
-- Owner contribution = business spend paid from a personal account, OR a manual
-- entry paid from cash / "other personal" (no linked account).
create or replace view public.v_owner_contributions with (security_invoker = true) as
 select t.id, t.owner_id, t.posted_on, t.merchant, t.amount_cents, t.app_slug, t.schedule_c, t.reimbursed_at,
        coalesce(a.name, case t.paid_from when 'cash' then 'Cash' when 'other_personal' then 'Personal (other)' end) as account_name,
        case when t.reimbursed_at is null then t.amount_cents else 0::bigint end as owed_cents,
        sum(case when t.reimbursed_at is null then t.amount_cents else 0::bigint end)
          over (partition by t.owner_id order by t.posted_on, t.id) as running_owed_cents
 from public.transactions t
 left join public.money_accounts a on a.id = t.account_id
 where t.status = 'business'
   and (a.ownership = 'personal' or t.paid_from in ('other_personal','cash'));

-- Per-app P&L: a transaction's cost goes to transaction_splits first, then the
-- legacy even-split array, then app_slug; app_slug null = shared allocation.
create or replace view public.v_app_pnl_monthly with (security_invoker = true) as
 with cost_tx as (
   select x.owner_id, x.m, x.app_slug, sum(x.c) as c
   from (
     select t.owner_id, date_trunc('month', t.posted_on)::date as m, t.app_slug, t.amount_cents::numeric as c
       from public.transactions t
      where t.status = 'business' and coalesce(t.schedule_c,'') <> 'advertising' and t.split_apps is null
        and not exists (select 1 from public.transaction_splits s where s.transaction_id = t.id)
     union all
     select t.owner_id, date_trunc('month', t.posted_on)::date, s.slug, t.amount_cents::numeric / cardinality(t.split_apps)
       from public.transactions t cross join lateral unnest(t.split_apps) s(slug)
      where t.status = 'business' and coalesce(t.schedule_c,'') <> 'advertising' and t.split_apps is not null
        and not exists (select 1 from public.transaction_splits sp where sp.transaction_id = t.id)
     union all
     select t.owner_id, date_trunc('month', t.posted_on)::date, sp.app_slug, t.amount_cents::numeric * sp.share
       from public.transactions t join public.transaction_splits sp on sp.transaction_id = t.id
      where t.status = 'business' and coalesce(t.schedule_c,'') <> 'advertising'
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

-- ── 9. Migration tracker: "6 of 11 moved · $84/mo still on personal" ─────────
create or replace view public.v_subscription_migration with (security_invoker = true) as
 select owner_id,
        count(*) filter (where active) as total,
        count(*) filter (where active and moved_to_business_on is not null) as moved,
        coalesce(sum(case cadence when 'monthly' then amount_cents::numeric else round(amount_cents / 12.0) end)
                 filter (where active and moved_to_business_on is null), 0)::bigint as personal_monthly_cents
 from public.manual_recurring
 group by owner_id;
revoke all on public.v_subscription_migration from anon;

-- ── 10. Duplicate guard (migration money_duplicate_guard) ────────────────────
-- When Plaid imports a charge matching a manual/recurring entry (same amount,
-- within 3 days, similar merchant), point it at that entry and hold it in
-- Triage as "Looks like this posted, merge?" instead of counting it twice.
create or replace function public.flag_possible_duplicate()
returns trigger
language plpgsql
set search_path = public
as $$
declare dup uuid; theirs text;
begin
  if new.source <> 'plaid' or new.possible_duplicate_of is not null then
    return new;
  end if;
  theirs := lower(coalesce(nullif(trim(new.merchant), ''), new.raw_description, ''));
  if length(theirs) < 3 then
    return new;
  end if;
  select t.id into dup
    from transactions t
   where t.owner_id = new.owner_id
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

create trigger transactions_flag_duplicate
  before insert on public.transactions
  for each row execute function public.flag_possible_duplicate();

-- ── 11. Grants (migration money_grants_new_tables, 2026-10-05) ──────────────
-- This project doesn't auto-grant table privileges to API roles; without these
-- the Money pages failed with "permission denied for table transaction_splits".
-- Row-level security (owner + 2FA) still decides which rows anyone can touch.
grant select, insert, update, delete on public.manual_recurring to authenticated, service_role;
grant select, insert, update, delete on public.transaction_splits to authenticated, service_role;
grant select, insert, update, delete on public.receipts to authenticated, service_role;
grant select on public.v_subscription_migration to authenticated, service_role;
