begin;
alter table public.rules add column source_complaint_id uuid,
  add constraint rules_source foreign key(household_id,source_complaint_id) references public.complaints(household_id,id) on delete cascade;
create function public.create_rule(p_household uuid,p_title text,p_category text,p_description text,p_effective_at timestamptz,p_request_id uuid,p_complaint_id uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 payload:=jsonb_build_array(p_title,p_category,p_description,p_effective_at,p_complaint_id);
 r:=private.replay(p_household,a,'create_rule',p_request_id,payload); if r is not null then return r; end if;
 insert into public.rules(household_id,created_by,source_complaint_id) values(p_household,a,p_complaint_id) returning id into r;
 insert into public.rule_versions(household_id,rule_id,version,title,category,description,effective_at,created_by)
   values(p_household,r,1,p_title,p_category,p_description,p_effective_at,a);
 insert into public.audit_events(household_id,actor_id,action,rule_id) values(p_household,a,'RULE_CREATED',r);
 perform private.remember(p_household,a,'create_rule',p_request_id,payload,r); return r;
end $$;
create function public.propose_rule_change(p_household uuid,p_rule uuid,p_title text,p_category text,p_description text,p_reason text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; v integer; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 payload:=jsonb_build_array(p_rule,p_title,p_category,p_description,p_reason);
 r:=private.replay(p_household,a,'propose_rule',p_request_id,payload); if r is not null then return r; end if;
 select max(version) into v from public.rule_versions where household_id=p_household and rule_id=p_rule;
 if v is null then raise exception 'Norma no encontrada' using errcode='22023'; end if;
 insert into public.rule_proposals(household_id,rule_id,base_version,title,category,description,reason,proposed_by)
   values(p_household,p_rule,v,p_title,p_category,p_description,coalesce(p_reason,''),a) returning id into r;
 insert into public.audit_events(household_id,actor_id,action,proposal_id) values(p_household,a,'RULE_CHANGE_PROPOSED',r);
 perform private.remember(p_household,a,'propose_rule',p_request_id,payload,r); return r;
end $$;
create function public.decide_rule_change(p_household uuid,p_proposal uuid,p_decision public.decision)
returns void language plpgsql security definer set search_path = '' as $$
declare a uuid; p public.rule_proposals; v integer;
begin
 a:=private.require_actor(p_household,array['CONTROLLER']::public.member_role[]);
 select * into p from public.rule_proposals where household_id=p_household and id=p_proposal for update;
 if not found or p_decision is null then raise exception 'Propuesta no válida' using errcode='22023'; end if;
 if p.result=p_decision then return; end if;
 if p.result is not null then raise exception 'La propuesta ya está resuelta' using errcode='22023'; end if;
 select max(version) into v from public.rule_versions where rule_id=p.rule_id;
 if v<>p.base_version then raise exception 'La norma cambió: crea una propuesta nueva' using errcode='40001'; end if;
 if p_decision='APPROVED' then
   insert into public.rule_versions(household_id,rule_id,version,title,category,description,effective_at,created_by,approved_by)
     values(p_household,p.rule_id,v+1,p.title,p.category,p.description,now(),p.proposed_by,a);
 end if;
 update public.rule_proposals set result=p_decision,decided_by=a,decided_at=now() where id=p.id;
 insert into public.audit_events(household_id,actor_id,action,proposal_id) values(p_household,a,'RULE_CHANGE_'||p_decision::text,p.id);
end $$;

create function public.register_fault(p_household uuid,p_responsible uuid,p_rule uuid,p_occurred_at timestamptz,p_description text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; v uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 payload:=jsonb_build_array(p_responsible,p_rule,p_occurred_at,p_description);
 r:=private.replay(p_household,a,'register_fault',p_request_id,payload); if r is not null then return r; end if;
 perform private.require_resident(p_household,p_responsible);
 select id into v from public.rule_versions where household_id=p_household and rule_id=p_rule and effective_at<=p_occurred_at
   order by effective_at desc,version desc limit 1;
 if v is null then raise exception 'No existía una versión vigente de esa norma en esa fecha' using errcode='22023'; end if;
 insert into public.faults(household_id,rule_version_id,reported_by,responsible_id,occurred_at,description)
   values(p_household,v,a,p_responsible,p_occurred_at,p_description) returning id into r;
 perform private.remember(p_household,a,'register_fault',p_request_id,payload,r); return r;
end $$;
create function public.comment_fault(p_household uuid,p_fault uuid,p_body text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 payload:=jsonb_build_array(p_fault,p_body);
 r:=private.replay(p_household,a,'comment_fault',p_request_id,payload); if r is not null then return r; end if;
 insert into public.fault_comments(household_id,fault_id,author_id,body) values(p_household,p_fault,a,p_body) returning id into r;
 perform private.remember(p_household,a,'comment_fault',p_request_id,payload,r); return r;
end $$;
create function public.maintain_fault(p_household uuid,p_fault uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a uuid;
begin
 a:=private.require_actor(p_household,array['CONTROLLER']::public.member_role[]);
 if not exists(select 1 from public.faults where household_id=p_household and id=p_fault) then raise exception 'Falta no encontrada' using errcode='22023'; end if;
 update public.faults set maintained_by=a,maintained_at=now() where id=p_fault and maintained_at is null;
end $$;
create function public.delete_fault(p_household uuid,p_fault uuid,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['CONTROLLER']::public.member_role[]);
 payload:=jsonb_build_array(p_fault);
 r:=private.replay(p_household,a,'delete_fault',p_request_id,payload); if r is not null then return r; end if;
 if not exists(select 1 from public.faults where household_id=p_household and id=p_fault) then raise exception 'Falta no encontrada' using errcode='22023'; end if;
 insert into public.fault_deletion_events(household_id,deleted_by) values(p_household,a) returning id into r;
 insert into public.report_entries(household_id,report_id,deletion_event_id)
   select distinct p_household,e.report_id,r from public.report_entries e
   left join public.fault_comments c on c.id=e.comment_id
   where e.household_id=p_household and (e.fault_id=p_fault or c.fault_id=p_fault);
 insert into public.audit_events(household_id,actor_id,action,deletion_event_id) values(p_household,a,'FAULT_DELETED',r);
 delete from public.faults where id=p_fault and household_id=p_household;
 perform private.remember(p_household,a,'delete_fault',p_request_id,payload,r); return r;
end $$;
create function public.register_complaint(p_household uuid,p_target uuid,p_title text,p_description text,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 payload:=jsonb_build_array(p_target,p_title,p_description);
 r:=private.replay(p_household,a,'register_complaint',p_request_id,payload); if r is not null then return r; end if;
 if p_target is not null then perform private.require_resident(p_household,p_target); end if;
 insert into public.complaints(household_id,author_id,target_id,title,description) values(p_household,a,p_target,p_title,p_description) returning id into r;
 perform private.remember(p_household,a,'register_complaint',p_request_id,payload,r); return r;
end $$;

create function public.request_visit_exception(p_household uuid,p_visitor text,p_reason text,p_kind text,p_starts_at timestamptz,p_ends_at timestamptz,p_request_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare a uuid; r uuid; other_id uuid; controller uuid; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT']::public.member_role[]);
 payload:=jsonb_build_array(p_visitor,p_reason,p_kind,p_starts_at,p_ends_at);
 r:=private.replay(p_household,a,'request_exception',p_request_id,payload); if r is not null then return r; end if;
 select id into other_id from public.members where household_id=p_household and role in ('ADMIN','RESIDENT') and id<>a;
 select id into controller from public.members where household_id=p_household and role='CONTROLLER';
 if other_id is null or controller is null then raise exception 'Deben estar dadas de alta las tres cuentas' using errcode='22023'; end if;
 if p_ends_at<=now() then raise exception 'La visita ya ha terminado' using errcode='22023'; end if;
 insert into public.visit_exceptions(household_id,requested_by,other_resident_id,controller_id,visitor,reason,kind,starts_at,ends_at)
   values(p_household,a,other_id,controller,p_visitor,p_reason,p_kind,p_starts_at,p_ends_at) returning id into r;
 insert into public.notifications(household_id,recipient_id,exception_id,kind)
   values(p_household,other_id,r,'EXCEPTION_REQUEST'),(p_household,controller,r,'EXCEPTION_REQUEST');
 perform private.remember(p_household,a,'request_exception',p_request_id,payload,r); return r;
end $$;
create function public.decide_visit_exception(p_household uuid,p_exception uuid,p_decision public.decision)
returns public.exception_status language plpgsql security definer set search_path = '' as $$
declare a uuid; e public.visit_exceptions; final_status public.exception_status;
begin
 a:=private.require_actor(p_household,array['ADMIN','RESIDENT','CONTROLLER']::public.member_role[]);
 select * into e from public.visit_exceptions where household_id=p_household and id=p_exception for update;
 if not found or p_decision is null or a not in (e.other_resident_id,e.controller_id) then raise exception 'No puedes resolver esta solicitud' using errcode='42501'; end if;
 if (a=e.other_resident_id and e.resident_decision=p_decision) or (a=e.controller_id and e.controller_decision=p_decision) then return e.status; end if;
 if e.status<>'PENDING' or e.ends_at<=now() then raise exception 'La solicitud ya no admite decisiones' using errcode='22023'; end if;
 if a=e.other_resident_id then
   if e.resident_decision is not null then raise exception 'Ya has respondido' using errcode='22023'; end if;
   e.resident_decision:=p_decision;
   update public.visit_exceptions set resident_decision=p_decision,resident_decided_at=now() where id=e.id;
 else
   if e.controller_decision is not null then raise exception 'Ya has respondido' using errcode='22023'; end if;
   e.controller_decision:=p_decision;
   update public.visit_exceptions set controller_decision=p_decision,controller_decided_at=now() where id=e.id;
 end if;
 final_status:=case when e.resident_decision='REJECTED' or e.controller_decision='REJECTED' then 'REJECTED'::public.exception_status
   when e.resident_decision='APPROVED' and e.controller_decision='APPROVED' then 'APPROVED'::public.exception_status
   else 'PENDING'::public.exception_status end;
 update public.visit_exceptions set status=final_status where id=e.id;
 insert into public.audit_events(household_id,actor_id,action,exception_id) values(p_household,a,'EXCEPTION_'||p_decision::text,e.id);
 if final_status<>'PENDING' then
   insert into public.notifications(household_id,recipient_id,exception_id,kind)
     values(p_household,e.requested_by,e.id,'EXCEPTION_'||final_status::text) on conflict do nothing;
 end if;
 return final_status;
end $$;
grant execute on function public.create_rule(uuid,text,text,text,timestamptz,uuid,uuid),
 public.propose_rule_change(uuid,uuid,text,text,text,text,uuid),public.decide_rule_change(uuid,uuid,public.decision),
 public.register_fault(uuid,uuid,uuid,timestamptz,text,uuid),public.comment_fault(uuid,uuid,text,uuid),
 public.maintain_fault(uuid,uuid),public.delete_fault(uuid,uuid,uuid),public.register_complaint(uuid,uuid,text,text,uuid),
 public.request_visit_exception(uuid,text,text,text,timestamptz,timestamptz,uuid),public.decide_visit_exception(uuid,uuid,public.decision)
to authenticated;
commit;
