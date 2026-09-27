begin;
create table private.push_deliveries (
 id uuid primary key default gen_random_uuid(),
 notification_id uuid not null references public.notifications on delete cascade,
 token text not null references private.push_tokens(token) on delete cascade,
 ticket_id text, ticket_at timestamptz, delivered_at timestamptz,
 available_at timestamptz not null default now(), attempts integer not null default 0,
 lease_id uuid, leased_until timestamptz,
 unique(notification_id,token)
);
revoke all on private.push_deliveries from public,anon,authenticated;

create function private.enqueue_push() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into private.push_deliveries(notification_id,token)
 select new.id,t.token from private.push_tokens t where t.member_id=new.recipient_id and t.enabled;
 return new;
end $$;
create trigger enqueue_push after insert on public.notifications for each row execute function private.enqueue_push();

create function public.register_push_token(p_household uuid,p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare a uuid;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT','CONTROLLER']::public.member_role[]);
 if p_token is null or length(p_token)>255 or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$' then raise exception 'Dispositivo no válido' using errcode='22023'; end if;
 delete from private.push_tokens where token=p_token and member_id<>a;
 insert into private.push_tokens(member_id,token,enabled) values(a,p_token,true)
 on conflict(member_id,token) do update set enabled=true;
end $$;
create function public.unregister_push_token(p_household uuid,p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare a uuid;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT','CONTROLLER']::public.member_role[]);
 delete from private.push_tokens where member_id=a and token=p_token;
end $$;

create function public.claim_push_deliveries(p_limit integer default 10)
returns table(id uuid,lease_id uuid,token text,ticket_id text,kind text,notification_id uuid,report_id uuid,exception_id uuid)
language plpgsql security definer set search_path='' as $$
begin
 -- Receipts expire after 24 hours; keep the inbox notification but retry delivery.
 update private.push_deliveries set ticket_id=null,ticket_at=null,available_at=now()+interval '1 hour'
   where delivered_at is null and ticket_at<now()-interval '23 hours';
 return query with claimed as (
 update private.push_deliveries d set lease_id=gen_random_uuid(),leased_until=now()+interval '5 minutes',attempts=d.attempts+1
 where d.id in(select j.id from private.push_deliveries j join private.push_tokens t on t.token=j.token
   where t.enabled and j.delivered_at is null and j.available_at<=now() and (j.leased_until is null or j.leased_until<now())
   order by j.available_at limit greatest(1,least(p_limit,20)) for update of j skip locked)
 returning d.*
 ) select c.id,c.lease_id,c.token,c.ticket_id,n.kind,n.id,n.report_id,n.exception_id from claimed c
 join public.notifications n on n.id=c.notification_id;
end $$;

create function public.finish_push_delivery(p_id uuid,p_lease uuid,p_result text,p_ticket text default null) returns void
language plpgsql security definer set search_path='' as $$
declare d private.push_deliveries;
begin
 select * into d from private.push_deliveries where id=p_id and lease_id=p_lease for update;
 if not found then return; end if;
 if p_result='DISABLE' then
   delete from private.push_tokens where token=d.token;
 elsif p_result='OK' then
   update private.push_deliveries set delivered_at=now(),lease_id=null,leased_until=null where id=d.id;
 elsif p_result='TICKET' and p_ticket is not null and length(p_ticket) between 1 and 512 then
   update private.push_deliveries set ticket_id=p_ticket,ticket_at=now(),available_at=now()+interval '15 minutes',lease_id=null,leased_until=null where id=d.id;
 else
   update private.push_deliveries set lease_id=null,leased_until=null,
    available_at=now()+make_interval(secs=>least(3600,30*power(2,least(d.attempts,7))::integer)) where id=d.id;
 end if;
end $$;
grant execute on function public.register_push_token(uuid,text),public.unregister_push_token(uuid,text) to authenticated;
grant execute on function public.claim_push_deliveries(integer),public.finish_push_delivery(uuid,uuid,text,text) to service_role;
commit;
