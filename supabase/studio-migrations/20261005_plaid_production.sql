-- Run once in Supabase → clarendon-studio → SQL Editor (Claude's Supabase tool
-- can't run anything containing DELETE). Backs the Disconnect button.
create or replace function public.forget_plaid_item(p_item_id text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare sid uuid;
begin
  select access_token_secret_id into sid from public.plaid_items where id = p_item_id;
  update public.money_accounts set plaid_item_id = null where plaid_item_id = p_item_id;
  delete from public.plaid_items where id = p_item_id;
  if sid is not null then
    delete from vault.secrets where id = sid;
  end if;
end $function$;
revoke execute on function public.forget_plaid_item(text) from public, anon, authenticated;
grant execute on function public.forget_plaid_item(text) to service_role;
