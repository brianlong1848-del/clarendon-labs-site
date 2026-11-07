-- Household, section A: a second console member (FEAT-CLA-027, 2026-11-07).
-- Target project: clarendon-studio (lgkalsyfnanpfgvlyvno). Applied 2026-11-07
-- with the Supabase MCP as migration household_members.
--
-- Until now every money table's RLS was `owner_id = auth.uid()`, so a second
-- signed-in user saw nothing. Now:
--   * studio_members lists who shares the books (Brian, then Andrew once invited).
--   * is_studio_member() = "a member, with the second factor completed (aal2)".
--     Every owner policy becomes that, so both members read and write all rows.
--   * The single data owner stays Brian: force_studio_owner() stamps every new
--     row with the first member's id, so the views that partition by owner_id
--     (P&L, owed-to-owner, recurring) stay whole whoever adds the row. Server
--     routes keep using STUDIO_OWNER_ID unchanged.
--   * studio_member_invites: an email listed here becomes a member the moment
--     its auth user is created (Auth → Users → Invite), so the invite is the
--     only manual step.
-- Note: the spec also names an `account_balances` table; it does not exist in
-- this project (balances are columns on money_accounts), so nothing to do there.

-- ── 1. Members ───────────────────────────────────────────────────────────────
create table if not exists public.studio_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text,
  added_at timestamptz not null default now()
);
alter table public.studio_members enable row level security;
revoke all on public.studio_members from anon;
grant select on public.studio_members to authenticated;
grant select, insert, update, delete on public.studio_members to service_role;

-- Brian's row, from his auth user (no hard-coded id).
insert into public.studio_members (user_id, email, display_name)
select id, lower(email), 'Brian'
  from auth.users where lower(email) = 'brian@clarendon.dev'
on conflict (user_id) do nothing;

-- ── 2. is_studio_member(): member AND second factor completed ────────────────
-- security definer so it can read studio_members without tripping that
-- table's own RLS (no recursion).
create or replace function public.is_studio_member()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from studio_members where user_id = auth.uid())
     and coalesce((select auth.jwt() ->> 'aal'), '') = 'aal2'
$$;
revoke execute on function public.is_studio_member() from public, anon;
grant execute on function public.is_studio_member() to authenticated, service_role;

create policy studio_members_read on public.studio_members
  for select to authenticated using (public.is_studio_member());

-- ── 3. Every owner policy → member policy ────────────────────────────────────
-- The restrictive aal2_required policies stay (is_studio_member() already
-- demands aal2; belt and braces). plaid_items has no owner policy and no
-- grants for authenticated (service role only) — unchanged on purpose.
do $$
declare t text;
begin
  foreach t in array array['money_accounts','transactions','transaction_splits','manual_recurring','receipts',
                           'rules','allocations','revenue','ad_spend','payouts']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format('drop policy if exists %I on public.%I', t || '_member', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_studio_member()) with check (public.is_studio_member())',
                   t || '_member', t);
  end loop;
end $$;

-- Receipt files: any member, with 2FA, can read and add files in the bucket
-- (uploads still land under the uploader's own <uid>/ folder).
drop policy if exists receipts_objects_owner on storage.objects;
drop policy if exists receipts_objects_member on storage.objects;
create policy receipts_objects_member on storage.objects for all to authenticated
  using (bucket_id = 'receipts' and public.is_studio_member())
  with check (bucket_id = 'receipts' and public.is_studio_member());

-- v_plaid_status read `owner_id = auth.uid()` directly; same rule, both members.
create or replace view public.v_plaid_status as
  select id, institution, status, updated_at
    from public.plaid_items
   where public.is_studio_member();
grant select on public.v_plaid_status to authenticated, service_role;

-- ── 4. One data owner: force_studio_owner() on every table with owner_id ─────
create or replace function public.force_studio_owner()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.owner_id := coalesce((select user_id from studio_members order by added_at limit 1), new.owner_id);
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['money_accounts','plaid_items','transactions','transaction_splits','manual_recurring',
                           'receipts','rules','allocations','revenue','ad_spend','payouts']
  loop
    execute format('drop trigger if exists force_studio_owner on public.%I', t);
    -- Named so it fires before transactions_flag_duplicate (alphabetical), which reads new.owner_id.
    execute format('create trigger force_studio_owner before insert on public.%I for each row execute function public.force_studio_owner()', t);
  end loop;
end $$;

-- ── 5. Invites: an email here becomes a member when its auth user appears ────
create table if not exists public.studio_member_invites (
  email text primary key,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.studio_member_invites enable row level security;
revoke all on public.studio_member_invites from anon, authenticated;
grant select, insert, update, delete on public.studio_member_invites to service_role;

insert into public.studio_member_invites (email, display_name)
values ('andrewjmachado@gmail.com', 'Andrew')
on conflict (email) do nothing;

create or replace function public.studio_member_from_invite()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare inv record;
begin
  select * into inv from studio_member_invites where email = lower(new.email);
  if inv.email is not null then
    insert into studio_members (user_id, email, display_name)
    values (new.id, lower(new.email), inv.display_name)
    on conflict (user_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists studio_member_from_invite on auth.users;
create trigger studio_member_from_invite after insert on auth.users
  for each row execute function public.studio_member_from_invite();

-- If the user was invited before this ran, pick them up now.
insert into public.studio_members (user_id, email, display_name)
select u.id, lower(u.email), i.display_name
  from auth.users u join public.studio_member_invites i on i.email = lower(u.email)
on conflict (user_id) do nothing;

-- Manual path (SQL editor / service role): add_studio_member('x@y.com', 'Name').
create or replace function public.add_studio_member(p_email text, p_display_name text default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare uid uuid;
begin
  select id into uid from auth.users where lower(email) = lower(p_email);
  if uid is null then
    raise exception 'No auth user with email %. Invite them first (Auth → Users → Invite user).', p_email;
  end if;
  insert into studio_members (user_id, email, display_name) values (uid, lower(p_email), p_display_name)
  on conflict (user_id) do update set display_name = coalesce(excluded.display_name, studio_members.display_name);
  return uid;
end $$;
revoke execute on function public.add_studio_member(text, text) from public, anon, authenticated;
grant execute on function public.add_studio_member(text, text) to service_role;

-- ── 6. Security page: who the members are and whether they're set up ─────────
-- Reads auth.users / auth.mfa_factors on the members' behalf (security definer),
-- only for a signed-in member. No secrets: email, name, authenticator yes/no,
-- last sign-in.
create or replace function public.studio_members_status()
returns table (user_id uuid, email text, display_name text, added_at timestamptz, last_sign_in_at timestamptz, totp_enrolled boolean)
language sql stable security definer
set search_path = public
as $$
  select m.user_id, m.email, m.display_name, m.added_at, u.last_sign_in_at,
         exists (select 1 from auth.mfa_factors f where f.user_id = m.user_id and f.factor_type = 'totp' and f.status = 'verified')
    from studio_members m
    join auth.users u on u.id = m.user_id
   where public.is_studio_member()
   order by m.added_at
$$;
revoke execute on function public.studio_members_status() from public, anon;
grant execute on function public.studio_members_status() to authenticated, service_role;
