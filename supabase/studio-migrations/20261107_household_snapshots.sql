-- Household: daily net-worth snapshots (FEAT-CLA-027 section F, 2026-11-07).
-- Applied to clarendon-studio as household_snapshots. The Overview's 1-day /
-- 30-day / year-to-date deltas compare today's figure with these rows; the
-- close cron and the first Overview load of the day each upsert today's row.
create table if not exists public.household_snapshots (
  day date primary key,
  net_worth_cents bigint not null,
  assets_cents bigint not null,
  liabilities_cents bigint not null,
  by_account jsonb,                       -- [{ id, value_cents }]
  created_at timestamptz not null default now()
);
alter table public.household_snapshots enable row level security;
revoke all on public.household_snapshots from anon;
drop policy if exists household_snapshots_member on public.household_snapshots;
create policy household_snapshots_member on public.household_snapshots
  for all to authenticated using (public.is_studio_member()) with check (public.is_studio_member());
grant select, insert, update, delete on public.household_snapshots to authenticated, service_role;
