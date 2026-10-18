-- Money: member loans + repayments in "LLC owes Brian" (2026-10-18)
--
-- Until now "LLC owes Brian" only counted business costs paid from a personal
-- card (v_owner_contributions). Money Brian moves between himself and the LLC
-- is now tagged on the bank row itself with owner_flow:
--   loan_in         Brian lent the LLC cash (adds to what it owes him)
--   loan_repayment  the LLC paid Brian back (reduces it)
--   contribution    Brian put cash in as equity (not owed; shown separately)
--   draw            the LLC paid Brian out of profit/equity (not a repayment)
-- These rows stay status = 'ignored' so they never count as income or expense.

alter table public.transactions
  add column if not exists owner_flow text
  check (owner_flow in ('loan_in', 'loan_repayment', 'contribution', 'draw'));

-- One row per thing that moves the balance. amount_cents here is always
-- "+ adds to what the LLC owes Brian / − reduces it".
create or replace view public.v_owed_to_owner with (security_invoker = true) as
  select c.owner_id, c.id, c.posted_on, c.merchant, 'expense'::text as kind,
         c.owed_cents as amount_cents, t.notes
    from public.v_owner_contributions c
    join public.transactions t on t.id = c.id
   where c.owed_cents <> 0
  union all
  select t.owner_id, t.id, t.posted_on, t.merchant,
         case t.owner_flow when 'loan_in' then 'loan' else 'repayment' end,
         case t.owner_flow when 'loan_in' then abs(t.amount_cents) else -abs(t.amount_cents) end,
         t.notes
    from public.transactions t
   where t.owner_flow in ('loan_in', 'loan_repayment');

-- Equity Brian has put in (for the balance sheet, not owed).
create or replace view public.v_owner_equity with (security_invoker = true) as
  select t.owner_id, t.id, t.posted_on, t.merchant, t.owner_flow,
         case t.owner_flow when 'contribution' then abs(t.amount_cents) else -abs(t.amount_cents) end as amount_cents,
         t.notes
    from public.transactions t
   where t.owner_flow in ('contribution', 'draw');

-- Backfill: the 2026-05-19 $2,000 Zelle was a member loan (Brian, 2026-10-18);
-- the 2026-04-24 $100 transfer from personal BoA was a capital contribution.
update public.transactions set owner_flow = 'loan_in'
 where posted_on = '2026-05-19' and amount_cents = -200000 and owner_flow is null;
update public.transactions set owner_flow = 'contribution'
 where posted_on = '2026-04-24' and amount_cents = -10000 and owner_flow is null;
