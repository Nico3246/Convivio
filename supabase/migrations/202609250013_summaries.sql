begin;
-- Aggregation happens on the complete, RLS-filtered history, never on a page.
create function public.money_summary(p_household uuid,p_report uuid default null)
returns table(member_id uuid,balance_cents bigint)
language sql stable security invoker set search_path='' as $$
 with boundary as (
   select ends_at as cutoff from public.weekly_reports where id=p_report and household_id=p_household
   union all select 'infinity'::timestamptz where p_report is null
 ), debts as (
   select distinct on(v.debt_id) v.* from public.debt_versions v cross join boundary b
   where v.household_id=p_household and v.created_at<b.cutoff order by v.debt_id,v.version desc
 ), payments as (
   select distinct on(v.payment_id) v.* from public.payment_versions v cross join boundary b
   where v.household_id=p_household and v.created_at<b.cutoff order by v.payment_id,v.version desc
 ), pending as (
   select d.creditor_id,d.debtor_id,d.debt_cents-coalesce((select sum(p.amount_cents) from payments p where p.debt_id=d.debt_id),0) cents from debts d
 ) select m.id,coalesce(sum(case when p.creditor_id=m.id then p.cents else -p.cents end),0)::bigint
 from public.members m left join pending p on m.id in(p.creditor_id,p.debtor_id)
 where m.household_id=p_household and m.role in('ADMIN','RESIDENT') and private.is_resident(p_household)
 group by m.id;
$$;
create function public.fault_statistics(p_household uuid,p_period text default 'ALL')
returns table(responsible_id uuid,category text,total bigint)
language sql stable security invoker set search_path='' as $$
 select f.responsible_id,v.category,count(*) from public.faults f
 join public.rule_versions v on v.id=f.rule_version_id
 where f.household_id=p_household and (p_period='ALL' or
   (p_period='WEEK' and f.occurred_at>=date_trunc('week',now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid') or
   (p_period='MONTH' and f.occurred_at>=date_trunc('month',now() at time zone 'Europe/Madrid') at time zone 'Europe/Madrid'))
 group by f.responsible_id,v.category;
$$;
grant execute on function public.money_summary(uuid,uuid),public.fault_statistics(uuid,text) to authenticated;

-- Structured shower history lets an old report show the schedule at its close.
-- Every identity/reference still participates in definitive account deletion.
create table public.shower_versions (
 id uuid primary key default gen_random_uuid(),household_id uuid not null,slot_id uuid not null,
 resident_id uuid not null,revision integer not null,weekday integer not null,
 starts_at time not null,ends_at time not null,created_at timestamptz not null default now(),
 foreign key(household_id,slot_id) references public.shower_slots(household_id,id) on delete cascade,
 foreign key(household_id,resident_id) references public.members(household_id,id) on delete cascade,
 unique(slot_id,revision),unique(household_id,id)
);
alter table public.shower_versions enable row level security;
revoke all on public.shower_versions from public,anon,authenticated;
grant select on public.shower_versions to authenticated;
grant all on public.shower_versions to service_role;
create policy resident_read on public.shower_versions for select to authenticated using(private.is_resident(household_id));
create function private.version_shower() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.shower_versions(household_id,slot_id,resident_id,revision,weekday,starts_at,ends_at)
 values(new.household_id,new.id,new.resident_id,new.revision,new.weekday,new.starts_at,new.ends_at);
 return new;
end $$;
create trigger version_shower after insert or update on public.shower_slots for each row execute function private.version_shower();
insert into public.shower_versions(household_id,slot_id,resident_id,revision,weekday,starts_at,ends_at)
 select household_id,id,resident_id,revision,weekday,starts_at,ends_at from public.shower_slots;

alter table public.report_entries add column shower_version_id uuid,add column shopping_item_id uuid,
 add foreign key(household_id,shower_version_id) references public.shower_versions(household_id,id) on delete cascade,
 add foreign key(household_id,shopping_item_id) references public.shopping_items(household_id,id) on delete cascade;
alter table public.report_entries drop constraint report_entries_check;
alter table public.report_entries add constraint report_one_source check(num_nonnulls(fault_id,comment_id,complaint_id,deletion_event_id,task_id,debt_version_id,payment_version_id,shower_version_id,shopping_item_id)=1);
drop policy report_entry_read on public.report_entries;
create policy report_entry_read on public.report_entries for select to authenticated using(
 private.my_member(household_id) is not null and
 ((debt_version_id is null and payment_version_id is null and task_id is null and shower_version_id is null and shopping_item_id is null) or private.is_resident(household_id))
 and (shopping_item_id is null or exists(select 1 from public.shopping_items s where s.id=shopping_item_id))
);
create function private.report_household_entries() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.report_entries(household_id,report_id,shower_version_id)
 select new.household_id,new.id,v.id from (
  select distinct on(slot_id) id from public.shower_versions where household_id=new.household_id and created_at<new.ends_at order by slot_id,revision desc
 ) v;
 insert into public.report_entries(household_id,report_id,shopping_item_id)
 select new.household_id,new.id,id from public.shopping_items where household_id=new.household_id and
 ((created_at>=new.starts_at and created_at<new.ends_at) or (purchased_at>=new.starts_at and purchased_at<new.ends_at));
 return new;
end $$;
create trigger report_household_entries after insert on public.weekly_reports for each row execute function private.report_household_entries();
commit;
