begin;
create view public.current_rules with(security_invoker=true) as
select distinct on(v.rule_id) v.* from public.rule_versions v
where v.effective_at<=now() order by v.rule_id,v.effective_at desc,v.version desc;
create view public.current_payments with(security_invoker=true) as
select p.id,p.household_id,p.current_version,p.created_at,v.debt_id,v.amount_cents,v.occurred_on,v.recorded_by
from public.payments p join public.payment_versions v on v.payment_id=p.id and v.version=p.current_version;
create view public.scheduled_tasks with(security_invoker=true) as
select o.*,t.title,t.description,t.zone,t.kind,t.alternate
from public.task_occurrences o join public.task_templates t on t.id=o.template_id;
revoke all on public.current_rules,public.current_payments,public.scheduled_tasks from public,anon,authenticated;
grant select on public.current_rules,public.current_payments,public.scheduled_tasks to authenticated;
commit;
