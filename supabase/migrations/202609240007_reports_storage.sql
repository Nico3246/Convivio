begin;
create function public.generate_weekly_report(p_household uuid,p_end timestamptz)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r uuid; local_end timestamp; period_start timestamptz;
begin
 perform 1 from public.households where id=p_household for update;
 if not found then raise exception 'Piso no encontrado' using errcode='22023'; end if;
 local_end:=p_end at time zone 'Europe/Madrid';
 if p_end is null or p_end>now() or extract(isodow from local_end)<>6 or local_end::time<>time '12:00' then
   raise exception 'El cierre debe ser un sábado a las 12:00 de Madrid ya transcurrido' using errcode='22023'; end if;
 select id into r from public.weekly_reports where household_id=p_household and ends_at=p_end;
 if found then return r; end if;
 period_start:=(local_end-interval '7 days') at time zone 'Europe/Madrid';
 insert into public.weekly_reports(household_id,starts_at,ends_at) values(p_household,period_start,p_end) returning id into r;
 insert into public.report_entries(household_id,report_id,fault_id)
   select p_household,r,id from public.faults where household_id=p_household and registered_at>=period_start and registered_at<p_end;
 insert into public.report_entries(household_id,report_id,comment_id)
   select p_household,r,id from public.fault_comments where household_id=p_household and created_at>=period_start and created_at<p_end;
 insert into public.report_entries(household_id,report_id,complaint_id)
   select p_household,r,id from public.complaints where household_id=p_household and created_at>=period_start and created_at<p_end;
 insert into public.report_entries(household_id,report_id,deletion_event_id)
   select p_household,r,id from public.fault_deletion_events where household_id=p_household and deleted_at>=period_start and deleted_at<p_end;
 insert into public.report_entries(household_id,report_id,task_id)
   select p_household,r,id from public.task_occurrences where household_id=p_household
     and (due_date+coalesce(due_time,time '23:59:59')) at time zone 'Europe/Madrid'<p_end
     and ((completed_at>=period_start and completed_at<p_end) or completed_at is null or completed_at>=p_end);
 insert into public.report_entries(household_id,report_id,debt_version_id)
   select p_household,r,id from public.debt_versions where household_id=p_household and created_at>=period_start and created_at<p_end;
 insert into public.report_entries(household_id,report_id,payment_version_id)
   select p_household,r,id from public.payment_versions where household_id=p_household and created_at>=period_start and created_at<p_end;
 insert into public.notifications(household_id,recipient_id,report_id,kind)
   select p_household,id,r,'WEEKLY_REPORT' from public.members where household_id=p_household;
 return r;
end $$;
create function public.run_maintenance() returns integer language plpgsql security definer set search_path = '' as $$
declare h public.households; closing timestamp; last_end timestamptz; n integer:=0; rounds integer;
begin
 for h in select * from public.households order by id loop
   perform public.materialize_tasks(h.id,(now() at time zone 'Europe/Madrid')::date+14);
   select max(ends_at) into last_end from public.weekly_reports where household_id=h.id;
   if last_end is null then
     closing:=date_trunc('week',h.created_at at time zone 'Europe/Madrid')+interval '5 days 12 hours';
     if closing at time zone 'Europe/Madrid'<h.created_at then closing:=closing+interval '7 days'; end if;
   else closing:=(last_end at time zone 'Europe/Madrid')+interval '7 days'; end if;
   rounds:=0;
   while closing at time zone 'Europe/Madrid'<=now() and rounds<12 loop
     perform public.generate_weekly_report(h.id,closing at time zone 'Europe/Madrid');
     n:=n+1; rounds:=rounds+1; closing:=closing+interval '7 days';
   end loop;
 end loop;
 return n;
end $$;
grant execute on function public.generate_weekly_report(uuid,timestamptz),public.run_maintenance() to service_role;

-- Private buckets; access is checked against a live domain attachment for EVERY
-- authenticated download. The app must not cache long-lived signed/public URLs.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('fault-evidence','fault-evidence',false,1048576,array['image/jpeg','image/png','image/webp']),
 ('complaint-evidence','complaint-evidence',false,1048576,array['image/jpeg','image/png','image/webp']),
 ('receipts','receipts',false,1048576,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy convivio_private_download on storage.objects for select to authenticated using(
 bucket_id in ('fault-evidence','complaint-evidence','receipts') and exists(
   select 1 from public.attachments a where a.bucket=bucket_id and a.object_path=name
  )
);
create policy convivio_reserved_upload on storage.objects for insert to authenticated with check(
 bucket_id in ('fault-evidence','complaint-evidence','receipts') and exists(
   select 1 from public.attachments a where a.bucket=bucket_id and a.object_path=name
     and a.uploaded_by=private.my_member(a.household_id)
  )
);
-- No update/upsert/delete policy for clients: immutable evidence, physical
-- deletion via Storage API with a server-only service role, not SQL metadata.
commit;
