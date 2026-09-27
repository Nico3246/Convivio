-- Supabase cloud configuration, after deploying the maintenance Edge Function.
-- Store convivio_project_url and convivio_worker_secret in Supabase Vault first.
-- The worker secret must match the Edge Function environment secret.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if not exists(select 1 from vault.decrypted_secrets where name='convivio_project_url')
    or not exists(select 1 from vault.decrypted_secrets where name='convivio_worker_secret') then
    raise exception 'Faltan los secretos de mantenimiento en Vault';
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname='convivio-maintenance';
end $$;
select cron.schedule('convivio-maintenance','* * * * *',$job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name='convivio_project_url') || '/functions/v1/maintenance',
    headers := jsonb_build_object('Content-Type','application/json',
      'x-convivio-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='convivio_worker_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
commit;
