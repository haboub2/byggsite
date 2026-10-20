-- Kundportalens tabeller under projektet följer organisationen
-- (docs/fakturering.md, avsnitt 1: "Ingen tabell utan").
--
-- 0014 flyttade portal_projects till org_id men lämnade tabellerna under
-- projektet på is_admin(), som sedan dess betyder owner/admin i VILKEN
-- organisation som helst: faser, uppdateringar, ÄTA, dokument, medlemmar,
-- tidplanens förskjutningar och foton (0012), mallarna (0012) och bucketen
-- portal. Här avgör projektets organisation i stället, och personal (staff)
-- får skriva, som på offerter och fakturor. Kundernas läsregler
-- (is_member(project) från 0010 och 0012) är oförändrade.

-- ---- Hjälpfunktioner: frågan ställs mot projektets organisation ----
-- security definer så att uppslaget i portal_projects inte stoppas av dess
-- egen policy; search_path låst som i 0014.
create or replace function public.can_read_project(project uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.portal_projects p where p.id = project and public.is_org_member(p.org_id))
$$;

create or replace function public.can_write_project(project uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.portal_projects p where p.id = project and public.can_write_org(p.org_id))
$$;

-- Projektet en fil i bucketen hör till: projects/{project_id}/…, annars null.
-- Tål namn som inte är uuid, så att policyn aldrig fäller en fråga.
create or replace function public.project_of_path(name text) returns uuid
  language sql immutable set search_path = public
as $$
  select case
    when split_part(name, '/', 1) = 'projects'
     and split_part(name, '/', 2) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(name, '/', 2)::uuid
  end
$$;

revoke all on function public.can_read_project(uuid) from public;
revoke all on function public.can_write_project(uuid) from public;
grant execute on function public.can_read_project(uuid) to authenticated;
grant execute on function public.can_write_project(uuid) to authenticated;
grant execute on function public.project_of_path(text) to authenticated;

-- ---- Tabellerna under projektet ----
-- Samma två policies på var och en: personal i projektets organisation läser,
-- och de som får skriva i organisationen skriver.
do $$
declare t text;
begin
  foreach t in array array[
    'project_members', 'project_phases', 'project_updates', 'change_orders',
    'project_documents', 'timeline_shifts', 'project_photos'
  ] loop
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format(
      'create policy %I on %I for select to authenticated using (can_read_project(project_id))',
      t || '_org_select', t);
    execute format(
      'create policy %I on %I for all to authenticated using (can_write_project(project_id)) with check (can_write_project(project_id))',
      t || '_staff_write', t);
  end loop;
end $$;

-- ---- Tidplanens mallar hör till organisationen ----
alter table phase_templates add column org_id uuid references organizations(id);
update phase_templates set org_id = default_org();
alter table phase_templates alter column org_id set not null, alter column org_id set default default_org();
create index phase_templates_org_idx on phase_templates (org_id);

drop policy "phase_templates_admin" on phase_templates;
create policy "phase_templates_member_select" on phase_templates
  for select to authenticated using (is_org_member(org_id));
create policy "phase_templates_staff_write" on phase_templates
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));

-- ---- Bucketen portal ----
-- Allt i bucketen ligger under projects/{project_id}/ (lib/portal/files.ts,
-- lib/portal/report.tsx). Kundens läsregel "portal_member_read" från 0010
-- står kvar.
drop policy "portal_admin_all" on storage.objects;
create policy "portal_staff_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'portal' and can_write_project(project_of_path(name)))
  with check (bucket_id = 'portal' and can_write_project(project_of_path(name)));
