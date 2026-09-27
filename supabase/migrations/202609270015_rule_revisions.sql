begin;
-- Future initial rules remain discoverable without treating them as effective.
create view public.latest_rules with(security_invoker=true) as
 select distinct on(rule_id) v.* from public.rule_versions v order by rule_id,version desc;
grant select on public.latest_rules to authenticated;

-- The form must identify the revision it actually edited. A second device may
-- have proposed a change and obtained approval while this form was open.
drop function public.propose_rule_change(uuid,uuid,text,text,text,text,uuid);
create function public.propose_rule_change(p_household uuid,p_rule uuid,p_title text,p_category text,p_description text,p_reason text,p_request_id uuid,p_expected_version integer)
returns uuid language plpgsql security definer set search_path='' as $$
declare a uuid; r uuid; v integer; payload jsonb;
begin
 a:=private.require_actor(p_household,array['ADMIN']::public.member_role[]);
 payload:=jsonb_build_array(p_rule,p_title,p_category,p_description,p_reason,p_expected_version);
 r:=private.replay(p_household,a,'propose_rule',p_request_id,payload);if r is not null then return r;end if;
 select max(version) into v from public.rule_versions where household_id=p_household and rule_id=p_rule;
 if v is null then raise exception 'Norma no encontrada' using errcode='22023';end if;
 if v is distinct from p_expected_version then raise exception 'La norma cambió; vuelve a cargarla' using errcode='40001';end if;
 insert into public.rule_proposals(household_id,rule_id,base_version,title,category,description,reason,proposed_by)
 values(p_household,p_rule,v,p_title,p_category,p_description,coalesce(p_reason,''),a) returning id into r;
 insert into public.audit_events(household_id,actor_id,action,proposal_id) values(p_household,a,'RULE_CHANGE_PROPOSED',r);
 perform private.remember(p_household,a,'propose_rule',p_request_id,payload,r);return r;
end $$;
grant execute on function public.propose_rule_change(uuid,uuid,text,text,text,text,uuid,integer) to authenticated;
commit;
