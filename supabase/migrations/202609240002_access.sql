begin;
create function private.my_member(p_household uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.members where household_id=p_household and auth_user_id=(select auth.uid());
$$;
create function private.my_role(p_household uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select role from public.members where household_id=p_household and auth_user_id=(select auth.uid());
$$;
create function private.is_resident(p_household uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.my_role(p_household) in ('ADMIN','RESIDENT'),false);
$$;
create function private.require_actor(p_household uuid, p_roles public.member_role[])
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_actor uuid;
begin
  -- One household lock serializes sensitive writes for three users and avoids
  -- split checks, overpayment races and report/deletion races.
  if not exists (select 1 from public.members where household_id=p_household
    and auth_user_id=auth.uid() and role=any(p_roles)) then
    raise exception 'Acceso no permitido' using errcode='42501';
  end if;
  perform 1 from public.households where id=p_household for update;
  select id into v_actor from public.members where household_id=p_household
    and auth_user_id=auth.uid() and role=any(p_roles);
  if v_actor is null then raise exception 'Acceso no permitido' using errcode='42501'; end if;
  return v_actor;
end $$;
create function private.require_resident(p_household uuid,p_member uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.members where household_id=p_household and id=p_member and role in ('ADMIN','RESIDENT')) then
    raise exception 'Residente no válido' using errcode='22023';
  end if;
end $$;
create function private.replay(p_household uuid,p_actor uuid,p_operation text,p_key uuid,p_payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_receipt private.command_receipts; v_fingerprint text;
begin
  if p_key is null then raise exception 'Identificador de operación obligatorio' using errcode='22023'; end if;
  v_fingerprint := encode(sha256(convert_to(p_payload::text,'UTF8')),'hex');
  select * into v_receipt from private.command_receipts where actor_id=p_actor and operation=p_operation and request_id=p_key;
  if found then
    if v_receipt.fingerprint <> v_fingerprint then raise exception 'Identificador reutilizado con otros datos' using errcode='22023'; end if;
    return v_receipt.result_id;
  end if;
  return null;
end $$;
create function private.remember(p_household uuid,p_actor uuid,p_operation text,p_key uuid,p_payload jsonb,p_result uuid)
returns void language sql security definer set search_path = '' as $$
  insert into private.command_receipts(household_id,actor_id,operation,request_id,fingerprint,result_id)
    values(p_household,p_actor,p_operation,p_key,encode(sha256(convert_to(p_payload::text,'UTF8')),'hex'),p_result);
$$;
create function private.clear_receipts() returns trigger language plpgsql security definer set search_path = '' as $$
begin delete from private.command_receipts where result_id=old.id; return old; end $$;
create function private.immutable_membership() returns trigger language plpgsql set search_path = '' as $$
begin
  if (new.id,new.household_id,new.auth_user_id,new.role) is distinct from (old.id,old.household_id,old.auth_user_id,old.role) then
    raise exception 'La identidad y el rol de una cuenta son inmutables' using errcode='23514';
  end if; return new;
end $$;
create trigger immutable_membership before update on public.members for each row execute function private.immutable_membership();

-- Lock down every app table. No direct client writes to domain tables.
do $$ declare t text; begin
  foreach t in array array['households','members','rules','rule_versions','rule_proposals','faults','fault_comments','complaints',
    'visit_exceptions','task_templates','task_occurrences','shower_slots','inventory_items','shopping_items',
    'debts','debt_versions','payments','payment_versions','fault_deletion_events','weekly_reports','report_entries','audit_events','attachments','notifications'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on table public.%I from public, anon, authenticated',t);
    execute format('grant select on table public.%I to authenticated',t);
    execute format('grant all on table public.%I to service_role',t);
    execute format('create trigger cleanup_receipts after delete on public.%I for each row execute function private.clear_receipts()',t);
  end loop;
end $$;
revoke select on public.members from authenticated;
grant select(id,household_id,role,display_name,created_at) on public.members to authenticated;
create policy household_read on public.households for select to authenticated using(private.my_member(id) is not null);
create policy members_read on public.members for select to authenticated using(private.my_member(household_id) is not null);
do $$ declare t text; begin
  foreach t in array array['rules','rule_versions','rule_proposals','faults','fault_comments','complaints','visit_exceptions','fault_deletion_events','weekly_reports'] loop
    execute format('create policy member_read on public.%I for select to authenticated using(private.my_member(household_id) is not null)',t);
  end loop;
  foreach t in array array['task_templates','task_occurrences','shower_slots','debts','debt_versions','payments','payment_versions'] loop
    execute format('create policy resident_read on public.%I for select to authenticated using(private.is_resident(household_id))',t);
  end loop;
  foreach t in array array['inventory_items','shopping_items'] loop
    execute format('create policy owner_or_common_read on public.%I for select to authenticated using(private.is_resident(household_id) and (scope<>''PERSONAL'' or owner_id=private.my_member(household_id)))',t);
  end loop;
end $$;
create policy report_entry_read on public.report_entries for select to authenticated using(
  private.my_member(household_id) is not null and
  ((debt_version_id is null and payment_version_id is null and task_id is null) or private.is_resident(household_id))
);
create policy audit_admin_read on public.audit_events for select to authenticated using(private.my_role(household_id)='ADMIN');
create policy attachments_read on public.attachments for select to authenticated using(
  private.my_member(household_id) is not null and (bucket <> 'receipts' or private.is_resident(household_id))
);
create policy notification_owner_read on public.notifications for select to authenticated using(recipient_id=private.my_member(household_id));

create function public.get_session() returns table(member_id uuid,household_id uuid,role public.member_role,display_name text)
language sql stable security definer set search_path = '' as $$
  select m.id,m.household_id,m.role,m.display_name from public.members m where m.auth_user_id=auth.uid();
$$;
create function public.claim_membership(p_auth_user uuid,p_verified_email text,p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_inv private.invitations; v_id uuid;
begin
  select id into v_id from public.members where auth_user_id=p_auth_user;
  if found then return v_id; end if;
  select * into v_inv from private.invitations where email=lower(trim(p_verified_email));
  if not found then raise exception 'Cuenta no autorizada' using errcode='42501'; end if;
  perform 1 from public.households where id=v_inv.household_id for update;
  select * into v_inv from private.invitations where email=lower(trim(p_verified_email)) for update;
  if not found then raise exception 'Autorización ya utilizada' using errcode='42501'; end if;
  insert into public.members(household_id,auth_user_id,role,display_name)
    values(v_inv.household_id,p_auth_user,v_inv.role,p_name) returning id into v_id;
  delete from private.invitations where email=v_inv.email;
  return v_id;
end $$;
revoke all on all tables in schema private from public,anon,authenticated;
revoke execute on all functions in schema private from public,anon,authenticated;
grant execute on function private.my_member(uuid), private.my_role(uuid),private.is_resident(uuid) to authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
grant execute on function public.get_session() to authenticated;
grant execute on function public.claim_membership(uuid,text,text) to service_role;
commit;
