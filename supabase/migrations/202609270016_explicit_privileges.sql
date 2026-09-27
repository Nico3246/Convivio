begin;
revoke create on schema public,private from public,anon,authenticated;
-- Supabase projects can grant anon/authenticated EXECUTE explicitly through
-- default ACLs. Revoking PUBLIC alone does not revoke those grants.
-- These defaults belong to the migration owner; use that same role for updates.
alter default privileges revoke execute on functions from public,anon,authenticated,service_role;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated,service_role;
alter default privileges in schema private revoke execute on functions from public,anon,authenticated,service_role;
alter default privileges revoke all on tables from public,anon,authenticated;
alter default privileges in schema public revoke all on tables from public,anon,authenticated;
alter default privileges in schema private revoke all on tables from public,anon,authenticated;

-- Convivio uses a dedicated project. Restore a complete allowlist atomically;
-- no internal RPC relies on a provider's initial grants.
revoke execute on all functions in schema public,private from public,anon,authenticated,service_role;
do $$ declare f record; server_only text[]:=array[
 'claim_membership','claim_cleanup','finish_cleanup','materialize_tasks',
 'generate_weekly_report','run_maintenance','cleanup_attachment_reservations',
 'claim_push_deliveries','finish_push_delivery'
]; client_api text[]:=array[
 'get_session','save_debt','save_expense','save_payment','create_rule','propose_rule_change','decide_rule_change',
 'register_fault','comment_fault','maintain_fault','delete_fault','register_complaint','request_visit_exception','decide_visit_exception',
 'delete_account','invite_replacement','add_inventory_item','set_inventory_quantity','add_shopping_item','buy_shopping_item',
 'create_task_template','complete_task','create_shower_slot','edit_shower_slot','swap_shower_slots','set_task_enabled','refresh_calendar',
 'buy_and_stock_item','rename_household','list_invitations','cancel_invitation','mark_notification_read',
 'reserve_attachment','finish_attachment','register_push_token','unregister_push_token','money_summary','fault_statistics','fault_monthly'
];
begin
 for f in select p.oid::regprocedure signature,p.proname,n.nspname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in('public','private') loop
  if f.nspname='public' and f.proname=any(server_only) then
   execute format('grant execute on function %s to service_role',f.signature);
  elsif f.nspname='public' and f.proname=any(client_api) then
   execute format('grant execute on function %s to authenticated',f.signature);
  elsif f.nspname='private' and f.proname in('my_member','my_role','is_resident') then
   execute format('grant execute on function %s to authenticated',f.signature);
  end if;
 end loop;
end $$;
revoke all on public.fault_history,public.latest_rules from public,anon,authenticated;
grant select on public.fault_history,public.latest_rules to authenticated;
commit;
