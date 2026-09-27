begin;
create function public.add_inventory_item(p_household uuid,p_scope public.inventory_scope,p_name text,p_quantity numeric,p_unit text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 payload:=jsonb_build_array(p_scope,p_name,p_quantity,p_unit);
 r:=private.replay(p_household,a,'add_inventory',p_request_id,payload); if r is not null then return r; end if;
 insert into public.inventory_items(household_id,scope,owner_id,created_by,name,quantity,unit)
   values(p_household,p_scope,case when p_scope='PERSONAL' then a else null end,a,p_name,p_quantity,p_unit) returning id into r;
 perform private.remember(p_household,a,'add_inventory',p_request_id,payload,r); return r;
end $$;
create function public.set_inventory_quantity(p_household uuid,p_item uuid,p_quantity numeric,p_expected_revision integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare a uuid; i public.inventory_items;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 select * into i from public.inventory_items where household_id=p_household and id=p_item
   and (scope<>'PERSONAL' or owner_id=a) for update;
 if not found then raise exception 'Producto no disponible' using errcode='42501'; end if;
 if i.revision is distinct from p_expected_revision then raise exception 'La cantidad cambió; vuelve a cargarla' using errcode='40001'; end if;
 update public.inventory_items set quantity=p_quantity,revision=revision+1 where id=i.id;
 return i.revision+1;
end $$;
create function public.add_shopping_item(p_household uuid,p_scope public.inventory_scope,p_name text,p_quantity numeric,p_unit text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 payload:=jsonb_build_array(p_scope,p_name,p_quantity,p_unit);
 r:=private.replay(p_household,a,'add_shopping',p_request_id,payload); if r is not null then return r; end if;
 insert into public.shopping_items(household_id,scope,owner_id,created_by,name,quantity,unit)
   values(p_household,p_scope,case when p_scope='PERSONAL' then a else null end,a,p_name,p_quantity,p_unit) returning id into r;
 perform private.remember(p_household,a,'add_shopping',p_request_id,payload,r); return r;
end $$;
create function public.buy_shopping_item(p_household uuid,p_item uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a uuid; i public.shopping_items;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 select * into i from public.shopping_items where household_id=p_household and id=p_item
   and (scope<>'PERSONAL' or owner_id=a) for update;
 if not found then raise exception 'Producto no disponible' using errcode='42501'; end if;
 update public.shopping_items set purchased_by=a,purchased_at=now() where id=i.id and purchased_at is null;
end $$;

create function public.create_task_template(p_household uuid,p_title text,p_description text,p_zone text,p_kind text,p_resident uuid,p_anchor date,p_interval_days integer,p_due_time time,p_alternate boolean,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 perform private.require_resident(p_household,p_resident);
 payload:=jsonb_build_array(p_title,p_description,p_zone,p_kind,p_resident,p_anchor,p_interval_days,p_due_time,p_alternate);
 r:=private.replay(p_household,a,'create_task',p_request_id,payload); if r is not null then return r; end if;
 insert into public.task_templates(household_id,created_by,initial_resident_id,title,description,zone,kind,anchor_date,interval_days,due_time,alternate)
   values(p_household,a,p_resident,p_title,p_description,p_zone,p_kind,p_anchor,p_interval_days,p_due_time,p_alternate) returning id into r;
 perform private.remember(p_household,a,'create_task',p_request_id,payload,r); return r;
end $$;
create function public.materialize_tasks(p_household uuid,p_through date) returns integer
language plpgsql security definer set search_path = '' as $$
declare t public.task_templates; d date; assignee uuid; n integer; inserted integer:=0; step integer; first_step integer;
begin
 perform 1 from public.households where id=p_household for update;
 if p_through is null or p_through>(now() at time zone 'Europe/Madrid')::date+90 then raise exception 'Horizonte de tareas no válido' using errcode='22023'; end if;
 for t in select * from public.task_templates where household_id=p_household and enabled loop
   -- Start after the latest scheduled occurrence; completion never changes this.
   select coalesce(max((due_date-t.anchor_date)/t.interval_days)+1,0) into first_step from public.task_occurrences where template_id=t.id;
   for step in first_step..greatest(first_step-1,(p_through-t.anchor_date)/t.interval_days) loop
     d:=t.anchor_date+step*t.interval_days;
     if d>p_through then exit; end if;
     assignee:=t.initial_resident_id;
     if t.alternate and mod(step,2)=1 then
       select id into assignee from public.members where household_id=p_household and role in ('ADMIN','RESIDENT') and id<>t.initial_resident_id;
     end if;
     if assignee is not null then
       insert into public.task_occurrences(household_id,template_id,assigned_to,due_date,due_time)
         values(p_household,t.id,assignee,d,t.due_time) on conflict do nothing;
       get diagnostics n=row_count; inserted:=inserted+n;
     end if;
   end loop;
 end loop;
 return inserted;
end $$;
create function public.complete_task(p_household uuid,p_task uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare a uuid;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 if not exists(select 1 from public.task_occurrences where household_id=p_household and id=p_task and assigned_to=a) then
   raise exception 'Solo puede completarla el responsable' using errcode='42501'; end if;
 update public.task_occurrences set completed_by=a,completed_at=now() where id=p_task and completed_at is null;
end $$;
create function public.create_shower_slot(p_household uuid,p_resident uuid,p_weekday integer,p_start time,p_end time,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 perform private.require_resident(p_household,p_resident);
 payload:=jsonb_build_array(p_resident,p_weekday,p_start,p_end);
 r:=private.replay(p_household,a,'create_shower',p_request_id,payload); if r is not null then return r; end if;
 if exists(select 1 from public.shower_slots where household_id=p_household and weekday=p_weekday and starts_at<p_end and ends_at>p_start) then
   raise exception 'El turno se solapa con otro existente' using errcode='22023'; end if;
 insert into public.shower_slots(household_id,created_by,resident_id,weekday,starts_at,ends_at)
   values(p_household,a,p_resident,p_weekday,p_start,p_end) returning id into r;
 perform private.remember(p_household,a,'create_shower',p_request_id,payload,r); return r;
end $$;
grant execute on function public.add_inventory_item(uuid,public.inventory_scope,text,numeric,text,uuid),
 public.set_inventory_quantity(uuid,uuid,numeric,integer),public.add_shopping_item(uuid,public.inventory_scope,text,numeric,text,uuid),
 public.buy_shopping_item(uuid,uuid),public.create_task_template(uuid,text,text,text,text,uuid,date,integer,time,boolean,uuid),
 public.complete_task(uuid,uuid),public.create_shower_slot(uuid,uuid,integer,time,time,uuid) to authenticated;
grant execute on function public.materialize_tasks(uuid,date) to service_role;
commit;
