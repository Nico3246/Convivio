begin;
create view public.fault_history with(security_invoker=true) as
 select f.*,v.rule_id,v.title as rule_title,v.category,
 (select count(*) from public.attachments a where a.fault_id=f.id and a.uploaded_at is not null) photo_count
 from public.faults f join public.rule_versions v on v.id=f.rule_version_id;
grant select on public.fault_history to authenticated;
create function public.fault_monthly(p_household uuid,p_before date default null)
returns table(month text,responsible_id uuid,total bigint)
language sql stable security invoker set search_path='' as $$
 with months as (
  select generate_series(date_trunc('month',coalesce(p_before,(now() at time zone 'Europe/Madrid')::date)::timestamp)-interval '11 months',
   date_trunc('month',coalesce(p_before,(now() at time zone 'Europe/Madrid')::date)::timestamp),interval '1 month') m
 ) select to_char(m.m,'YYYY-MM'),r.id,count(f.id)
 from months m cross join public.members r
 left join public.faults f on f.household_id=r.household_id and f.responsible_id=r.id
  and f.occurred_at>=m.m at time zone 'Europe/Madrid' and f.occurred_at<(m.m+interval '1 month') at time zone 'Europe/Madrid'
 where r.household_id=p_household and r.role in('ADMIN','RESIDENT') group by m.m,r.id order by m.m desc,r.id;
$$;
grant execute on function public.fault_monthly(uuid,date) to authenticated;
commit;
