begin;
create function private.enqueue_attachment_cleanup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into private.cleanup_queue(kind,bucket,object_path) values('STORAGE',old.bucket,old.object_path) on conflict do nothing;
 return old;
end $$;
create trigger attachment_cleanup after delete on public.attachments for each row execute function private.enqueue_attachment_cleanup();
create function private.remove_member_related_rules() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 -- Remove the whole rule when this member approved/decided its evolution;
 -- otherwise deleting a current version would silently reactivate an old rule.
 if exists(select 1 from public.households where id=old.household_id) then
   delete from public.rules r where r.household_id=old.household_id and
    (r.created_by=old.id or exists(select 1 from public.rule_versions v where v.rule_id=r.id and (v.created_by=old.id or v.approved_by=old.id))
      or exists(select 1 from public.rule_proposals p where p.rule_id=r.id and (p.proposed_by=old.id or p.decided_by=old.id)));
 end if;
 return old;
end $$;
create trigger member_related_rules before delete on public.members for each row execute function private.remove_member_related_rules();
create function private.member_deleted() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into private.cleanup_queue(kind,auth_user_id) values('AUTH',old.auth_user_id) on conflict do nothing;
 if old.role='ADMIN' then delete from public.households where id=old.household_id; end if;
 return old;
end $$;
create trigger member_deleted after delete on public.members for each row execute function private.member_deleted();

create function public.delete_account(p_household uuid,p_member uuid,p_confirmation text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare a uuid; m public.members;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 select * into m from public.members where household_id=p_household and id=p_member for update;
 if not found then raise exception 'Cuenta no encontrada' using errcode='22023'; end if;
 if p_confirmation is distinct from (case when m.role='ADMIN' then 'ELIMINAR PISO' else 'ELIMINAR CUENTA' end) then
   raise exception 'Confirmación de borrado incorrecta' using errcode='22023'; end if;
 if m.role='ADMIN' then delete from public.households where id=p_household;
 else delete from public.members where id=m.id; end if;
 return jsonb_build_object('access_revoked',true,'physical_cleanup_pending',true,'household_deleted',m.role='ADMIN');
end $$;
create function public.invite_replacement(p_household uuid,p_email text,p_role public.member_role)
returns void language plpgsql security definer set search_path = '' as $$
declare a uuid;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 if p_role is null or p_role='ADMIN' or exists(select 1 from public.members where household_id=p_household and role=p_role) then
   raise exception 'La plaza debe estar libre; los roles existentes no cambian' using errcode='22023'; end if;
 insert into private.invitations(household_id,email,role) values(p_household,lower(trim(p_email)),p_role);
 -- No PII copy in audit. The invitation itself is removed when claimed.
 insert into public.audit_events(household_id,actor_id,action) values(p_household,a,'REPLACEMENT_INVITED');
end $$;

-- Service-only leased queue. It survives household deletion and disappears after
-- physical cleanup. It is operational state, not retained account history.
create function public.claim_cleanup(p_limit integer default 20)
returns setof private.cleanup_queue language plpgsql security definer set search_path = '' as $$
begin
 return query update private.cleanup_queue q set leased_until=now()+interval '5 minutes',lease_id=gen_random_uuid(),attempts=q.attempts+1
   where q.id in (select id from private.cleanup_queue where available_at<=now()
     and (leased_until is null or leased_until<now()) order by case when kind='STORAGE' then 0 else 1 end,created_at
     limit greatest(1,least(p_limit,50)) for update skip locked) returning q.*;
end $$;
create function public.finish_cleanup(p_id uuid,p_lease uuid,p_success boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
 if p_success then delete from private.cleanup_queue where id=p_id and lease_id=p_lease;
 else update private.cleanup_queue set leased_until=null,lease_id=null,
   available_at=now()+make_interval(secs=>least(3600,30*greatest(1,attempts))) where id=p_id and lease_id=p_lease; end if;
end $$;
grant execute on function public.delete_account(uuid,uuid,text),public.invite_replacement(uuid,text,public.member_role) to authenticated;
grant execute on function public.claim_cleanup(integer),public.finish_cleanup(uuid,uuid,boolean) to service_role;
commit;
