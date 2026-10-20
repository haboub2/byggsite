-- Fas 4: kostnader per projekt, för täckningsbidrag och marginal
-- (docs/fakturering.md, fas 4). Leverantörsfakturor, egna timmar, material
-- och övrigt, exkl. moms. Kostnaderna är projektets interna siffror: bara
-- organisationens personal ser dem, aldrig kunden i portalen. De bokförs
-- inte här (inköp hör till bokföringen); raderna kan därför ändras och tas
-- bort.

create table project_costs (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null default default_org() references organizations(id) on delete cascade,
  project_id       uuid not null references portal_projects(id) on delete cascade,
  kind             text not null check (kind in ('supplier','hours','material','other')),
  description      text not null default '' check (char_length(description) <= 400),
  -- Exkl. moms. Negativt för en kreditnota från en leverantör.
  amount_ore       bigint not null,
  cost_date        date not null default current_date,
  -- Bara för kind = 'hours': antal timmar och internt timpris; beloppet är produkten.
  hours            numeric(8,2) check (hours is null or hours >= 0),
  hourly_rate_ore  bigint check (hourly_rate_ore is null or hourly_rate_ore >= 0),
  supplier         text not null default '' check (char_length(supplier) <= 120),
  created_by       text,
  created_at       timestamptz not null default now()
);
create index project_costs_project_idx on project_costs (project_id, cost_date);
create index project_costs_org_idx on project_costs (org_id);

alter table project_costs enable row level security;

-- Personal i organisationen läser; kunderna (projektmedlemmar utan
-- membership) ser ingenting.
create policy "project_costs_member_select" on project_costs
  for select to authenticated using (is_org_member(org_id));
-- Personal skriver, och bara på projekt i den egna organisationen
-- (can_write_project från 0019).
create policy "project_costs_staff_write" on project_costs
  for all to authenticated
  using (can_write_org(org_id))
  with check (can_write_org(org_id) and can_write_project(project_id));
