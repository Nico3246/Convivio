begin;
alter table public.debt_versions add column creditor_id uuid not null,
  add column debtor_id uuid not null,
  add constraint debt_version_creditor foreign key(household_id,creditor_id) references public.members(household_id,id) on delete cascade,
  add constraint debt_version_debtor foreign key(household_id,debtor_id) references public.members(household_id,id) on delete cascade,
  add constraint different_parties check(creditor_id<>debtor_id);
alter table public.payment_versions add column debt_id uuid not null,
  add constraint payment_version_debt foreign key(household_id,debt_id) references public.debts(household_id,id) on delete cascade;

create function private.paid_cents(p_debt uuid,p_exclude_payment uuid default null) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(v.amount_cents),0)::bigint from public.payments p
  join public.payment_versions v on v.payment_id=p.id and v.version=p.current_version
  where v.debt_id=p_debt and (p_exclude_payment is null or p.id<>p_exclude_payment);
$$;

create function public.save_debt(
  p_household uuid,p_kind text,p_creditor uuid,p_debtor uuid,p_total_cents bigint,
  p_concept text,p_occurred_on date,p_request_id uuid,
  p_debt_id uuid default null,p_expected_version integer default null,p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; d public.debts; v integer; share bigint; payload jsonb;
begin
  a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
  payload:=jsonb_build_array(p_kind,p_creditor,p_debtor,p_total_cents,p_concept,p_occurred_on,p_debt_id,p_expected_version,p_reason);
  r:=private.replay(p_household,a,'save_debt',p_request_id,payload); if r is not null then return r; end if;
  perform private.require_resident(p_household,p_creditor); perform private.require_resident(p_household,p_debtor);
  if p_creditor=p_debtor or p_kind not in ('EXPENSE','MANUAL') or p_kind is null
    or p_total_cents is null or p_total_cents<0 or p_total_cents>1000000000
    or p_occurred_on is null or p_occurred_on>(now() at time zone 'Europe/Madrid')::date then
    raise exception 'Datos económicos no válidos' using errcode='22023'; end if;
  share:=case when p_kind='EXPENSE' then (p_total_cents+1)/2 else p_total_cents end;
  if p_debt_id is null then
    if p_total_cents=0 then raise exception 'El importe inicial debe ser positivo' using errcode='22023'; end if;
    insert into public.debts(household_id,created_by,creditor_id,debtor_id,kind)
      values(p_household,a,p_creditor,p_debtor,p_kind) returning * into d;
    v:=1;
  else
    select * into d from public.debts where id=p_debt_id and household_id=p_household for update;
    if not found then raise exception 'Deuda no encontrada' using errcode='22023'; end if;
    if p_expected_version is distinct from d.current_version then raise exception 'El registro cambió; vuelve a cargarlo' using errcode='40001'; end if;
    if p_kind<>d.kind then raise exception 'No se puede cambiar el tipo de movimiento' using errcode='22023'; end if;
    if share<private.paid_cents(d.id) then raise exception 'Corrige primero los pagos: superan el nuevo importe' using errcode='22023'; end if;
    -- Reversing payer while payments exist would reinterpret real transfers.
    if private.paid_cents(d.id)>0 and exists(select 1 from public.debt_versions where debt_id=d.id and version=d.current_version and creditor_id<>p_creditor) then
      raise exception 'Anula o reasigna los pagos antes de cambiar el pagador' using errcode='22023'; end if;
    v:=d.current_version+1;
  end if;
  insert into public.debt_versions(household_id,debt_id,version,total_cents,debt_cents,concept,occurred_on,recorded_by,correction_reason,creditor_id,debtor_id)
    values(p_household,d.id,v,p_total_cents,share,p_concept,p_occurred_on,a,case when v=1 then null else p_reason end,p_creditor,p_debtor);
  update public.debts set current_version=v where id=d.id;
  insert into public.audit_events(household_id,actor_id,action,debt_id)
    values(p_household,a,case when v=1 then 'DEBT_CREATED' else 'DEBT_CORRECTED' end,d.id);
  perform private.remember(p_household,a,'save_debt',p_request_id,payload,d.id);
  return d.id;
end $$;

create function public.save_payment(
  p_household uuid,p_debt_id uuid,p_amount_cents bigint,p_occurred_on date,p_request_id uuid,
  p_payment_id uuid default null,p_expected_version integer default null,p_reason text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; p public.payments; d public.debts; v integer; capacity bigint; payload jsonb;
begin
  a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
  payload:=jsonb_build_array(p_debt_id,p_amount_cents,p_occurred_on,p_payment_id,p_expected_version,p_reason);
  r:=private.replay(p_household,a,'save_payment',p_request_id,payload); if r is not null then return r; end if;
  select * into d from public.debts where household_id=p_household and id=p_debt_id for update;
  if not found then raise exception 'Deuda no encontrada' using errcode='22023'; end if;
  if p_amount_cents is null or p_amount_cents<0 or p_amount_cents>1000000000 or p_occurred_on is null
    or p_occurred_on>(now() at time zone 'Europe/Madrid')::date then raise exception 'Pago no válido' using errcode='22023'; end if;
  if p_payment_id is not null then
    select * into p from public.payments where id=p_payment_id and household_id=p_household for update;
    if not found then raise exception 'Pago no encontrado' using errcode='22023'; end if;
    if p_expected_version is distinct from p.current_version then raise exception 'El pago cambió; vuelve a cargarlo' using errcode='40001'; end if;
    v:=p.current_version+1;
  else
    if p_amount_cents=0 then raise exception 'El pago inicial debe ser positivo' using errcode='22023'; end if;
    v:=1;
  end if;
  select debt_cents-private.paid_cents(d.id,p_payment_id) into capacity from public.debt_versions
    where debt_id=d.id and version=d.current_version;
  if capacity is null or p_amount_cents>capacity then raise exception 'El pago supera lo pendiente' using errcode='22023'; end if;
  if p_payment_id is null then
    insert into public.payments(household_id,debt_id,created_by) values(p_household,d.id,a) returning * into p;
  end if;
  insert into public.payment_versions(household_id,payment_id,version,amount_cents,recorded_by,occurred_on,correction_reason,debt_id)
    values(p_household,p.id,v,p_amount_cents,a,p_occurred_on,case when v=1 then null else p_reason end,d.id);
  update public.payments set current_version=v where id=p.id;
  insert into public.audit_events(household_id,actor_id,action,payment_id)
    values(p_household,a,case when v=1 then 'PAYMENT_CREATED' else 'PAYMENT_CORRECTED' end,p.id);
  perform private.remember(p_household,a,'save_payment',p_request_id,payload,p.id);
  return p.id;
end $$;

create view public.debt_balances with(security_invoker=true) as
select d.id,d.household_id,d.kind,v.creditor_id,v.debtor_id,d.current_version,v.concept,
  v.total_cents,v.debt_cents,
  coalesce(p.paid_cents,0)::bigint as paid_cents,
  (v.debt_cents-coalesce(p.paid_cents,0))::bigint as pending_cents
from public.debts d join public.debt_versions v on v.debt_id=d.id and v.version=d.current_version
left join (
  select pv.debt_id,sum(pv.amount_cents) as paid_cents from public.payments p
  join public.payment_versions pv on pv.payment_id=p.id and pv.version=p.current_version group by pv.debt_id
) p on p.debt_id=d.id;
revoke all on public.debt_balances from public,anon,authenticated;
grant select on public.debt_balances to authenticated;
grant execute on function public.save_debt(uuid,text,uuid,uuid,bigint,text,date,uuid,uuid,integer,text) to authenticated;
grant execute on function public.save_payment(uuid,uuid,bigint,date,uuid,uuid,integer,text) to authenticated;
commit;
