begin;
-- Own purchases have no debtor. Historical parties remain in every revision,
-- so deleting an account also deletes expenses formerly related to it.
alter table public.debts alter column debtor_id drop not null;
alter table public.debt_versions alter column debtor_id drop not null;
alter table public.debts add constraint manual_debt_has_debtor check(kind='EXPENSE' or debtor_id is not null);
alter table public.debt_versions add column payer_participates boolean not null default true,
  add column products text not null default '' check(length(products)<=5000);

create function public.save_expense(
 p_household uuid,p_payer uuid,p_participants uuid[],p_total_cents bigint,p_concept text,p_occurred_on date,
 p_products text,p_request_id uuid,p_expense_id uuid default null,p_expected_version integer default null,p_reason text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid; r uuid; d public.debts; previous public.debt_versions; debtor uuid; share bigint; v integer; payload jsonb; participates boolean;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 payload:=jsonb_build_array(p_payer,p_participants,p_total_cents,p_concept,p_occurred_on,p_products,p_expense_id,p_expected_version,p_reason);
 r:=private.replay(p_household,a,'save_expense',p_request_id,payload); if r is not null then return r; end if;
 perform private.require_resident(p_household,p_payer);
 if p_participants is null or cardinality(p_participants) not between 1 and 2
   or (select count(distinct x) from unnest(p_participants) x)<>cardinality(p_participants)
   or exists(select 1 from unnest(p_participants) x where not exists(select 1 from public.members m where m.id=x and m.household_id=p_household and m.role in ('ADMIN','RESIDENT')))
   or p_total_cents is null or p_total_cents not between 0 and 1000000000
   or p_occurred_on is null or p_occurred_on>(now() at time zone 'Europe/Madrid')::date then
   raise exception 'Datos del gasto no válidos' using errcode='22023';
 end if;
 participates:=p_payer=any(p_participants);
 select x into debtor from unnest(p_participants) x where x<>p_payer;
 share:=case when debtor is null then 0 when participates then (p_total_cents+1)/2 else p_total_cents end;
 if p_expense_id is null then
   if p_total_cents=0 then raise exception 'El importe inicial debe ser positivo' using errcode='22023'; end if;
   insert into public.debts(household_id,created_by,creditor_id,debtor_id,kind)
     values(p_household,a,p_payer,debtor,'EXPENSE') returning * into d;
   v:=1;
 else
   select * into d from public.debts where household_id=p_household and id=p_expense_id for update;
   if not found or d.kind<>'EXPENSE' then raise exception 'Gasto no encontrado' using errcode='22023'; end if;
   if d.current_version is distinct from p_expected_version then raise exception 'El registro cambió; vuelve a cargarlo' using errcode='40001'; end if;
   select * into previous from public.debt_versions where debt_id=d.id and version=d.current_version;
   if private.paid_cents(d.id)>share then raise exception 'Corrige primero los pagos: superan el nuevo importe' using errcode='22023'; end if;
   if private.paid_cents(d.id)>0 and (previous.creditor_id,previous.debtor_id) is distinct from (p_payer,debtor) then
     raise exception 'Anula o reasigna los pagos antes de cambiar el pagador' using errcode='22023'; end if;
   v:=d.current_version+1;
 end if;
 insert into public.debt_versions(household_id,debt_id,version,total_cents,debt_cents,concept,occurred_on,recorded_by,correction_reason,creditor_id,debtor_id,payer_participates,products)
   values(p_household,d.id,v,p_total_cents,share,p_concept,p_occurred_on,a,case when v=1 then null else p_reason end,p_payer,debtor,participates,coalesce(p_products,''));
 update public.debts set current_version=v where id=d.id;
 insert into public.audit_events(household_id,actor_id,action,debt_id)
   values(p_household,a,case when v=1 then 'DEBT_CREATED' else 'DEBT_CORRECTED' end,d.id);
 perform private.remember(p_household,a,'save_expense',p_request_id,payload,d.id); return d.id;
end $$;

create or replace view public.debt_balances with(security_invoker=true) as
select d.id,d.household_id,d.kind,v.creditor_id,v.debtor_id,d.current_version,v.concept,
 v.total_cents,v.debt_cents,coalesce(p.paid_cents,0)::bigint as paid_cents,
 (v.debt_cents-coalesce(p.paid_cents,0))::bigint as pending_cents,
 v.occurred_on,v.payer_participates,v.products,d.created_at
from public.debts d join public.debt_versions v on v.debt_id=d.id and v.version=d.current_version
left join (
 select pv.debt_id,sum(pv.amount_cents) as paid_cents from public.payments p
 join public.payment_versions pv on pv.payment_id=p.id and pv.version=p.current_version group by pv.debt_id
) p on p.debt_id=d.id;
grant execute on function public.save_expense(uuid,uuid,uuid[],bigint,text,date,text,uuid,uuid,integer,text) to authenticated;
commit;
