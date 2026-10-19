-- Tidplan 2.0 (docs/kundportal-v3.md, section 1). Phase dates are no longer
-- typed in: a project has a start date and each phase a duration in working
-- days (half-day steps), and the app computes the dates with the calendar in
-- lib/workdays.ts and writes them to starts_on/ends_on, which stay so the
-- portal pages keep reading them. The end date only moves through a delay or
-- an approved ÄTA, each logged in timeline_shifts with a reason the customer
-- sees word for word. Photos get one row each, tied to a phase and a day.

-- A duration in working days: 0 or more, in steps of 0.5.
create or replace function public.is_half_days(d numeric) returns boolean
  language sql immutable set search_path = ''
as $$ select d >= 0 and d * 2 = trunc(d * 2) $$;

-- ---- projects ----
alter table portal_projects
  add column planned_ends_on date,                       -- the original end, kept when shifts move ends_on
  add column works_saturdays boolean not null default false;

-- Projects from version 1–2 had their end typed in; that is the original plan.
update portal_projects set planned_ends_on = ends_on where ends_on is not null;

-- ---- change orders: how long the extra work takes ----
alter table change_orders
  add column duration_days numeric(4,1) not null default 0 check (is_half_days(duration_days));

-- ---- phases ----
alter table project_phases
  add column duration_days numeric(4,1) not null default 1 check (is_half_days(duration_days)),
  add column change_order_id uuid references change_orders(id) on delete set null;

-- One phase per ÄTA, so a double click on "Lägg in" can't add it twice.
create unique index project_phases_change_order_idx on project_phases (change_order_id) where change_order_id is not null;

-- Existing phases had dates typed in: keep their length as weekdays (the
-- holiday calendar lives in the app; the next save recomputes the dates).
update project_phases
set duration_days = least(999, greatest(0.5, (
  select count(*) from generate_series(starts_on, ends_on, interval '1 day') d where extract(isodow from d) < 6
)))
where starts_on is not null and ends_on is not null and ends_on >= starts_on;

-- ---- templates: a project's phases saved for the next job of the same kind ----
-- Built-in templates live in code (lib/portal/phase-templates.ts); these are
-- the ones saved with "Spara som mall". phases: [{"name": "Rivning", "days": 1.5}, …]
create table phase_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  job_type    text not null default '',
  phases      jsonb not null default '[]',
  created_by  text,
  created_at  timestamptz not null default now()
);

-- ---- the log of every move of the end date ----
create table timeline_shifts (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references portal_projects(id) on delete cascade,
  kind            text not null check (kind in ('delay', 'change_order')),
  -- The phase the shift belongs to: the delayed phase, or the phase the ÄTA
  -- added. Removing the phase removes its shift, and the end moves back.
  phase_id        uuid references project_phases(id) on delete cascade,
  change_order_id uuid references change_orders(id) on delete cascade,
  days            numeric(4,1) not null check (days > 0 and is_half_days(days)),
  reason          text not null default '',               -- written for the customer, shown verbatim
  created_at      timestamptz not null default now(),
  created_by      text,
  check (kind <> 'change_order' or change_order_id is not null)
);
create index timeline_shifts_project_idx on timeline_shifts (project_id, created_at);

-- ---- photos: one row per photo, in exactly one phase and one day ----
alter table project_updates
  add column phase_id uuid references project_phases(id) on delete set null,
  add column day date;
update project_updates set day = (created_at at time zone 'Europe/Stockholm')::date where day is null;
alter table project_updates
  alter column day set default ((now() at time zone 'Europe/Stockholm')::date),
  alter column day set not null;

create table project_photos (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references portal_projects(id) on delete cascade,
  phase_id    uuid references project_phases(id) on delete set null,
  update_id   uuid references project_updates(id) on delete cascade,   -- the post it came with, if any
  day         date not null,
  path        text not null,                                           -- key in the portal bucket
  caption     text not null default '',
  in_report   boolean not null default true,
  sort        int not null default 0,
  taken_at    timestamptz,
  created_by  text,
  created_at  timestamptz not null default now()
);
create index project_photos_project_idx on project_photos (project_id, day, sort);
create index project_photos_update_idx on project_photos (update_id);
create index project_photos_phase_idx on project_photos (phase_id);

-- Move the photos already posted: phase unknown, day from the post.
insert into project_photos (project_id, update_id, day, path, sort, created_by, created_at)
select u.project_id, u.id, u.day, p.path, (p.ord - 1)::int, u.created_by, u.created_at
from project_updates u
cross join lateral unnest(u.photos) with ordinality as p(path, ord);

-- project_updates.photos is no longer written or read; it stays until 0013
-- so this migration can be checked against it, then it is dropped.
comment on column project_updates.photos is 'Deprecated by project_photos (0012). Drop in 0013.';

-- ---- RLS, as in 0010_portal.sql ----
alter table phase_templates enable row level security;
alter table timeline_shifts enable row level security;
alter table project_photos  enable row level security;

create policy "phase_templates_admin" on phase_templates
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "timeline_shifts_admin" on timeline_shifts
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "timeline_shifts_member" on timeline_shifts
  for select to authenticated using (is_member(project_id));

create policy "project_photos_admin" on project_photos
  for all to authenticated using (is_admin()) with check (is_admin());
create policy "project_photos_member" on project_photos
  for select to authenticated using (is_member(project_id));
