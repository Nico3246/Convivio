-- Run once with a privileged database connection, after editing these values.
-- Not a migration and not executed by CI. Never commit real user addresses.
begin;
do $$
declare
  admin_email text := 'REPLACE_ADMIN_EMAIL';
  resident_email text := 'REPLACE_RESIDENT_EMAIL';
  controller_email text := 'REPLACE_CONTROLLER_EMAIL';
  household uuid;
begin
  if admin_email like 'REPLACE_%' or resident_email like 'REPLACE_%' or controller_email like 'REPLACE_%' then
    raise exception 'Configura los tres correos antes de ejecutar este script';
  end if;
  if exists(select 1 from public.households) then raise exception 'El piso ya existe'; end if;
  insert into public.households(name) values('Nuestro piso') returning id into household;
  insert into private.invitations(household_id,email,role) values
    (household,lower(trim(admin_email)),'ADMIN'),
    (household,lower(trim(resident_email)),'RESIDENT'),
    (household,lower(trim(controller_email)),'CONTROLLER');
end $$;
commit;
