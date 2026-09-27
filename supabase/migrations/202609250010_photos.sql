begin;
alter table public.attachments add column uploaded_at timestamptz,
 add column upload_expires_at timestamptz not null default now()+interval '15 minutes';

create function public.reserve_attachment(p_household uuid,p_kind text,p_record uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid; r uuid; bucket_name text; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 payload:=jsonb_build_array(p_kind,p_record);
 r:=private.replay(p_household,a,'reserve_attachment',p_request_id,payload);
 if r is not null then
   update public.attachments set upload_expires_at=now()+interval '15 minutes' where id=r and uploaded_at is null;
   return r;
 end if;
 if p_kind='FAULT' and exists(select 1 from public.faults where household_id=p_household and id=p_record and reported_by=a) then bucket_name:='fault-evidence';
 elsif p_kind='COMPLAINT' and exists(select 1 from public.complaints where household_id=p_household and id=p_record and author_id=a) then bucket_name:='complaint-evidence';
 elsif p_kind='EXPENSE' and exists(select 1 from public.debts where household_id=p_household and id=p_record and kind='EXPENSE') then bucket_name:='receipts';
 else raise exception 'No puedes adjuntar una imagen a este registro' using errcode='42501'; end if;
 if (select count(*) from public.attachments where household_id=p_household and (fault_id=p_record or complaint_id=p_record or debt_id=p_record))>=5 then
   raise exception 'Este registro ya tiene cinco imágenes' using errcode='22023'; end if;
 r:=gen_random_uuid();
 insert into public.attachments(id,household_id,uploaded_by,fault_id,complaint_id,debt_id,bucket,object_path)
 values(r,p_household,a,case when p_kind='FAULT' then p_record end,case when p_kind='COMPLAINT' then p_record end,
   case when p_kind='EXPENSE' then p_record end,bucket_name,p_household::text||'/'||r::text||'.jpg');
 perform private.remember(p_household,a,'reserve_attachment',p_request_id,payload,r); return r;
end $$;

create function public.finish_attachment(p_household uuid,p_attachment uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a uuid; item public.attachments;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 select * into item from public.attachments where household_id=p_household and id=p_attachment and uploaded_by=a;
 if not found then raise exception 'Imagen no disponible' using errcode='42501'; end if;
 if not exists(select 1 from storage.objects where bucket_id=item.bucket and name=item.object_path) then
   raise exception 'La imagen no ha terminado de subir' using errcode='22023'; end if;
 update public.attachments set uploaded_at=coalesce(uploaded_at,now()) where id=item.id;
end $$;

drop policy convivio_reserved_upload on storage.objects;
create policy convivio_reserved_upload on storage.objects for insert to authenticated with check(
 bucket_id in ('fault-evidence','complaint-evidence','receipts') and exists(
   select 1 from public.attachments a where a.bucket=bucket_id and a.object_path=name
    and a.uploaded_by=private.my_member(a.household_id) and a.uploaded_at is null and a.upload_expires_at>now()
 )
);

-- Delay removal past the upload lease, then sweep unlinked metadata as well.
-- This catches a Storage request already in flight when its parent is removed.
create or replace function private.enqueue_attachment_cleanup() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.cleanup_queue(kind,bucket,object_path,available_at)
   values('STORAGE',old.bucket,old.object_path,greatest(now(),old.upload_expires_at)+interval '1 minute')
   on conflict(bucket,object_path) do update set available_at=greatest(private.cleanup_queue.available_at,excluded.available_at);
 return old;
end $$;

create function public.cleanup_attachment_reservations() returns void
language plpgsql security definer set search_path='' as $$
begin
 delete from public.attachments where uploaded_at is null and upload_expires_at<now()-interval '1 hour';
 insert into private.cleanup_queue(kind,bucket,object_path,available_at)
   select 'STORAGE',o.bucket_id,o.name,now()+interval '1 minute' from storage.objects o
   where o.bucket_id in ('fault-evidence','complaint-evidence','receipts')
    and not exists(select 1 from public.attachments a where a.bucket=o.bucket_id and a.object_path=o.name)
   on conflict(bucket,object_path) do nothing;
end $$;
grant execute on function public.reserve_attachment(uuid,text,uuid,uuid),public.finish_attachment(uuid,uuid) to authenticated;
grant execute on function public.cleanup_attachment_reservations() to service_role;
commit;
