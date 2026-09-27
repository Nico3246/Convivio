-- Run after ALL migrations, before bootstrap or opening the application.
-- Read-only gate: raise an error if a privileged service RPC is client-callable.
do $$ declare function_id oid;begin
 for function_id in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') loop
  if has_function_privilege('anon',function_id,'EXECUTE') then
   raise exception 'Una función del proyecto es ejecutable por anon: %',function_id::regprocedure;
  end if;
 end loop;
 for function_id in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('claim_membership','claim_cleanup','finish_cleanup',
   'materialize_tasks','generate_weekly_report','run_maintenance','cleanup_attachment_reservations','claim_push_deliveries','finish_push_delivery') loop
  if has_function_privilege('authenticated',function_id,'EXECUTE') or not has_function_privilege('service_role',function_id,'EXECUTE') then
   raise exception 'Permiso de mantenimiento incorrecto: %',function_id::regprocedure;
  end if;
 end loop;
end $$;
