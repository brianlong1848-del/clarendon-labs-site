-- APPLIED 2026-11-07 by the master project via the Supabase connector (clarendon-studio).
-- Every 15 minutes: public.studio_push_digest() reads Vault secret 'studio_cron_secret'
-- (= Vercel CRON_SECRET) and GETs https://www.clarendon.dev/api/cron/push-digest with it.
-- One-time setup Brian runs in the SQL editor (value from Vercel → clarendon-labs-site → Settings → Environment Variables → CRON_SECRET):
--   select vault.create_secret('<CRON_SECRET value>', 'studio_cron_secret', 'Bearer token for /api/cron/push-digest');
-- To rotate: select vault.update_secret(id, '<new value>') from vault.secrets where name = 'studio_cron_secret';
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create or replace function public.studio_push_digest() returns void
language plpgsql security definer set search_path = public, extensions, vault as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'studio_cron_secret' limit 1;
  if secret is null then raise notice 'studio_cron_secret not set in Vault'; return; end if;
  perform net.http_get(url := 'https://www.clarendon.dev/api/cron/push-digest',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret), timeout_milliseconds := 50000);
end $$;
revoke all on function public.studio_push_digest() from public, anon, authenticated;
select cron.schedule('studio-push-digest', '*/15 * * * *', $$ select public.studio_push_digest() $$);
