-- One-off cleanup after the 2026-10-10 Chase reconnect. Run once in
-- Supabase → clarendon-studio → SQL Editor.
--
-- A webhook sync ran before the new item's account row existed, so the 20
-- re-sent transactions landed with account_id = null; 11 of them duplicate
-- rows already in the books. Keep the original 11 (their Triage sorting),
-- give them the new Plaid ids + account, drop the 11 copies, attach the 9 new
-- ones, then drop the old, now-empty account row. All ids are explicit.
begin;

delete from public.transactions where source = 'plaid' and account_id is null and id in (
  'c4517651-375d-4a72-8406-48dc80f632c7', '05f13b4d-0bf8-488e-a7ff-70a452f76aea', '72c550ae-096d-4828-a89f-e980d3a646c4',
  '3311b7a3-e43f-46fa-9e84-8ab04ae67672', '14b8545d-17bd-4dd1-82f9-8f5e21f8e691', 'a0f4cd6a-a086-4ebe-809e-6ae08a1bab07',
  '4990e4b3-5210-4a69-bd26-5aa7413b52ba', 'bc0fdc71-aa95-47e5-a940-93070c3b9586', '8415d7e0-9339-4eda-8498-febb3b7f2ad9',
  '3effb788-5bba-4853-ba9b-a80551b9c7f6', '38f8cf02-68ec-42f4-984f-d8767476894b');

update public.transactions t
   set external_id = v.ext, account_id = '96175bab-4782-46b7-b498-72de6aa2bc64'
  from (values
    ('37726385-4b88-4eb5-9975-261788f166f1'::uuid, 'ek8bvL5o59c1yjN6VDK3H7prwOrDeKs4dOEZE'), -- 2026-07-31 Monthly service fee
    ('446ac67a-aa27-4760-9fbc-41808079b0a2', 'NYeX6xwZw8He1XpONQj5FEBDMeDq8YtyRDaEP'),        -- 2026-08-03 Supabase
    ('62a5863b-4232-4b14-b52c-e94c469d1728', 'Xe3o0VKkKQUVDAzRN801FjKXRqX97xFz4gmZV'),        -- 2026-08-11 Cloudflare
    ('d7ff79ae-06cc-472e-8cd1-aa7d93e0c14a', 'pZEVYvQXQqTLDVYq7ERJtnNbRObMjYHAJok5K'),        -- 2026-08-31 Monthly service fee
    ('208bb6fa-553d-4386-bfcc-c55236b0a15f', 'nJOrxkEqEms0A51zQbV6td3pgJpeNLHjAZewm'),        -- 2026-09-02 Supabase
    ('d858e79f-a050-4747-85c9-a77bf29d03e8', 'Qe671ZDrDbUZd58PEBr3sa71NQ1DLMs9E1maV'),        -- 2026-09-03 Apple deposit
    ('a992af8e-2e6f-4cae-a2e7-7ae28eabe897', 'aB4oXNxQx7hrPepn0vXQiNnbzoVJLgCRd1ow5'),        -- 2026-09-30 Cloudflare
    ('f1e02829-6db6-41e5-a262-f7c573d603b0', '4ovZ7RKgKDfYa4w0pyOKU6J5QP0rvVUeYnwM8'),        -- 2026-09-30 Monthly service fee
    ('d805e65c-69ac-4078-8b10-4b56c8156833', 'roQRKjwBw3fNmg09YV48Hmo3be41ndCYywPdb'),        -- 2026-10-01 Apple deposit
    ('46d5ba7a-4b53-40bb-a95c-30d583ad5111', 'jrgj0B9a9whkjM8zQo0qfzZJ0rO5yBUA4j98Y'),        -- 2026-10-02 Supabase
    ('1254dede-bb0e-41a3-bb73-d44019bef7d7', '0Jmk5VqNqdsjdnNMXz8qCq415V3QRAiyLv3Px')         -- 2026-10-06 Anthropic
  ) v(id, ext)
 where t.id = v.id;

update public.transactions set account_id = '96175bab-4782-46b7-b498-72de6aa2bc64'
 where source = 'plaid' and account_id is null;

delete from public.money_accounts
 where id = '58099350-92df-49a5-bc46-3a6aa1f03037'
   and not exists (select 1 from public.transactions where account_id = '58099350-92df-49a5-bc46-3a6aa1f03037');

commit;

-- Check: expect 20 Chase transactions, 0 without an account, 0 duplicates, 1 account row.
select (select count(*) from public.transactions where source = 'plaid') as plaid_rows,
       (select count(*) from public.transactions where source = 'plaid' and account_id is null) as no_account,
       (select count(*) from (select 1 from public.transactions where source = 'plaid'
          group by posted_on, amount_cents, raw_description having count(*) > 1) d) as duplicates,
       (select count(*) from public.money_accounts) as accounts;
