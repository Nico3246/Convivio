-- Convivio. Do not apply partial statements: migrations are versioned as a unit.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
-- Function EXECUTE defaults to PUBLIC globally. A schema-local REVOKE alone
-- cannot remove that global default: revoke it at the owner level first.
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

create type public.member_role as enum ('ADMIN', 'RESIDENT', 'CONTROLLER');
create type public.inventory_scope as enum ('PERSONAL', 'SHARED', 'HOUSEHOLD');
create type public.decision as enum ('APPROVED', 'REJECTED');
create type public.exception_status as enum ('PENDING', 'APPROVED', 'REJECTED');

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  timezone text not null default 'Europe/Madrid' check (timezone = 'Europe/Madrid'),
  created_at timestamptz not null default now()
);
create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  auth_user_id uuid not null unique references auth.users on delete cascade,
  role public.member_role not null,
  display_name text not null check (length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (household_id, role),
  unique (household_id, id)
);
create table private.invitations (
  household_id uuid not null references public.households on delete cascade,
  email text not null check (email = lower(trim(email)) and position('@' in email) > 1),
  role public.member_role not null,
  primary key (household_id, role),
  unique (email)
);

create table public.rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  foreign key (household_id, created_by) references public.members(household_id, id) on delete cascade,
  unique (household_id, id)
);
create table public.rule_versions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null,
  rule_id uuid not null,
  version integer not null check (version > 0),
  title text not null check (length(trim(title)) between 1 and 120),
  category text not null check (category in ('HOURS', 'VISITS', 'COMMON_AREAS')),
  description text not null check (length(trim(description)) between 1 and 10000),
  effective_at timestamptz not null,
  created_by uuid not null,
  approved_by uuid,
  created_at timestamptz not null default now(),
  check ((version = 1 and approved_by is null) or (version > 1 and approved_by is not null)),
  foreign key (household_id, rule_id) references public.rules(household_id, id) on delete cascade,
  foreign key (household_id, created_by) references public.members(household_id, id) on delete cascade,
  foreign key (household_id, approved_by) references public.members(household_id, id) on delete cascade,
  unique (rule_id, version), unique (household_id, id)
);
create table public.rule_proposals (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  rule_id uuid not null, base_version integer not null,
  title text not null check (length(trim(title)) between 1 and 120),
  category text not null check (category in ('HOURS', 'VISITS', 'COMMON_AREAS')),
  description text not null check (length(trim(description)) between 1 and 10000),
  reason text not null default '' check (length(reason) <= 2000),
  proposed_by uuid not null, decided_by uuid, result public.decision,
  created_at timestamptz not null default now(), decided_at timestamptz,
  check ((result is null and decided_by is null and decided_at is null) or
    (result is not null and decided_by is not null and decided_at is not null)),
  foreign key (household_id, rule_id) references public.rules(household_id, id) on delete cascade,
  foreign key (household_id, proposed_by) references public.members(household_id, id) on delete cascade,
  foreign key (household_id, decided_by) references public.members(household_id, id) on delete cascade,
  unique(household_id, id)
);
create unique index one_open_proposal on public.rule_proposals(rule_id) where result is null;

create table public.faults (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  rule_version_id uuid not null, reported_by uuid not null, responsible_id uuid not null,
  occurred_at timestamptz not null,
  description text not null check (length(trim(description)) between 1 and 5000),
  registered_at timestamptz not null default now(),
  maintained_by uuid, maintained_at timestamptz,
  check (occurred_at <= registered_at),
  check ((maintained_by is null) = (maintained_at is null)),
  foreign key (household_id, rule_version_id) references public.rule_versions(household_id, id) on delete cascade,
  foreign key (household_id, reported_by) references public.members(household_id, id) on delete cascade,
  foreign key (household_id, responsible_id) references public.members(household_id, id) on delete cascade,
  foreign key (household_id, maintained_by) references public.members(household_id, id) on delete cascade,
  unique(household_id, id)
);
create table public.fault_comments (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  fault_id uuid not null, author_id uuid not null,
  body text not null check (length(trim(body)) between 1 and 3000),
  created_at timestamptz not null default now(),
  foreign key (household_id, fault_id) references public.faults(household_id, id) on delete cascade,
  foreign key (household_id, author_id) references public.members(household_id, id) on delete cascade,
  unique(household_id, id)
);
create table public.complaints (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  author_id uuid not null, target_id uuid,
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null check (length(trim(description)) between 1 and 5000),
  created_at timestamptz not null default now(),
  foreign key (household_id, author_id) references public.members(household_id, id) on delete cascade,
  foreign key (household_id, target_id) references public.members(household_id, id) on delete cascade,
  unique(household_id, id)
);
create table public.visit_exceptions (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  requested_by uuid not null, other_resident_id uuid not null, controller_id uuid not null,
  visitor text not null check (length(trim(visitor)) between 1 and 120),
  reason text not null check (length(trim(reason)) between 1 and 3000),
  kind text not null check (kind in ('LATE_VISIT','OVERNIGHT','BOTH')),
  starts_at timestamptz not null, ends_at timestamptz not null check (ends_at > starts_at),
  resident_decision public.decision, controller_decision public.decision,
  resident_decided_at timestamptz, controller_decided_at timestamptz,
  status public.exception_status not null default 'PENDING',
  created_at timestamptz not null default now(),
  check (requested_by <> other_resident_id and requested_by <> controller_id and other_resident_id <> controller_id),
  foreign key (household_id, requested_by) references public.members(household_id, id) on delete cascade,
  foreign key (household_id, other_resident_id) references public.members(household_id, id) on delete cascade,
  foreign key (household_id, controller_id) references public.members(household_id, id) on delete cascade,
  unique(household_id, id)
);

create table public.task_templates (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  created_by uuid not null, initial_resident_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '', zone text not null,
  kind text not null default 'CLEANING' check(kind in ('CLEANING','GARBAGE','OTHER')),
  anchor_date date not null, interval_days integer not null check(interval_days between 1 and 366),
  due_time time, alternate boolean not null default false, enabled boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key(household_id, created_by) references public.members(household_id,id) on delete cascade,
  foreign key(household_id, initial_resident_id) references public.members(household_id,id) on delete cascade,
  unique(household_id, id)
);
create table public.task_occurrences (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  template_id uuid not null, assigned_to uuid not null,
  due_date date not null, due_time time,
  completed_by uuid, completed_at timestamptz, created_at timestamptz not null default now(),
  check ((completed_by is null) = (completed_at is null)),
  check (completed_by is null or completed_by = assigned_to),
  foreign key(household_id, template_id) references public.task_templates(household_id,id) on delete cascade,
  foreign key(household_id, assigned_to) references public.members(household_id,id) on delete cascade,
  foreign key(household_id, completed_by) references public.members(household_id,id) on delete cascade,
  unique(template_id,due_date), unique(household_id,id)
);
create table public.shower_slots (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  created_by uuid not null, resident_id uuid not null,
  weekday integer not null check(weekday between 1 and 7),
  starts_at time not null, ends_at time not null check(ends_at > starts_at),
  foreign key(household_id, created_by) references public.members(household_id,id) on delete cascade,
  foreign key(household_id, resident_id) references public.members(household_id,id) on delete cascade,
  unique(household_id,id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  scope public.inventory_scope not null, owner_id uuid, created_by uuid not null,
  name text not null check(length(trim(name)) between 1 and 120),
  quantity numeric(12,3) not null check(quantity >= 0),
  unit text not null check(length(trim(unit)) between 1 and 30),
  revision integer not null default 1, created_at timestamptz not null default now(),
  check ((scope = 'PERSONAL') = (owner_id is not null)),
  foreign key(household_id,owner_id) references public.members(household_id,id) on delete cascade,
  foreign key(household_id,created_by) references public.members(household_id,id) on delete cascade,
  unique(household_id,id)
);
create table public.shopping_items (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  scope public.inventory_scope not null, owner_id uuid, created_by uuid not null,
  name text not null check(length(trim(name)) between 1 and 120),
  quantity numeric(12,3) not null check(quantity > 0),
  unit text not null check(length(trim(unit)) between 1 and 30),
  purchased_by uuid, purchased_at timestamptz,
  created_at timestamptz not null default now(),
  check ((scope = 'PERSONAL') = (owner_id is not null)),
  check ((purchased_by is null) = (purchased_at is null)),
  foreign key(household_id,owner_id) references public.members(household_id,id) on delete cascade,
  foreign key(household_id,created_by) references public.members(household_id,id) on delete cascade,
  foreign key(household_id,purchased_by) references public.members(household_id,id) on delete cascade,
  unique(household_id,id)
);

-- A financial entry is either an expense (its debt amount is the debtor share)
-- or a manual debt. Corrections append versions; the header selects the current version.
create table public.debts (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  created_by uuid not null, creditor_id uuid not null, debtor_id uuid not null,
  kind text not null check(kind in ('EXPENSE','MANUAL')),
  current_version integer not null default 1 check(current_version > 0),
  created_at timestamptz not null default now(),
  check(creditor_id <> debtor_id),
  foreign key(household_id,created_by) references public.members(household_id,id) on delete cascade,
  foreign key(household_id,creditor_id) references public.members(household_id,id) on delete cascade,
  foreign key(household_id,debtor_id) references public.members(household_id,id) on delete cascade,
  unique(household_id,id)
);
create table public.debt_versions (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  debt_id uuid not null, version integer not null check(version > 0),
  total_cents bigint not null check(total_cents between 0 and 1000000000),
  debt_cents bigint not null check(debt_cents between 0 and total_cents),
  concept text not null check(length(trim(concept)) between 1 and 200),
  occurred_on date not null, recorded_by uuid not null,
  correction_reason text check(length(trim(correction_reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check ((version = 1 and correction_reason is null) or (version > 1 and correction_reason is not null)),
  foreign key(household_id,debt_id) references public.debts(household_id,id) on delete cascade,
  foreign key(household_id,recorded_by) references public.members(household_id,id) on delete cascade,
  unique(debt_id,version), unique(household_id,id)
);
create table public.payments (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  debt_id uuid not null, created_by uuid not null,
  current_version integer not null default 1 check(current_version > 0),
  created_at timestamptz not null default now(),
  foreign key(household_id,debt_id) references public.debts(household_id,id) on delete cascade,
  foreign key(household_id,created_by) references public.members(household_id,id) on delete cascade,
  unique(household_id,id)
);
create table public.payment_versions (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  payment_id uuid not null, version integer not null check(version > 0),
  amount_cents bigint not null check(amount_cents between 0 and 1000000000),
  recorded_by uuid not null, occurred_on date not null,
  correction_reason text check(length(trim(correction_reason)) between 1 and 2000),
  created_at timestamptz not null default now(),
  check ((version = 1 and correction_reason is null) or (version > 1 and correction_reason is not null)),
  foreign key(household_id,payment_id) references public.payments(household_id,id) on delete cascade,
  foreign key(household_id,recorded_by) references public.members(household_id,id) on delete cascade,
  unique(payment_id,version), unique(household_id,id)
);

-- No original contents or identity of the accused are retained in deletion events.
create table public.fault_deletion_events (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  deleted_by uuid not null, deleted_at timestamptz not null default now(),
  foreign key(household_id,deleted_by) references public.members(household_id,id) on delete cascade,
  unique(household_id,id)
);
create table public.weekly_reports (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null check(ends_at > starts_at),
  generated_at timestamptz not null default now(),
  unique(household_id,ends_at), unique(household_id,id)
);
create table public.report_entries (
  id uuid primary key default gen_random_uuid(), household_id uuid not null, report_id uuid not null,
  fault_id uuid, comment_id uuid, complaint_id uuid, deletion_event_id uuid,
  task_id uuid, debt_version_id uuid, payment_version_id uuid,
  foreign key(household_id,report_id) references public.weekly_reports(household_id,id) on delete cascade,
  foreign key(household_id,fault_id) references public.faults(household_id,id) on delete cascade,
  foreign key(household_id,comment_id) references public.fault_comments(household_id,id) on delete cascade,
  foreign key(household_id,complaint_id) references public.complaints(household_id,id) on delete cascade,
  foreign key(household_id,deletion_event_id) references public.fault_deletion_events(household_id,id) on delete cascade,
  foreign key(household_id,task_id) references public.task_occurrences(household_id,id) on delete cascade,
  foreign key(household_id,debt_version_id) references public.debt_versions(household_id,id) on delete cascade,
  foreign key(household_id,payment_version_id) references public.payment_versions(household_id,id) on delete cascade,
  check(num_nonnulls(fault_id,comment_id,complaint_id,deletion_event_id,task_id,debt_version_id,payment_version_id)=1)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), household_id uuid not null references public.households on delete cascade,
  actor_id uuid not null,
  action text not null check(length(action) between 1 and 80),
  -- Structured foreign keys, never arbitrary JSON copies of personal contents.
  rule_id uuid, proposal_id uuid, exception_id uuid, debt_id uuid, payment_id uuid, deletion_event_id uuid,
  created_at timestamptz not null default now(),
  foreign key(household_id,actor_id) references public.members(household_id,id) on delete cascade,
  foreign key(household_id,rule_id) references public.rules(household_id,id) on delete cascade,
  foreign key(household_id,proposal_id) references public.rule_proposals(household_id,id) on delete cascade,
  foreign key(household_id,exception_id) references public.visit_exceptions(household_id,id) on delete cascade,
  foreign key(household_id,debt_id) references public.debts(household_id,id) on delete cascade,
  foreign key(household_id,payment_id) references public.payments(household_id,id) on delete cascade,
  foreign key(household_id,deletion_event_id) references public.fault_deletion_events(household_id,id) on delete cascade
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  uploaded_by uuid not null, fault_id uuid, complaint_id uuid, debt_id uuid,
  bucket text not null check(bucket in ('fault-evidence','complaint-evidence','receipts')),
  object_path text not null unique,
  created_at timestamptz not null default now(),
  check(num_nonnulls(fault_id,complaint_id,debt_id)=1),
  check ((bucket='fault-evidence' and fault_id is not null) or
    (bucket='complaint-evidence' and complaint_id is not null) or (bucket='receipts' and debt_id is not null)),
  foreign key(household_id,uploaded_by) references public.members(household_id,id) on delete cascade,
  foreign key(household_id,fault_id) references public.faults(household_id,id) on delete cascade,
  foreign key(household_id,complaint_id) references public.complaints(household_id,id) on delete cascade,
  foreign key(household_id,debt_id) references public.debts(household_id,id) on delete cascade
);
create table private.cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  kind text not null check(kind in ('STORAGE','AUTH')),
  bucket text, object_path text, auth_user_id uuid,
  created_at timestamptz not null default now(), attempts integer not null default 0,
  available_at timestamptz not null default now(), leased_until timestamptz,
  lease_id uuid,
  check((kind='STORAGE' and bucket is not null and object_path is not null and auth_user_id is null)
    or (kind='AUTH' and auth_user_id is not null and bucket is null and object_path is null)),
  unique(bucket,object_path), unique(auth_user_id)
);
create table private.command_receipts (
  household_id uuid not null references public.households on delete cascade,
  actor_id uuid not null references public.members on delete cascade,
  operation text not null, request_id uuid not null, fingerprint text not null,
  result_id uuid not null, created_at timestamptz not null default now(),
  primary key(actor_id,operation,request_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), household_id uuid not null,
  recipient_id uuid not null, report_id uuid, exception_id uuid,
  kind text not null check(kind in ('WEEKLY_REPORT','EXCEPTION_REQUEST','EXCEPTION_APPROVED','EXCEPTION_REJECTED')),
  read_at timestamptz, created_at timestamptz not null default now(),
  check(num_nonnulls(report_id,exception_id)=1),
  foreign key(household_id,recipient_id) references public.members(household_id,id) on delete cascade,
  foreign key(household_id,report_id) references public.weekly_reports(household_id,id) on delete cascade,
  foreign key(household_id,exception_id) references public.visit_exceptions(household_id,id) on delete cascade,
  unique(recipient_id,kind,report_id), unique(recipient_id,kind,exception_id)
);
create table private.push_tokens (
  member_id uuid not null references public.members on delete cascade,
  token text not null unique, enabled boolean not null default true,
  primary key(member_id,token)
);

create index faults_registered on public.faults(household_id,registered_at);
create index faults_occurred on public.faults(household_id,responsible_id,occurred_at);
create index complaints_created on public.complaints(household_id,created_at);
create index occurrences_due on public.task_occurrences(household_id,assigned_to,due_date);
create index inventory_owner on public.inventory_items(household_id,owner_id);
create index shopping_owner on public.shopping_items(household_id,owner_id);
create index debt_pair on public.debts(household_id,creditor_id,debtor_id);
create index payments_debt on public.payments(debt_id);
create index report_items_report on public.report_entries(report_id);
create index attachment_fault on public.attachments(fault_id);
create index cleanup_ready on private.cleanup_queue(available_at,leased_until);
commit;
