begin;
alter table public.shower_slots add column revision integer not null default 1;
alter table public.audit_events add column task_template_id uuid,add column shower_slot_id uuid,
 add constraint audit_task foreign key(household_id,task_template_id) references public.task_templates(household_id,id) on delete cascade,
 add constraint audit_shower foreign key(household_id,shower_slot_id) references public.shower_slots(household_id,id) on delete cascade;

create function public.edit_shower_slot(p_household uuid,p_slot uuid,p_resident uuid,p_weekday integer,p_start time,p_end time,p_expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid; s public.shower_slots;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 perform private.require_resident(p_household,p_resident);
 select * into s from public.shower_slots where household_id=p_household and id=p_slot for update;
 if not found then raise exception 'Turno no disponible' using errcode='22023'; end if;
 if s.revision is distinct from p_expected_revision then raise exception 'El turno cambió; vuelve a cargarlo' using errcode='40001'; end if;
 if exists(select 1 from public.shower_slots where household_id=p_household and id<>s.id and weekday=p_weekday and starts_at<p_end and ends_at>p_start) then
   raise exception 'El turno se solapa con otro existente' using errcode='22023'; end if;
 update public.shower_slots set resident_id=p_resident,weekday=p_weekday,starts_at=p_start,ends_at=p_end,revision=revision+1 where id=s.id;
 insert into public.audit_events(household_id,actor_id,action,shower_slot_id) values(p_household,a,'SHOWER_UPDATED',s.id);
end $$;

create function public.swap_shower_slots(p_household uuid,p_first uuid,p_second uuid,p_first_revision integer,p_second_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid; s public.shower_slots; t public.shower_slots;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 select * into s from public.shower_slots where household_id=p_household and id=p_first;
 select * into t from public.shower_slots where household_id=p_household and id=p_second;
 if s.id is null or t.id is null or s.id=t.id or s.resident_id=t.resident_id then raise exception 'Selecciona turnos de dos residentes distintos' using errcode='22023'; end if;
 if s.revision is distinct from p_first_revision or t.revision is distinct from p_second_revision then raise exception 'El turno cambió; vuelve a cargarlo' using errcode='40001'; end if;
 update public.shower_slots set resident_id=case when id=s.id then t.resident_id else s.resident_id end,revision=revision+1 where id in(s.id,t.id);
 insert into public.audit_events(household_id,actor_id,action,shower_slot_id) values(p_household,a,'SHOWER_SWAPPED',s.id),(p_household,a,'SHOWER_SWAPPED',t.id);
end $$;

create function public.set_task_enabled(p_household uuid,p_template uuid,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 if p_enabled is null or not exists(select 1 from public.task_templates where household_id=p_household and id=p_template) then raise exception 'Tarea no disponible' using errcode='22023'; end if;
 update public.task_templates set enabled=p_enabled where id=p_template;
 -- Existing occurrences, including overdue ones, keep their calendar and owner.
 insert into public.audit_events(household_id,actor_id,action,task_template_id) values(p_household,a,case when p_enabled then 'TASK_ENABLED' else 'TASK_DISABLED' end,p_template);
end $$;

create function public.refresh_calendar(p_household uuid) returns integer
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 return public.materialize_tasks(p_household,(now() at time zone 'Europe/Madrid')::date+14);
end $$;

create function public.buy_and_stock_item(p_household uuid,p_item uuid,p_add_to_inventory boolean)
returns void language plpgsql security definer set search_path='' as $$
declare a uuid; i public.shopping_items;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 select * into i from public.shopping_items where household_id=p_household and id=p_item and (scope<>'PERSONAL' or owner_id=a) for update;
 if not found then raise exception 'Producto no disponible' using errcode='42501'; end if;
 if i.purchased_at is not null then return; end if;
 update public.shopping_items set purchased_by=a,purchased_at=now() where id=i.id;
 if p_add_to_inventory then
   insert into public.inventory_items(household_id,scope,owner_id,created_by,name,quantity,unit)
     values(p_household,i.scope,i.owner_id,a,i.name,i.quantity,i.unit);
 end if;
end $$;

create function public.rename_household(p_household uuid,p_name text) returns void
language plpgsql security definer set search_path='' as $$
declare a uuid;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 update public.households set name=p_name where id=p_household;
 insert into public.audit_events(household_id,actor_id,action) values(p_household,a,'HOUSEHOLD_RENAMED');
end $$;

create function public.list_invitations(p_household uuid) returns table(email text,role public.member_role)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 return query select i.email,i.role from private.invitations i where i.household_id=p_household;
end $$;

create function public.cancel_invitation(p_household uuid,p_role public.member_role) returns void
language plpgsql security definer set search_path='' as $$
declare a uuid;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 if p_role='ADMIN' then raise exception 'No se puede modificar la plaza del administrador' using errcode='22023'; end if;
 delete from private.invitations where household_id=p_household and role=p_role;
 insert into public.audit_events(household_id,actor_id,action) values(p_household,a,'INVITATION_CANCELLED');
end $$;

create function public.mark_notification_read(p_household uuid,p_notification uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a uuid;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT','CONTROLLER']::public.member_role[]);
 update public.notifications set read_at=coalesce(read_at,now()) where household_id=p_household and recipient_id=a and id=p_notification;
end $$;

grant execute on function public.edit_shower_slot(uuid,uuid,uuid,integer,time,time,integer),public.swap_shower_slots(uuid,uuid,uuid,integer,integer),
 public.set_task_enabled(uuid,uuid,boolean),public.refresh_calendar(uuid),public.buy_and_stock_item(uuid,uuid,boolean),
 public.rename_household(uuid,text),public.list_invitations(uuid),public.cancel_invitation(uuid,public.member_role),public.mark_notification_read(uuid,uuid) to authenticated;
commit;
