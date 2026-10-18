-- Kundportalen "Mitt projekt" (docs/kundportal.md). A customer signs in with a
-- one-time code and follows their own job: phases, photo updates, documents
-- and (later) change orders. Admins see and write everything, as elsewhere.
-- Customers are ordinary auth.users who are NOT in the admins table; the
-- proxy keeps them out of /admin and RLS limits them to their own projects.

create table portal_projects (
  id            uuid primary key default gen_random_uuid(),
  quote_id      uuid references quotes(id) on delete set null,
  title         text not null,
  address       text not null default '',
  customer_name text not null default '',
  status        text not null default 'active',   -- active|done|warranty
  current_phase text not null default '',
  this_week     text not null default '',
  next_step     text not null default '',
  contact_name  text not null default '',
  contact_phone text not null default '',
  starts_on     date,
  ends_on       date,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index portal_projects_updated_idx on portal_projects (updated_at desc);
create trigger portal_projects_set_updated_at before update on portal_projects
  for each row execute function set_updated_at();

-- Which customers belong to which project. One row per invited e-mail; two
-- owners who share the ROT deduction are two rows.
create table project_members (
  project_id  uuid not null references portal_projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text not null,
  name        text not null default '',
  invited_at  timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on project_members (user_id);

create table project_phases (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references portal_projects(id) on delete cascade,
  name        text not null,
  sort        int not null default 0,
  starts_on   date,
  ends_on     date,
  done_at     timestamptz
);
create index project_phases_project_idx on project_phases (project_id, sort);

-- The diary: a short text and some photos, newest first in the portal.
create table project_updates (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references portal_projects(id) on delete cascade,
  body        text not null default '',
  photos      text[] not null default '{}',       -- keys in the portal bucket
  created_by  text,
  created_at  timestamptz not null default now()
);
create index project_updates_project_idx on project_updates (project_id, created_at desc);

-- ÄTA. Created here so version 2 needs no new migration; the UI comes later.
create table change_orders (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references portal_projects(id) on delete cascade,
  number        int not null,
  title         text not null,
  description   text not null default '',
  amount        int not null default 0,           -- what the customer pays, kr
  labor_amount  int not null default 0,           -- the part ROT applies to, kr
  status        text not null default 'pending',  -- pending|approved|declined
  answered_by   uuid references auth.users(id) on delete set null,
  answered_name text,
  answered_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (project_id, number)
);

create table project_documents (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references portal_projects(id) on delete cascade,
  kind        text not null default 'other',      -- quote|invoice|rot|certificate|warranty|care|other
  title       text not null,
  path        text not null,                      -- key in the portal bucket, or "quote:<uuid>" for the quote PDF
  created_at  timestamptz not null default now()
);
create index project_documents_project_idx on project_documents (project_id, created_at desc);

-- ---- RLS ----
-- is_member(project) answers for the caller only; security definer so the
-- lookup itself isn't blocked by project_members' own policy.
create or replace function public.is_member(project uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.project_members where project_id = project and user_id = auth.uid())
$$;
revoke all on function public.is_member(uuid) from public;
grant execute on function public.is_member(uuid) to authenticated;

alter table portal_projects   enable row level security;
alter table project_members   enable row level security;
alter table project_phases    enable row level security;
alter table project_updates   enable row level security;
alter table change_orders     enable row level security;
alter table project_documents enable row level security;

create policy "portal_projects_admin" on portal_projects
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "portal_projects_member" on portal_projects
  for select to authenticated using (is_member(id));

create policy "project_members_admin" on project_members
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "project_members_member" on project_members
  for select to authenticated using (is_member(project_id));

create policy "project_phases_admin" on project_phases
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "project_phases_member" on project_phases
  for select to authenticated using (is_member(project_id));

create policy "project_updates_admin" on project_updates
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "project_updates_member" on project_updates
  for select to authenticated using (is_member(project_id));

create policy "change_orders_admin" on change_orders
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "change_orders_member" on change_orders
  for select to authenticated using (is_member(project_id));
-- Customers answer a change order through a server action (service role)
-- that checks membership itself, so no member update policy here.

create policy "project_documents_admin" on project_documents
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "project_documents_member" on project_documents
  for select to authenticated using (is_member(project_id));

-- ---- Storage: a PRIVATE bucket, read through short-lived signed URLs ----
-- Key convention: projects/{project_id}/{uuid}.{ext}
insert into storage.buckets (id, name, public)
values ('portal', 'portal', false)
on conflict (id) do nothing;

create policy "portal_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'portal' and is_admin())
  with check (bucket_id = 'portal' and is_admin());

create policy "portal_member_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'portal'
    and (storage.foldername(name))[1] = 'projects'
    and is_member(((storage.foldername(name))[2])::uuid)
  );
