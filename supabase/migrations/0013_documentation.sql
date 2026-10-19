-- Dokumentationssystemet (docs/kundportal-v3.md, section 2). Every photo
-- already belongs to a phase and a day (project_photos, 0012); this adds the
-- texts around them, the photo rule for phases that must be documented, and
-- the archive: a project's documentation is locked when the job is done,
-- after which phases, days, photos and texts can no longer change.
-- Attachments (project_documents) can still be added.

-- ---- texts ----
alter table project_phases
  add column summary        text not null default '',     -- the chapter's introduction, optional
  add column photo_required boolean not null default false; -- can't be ticked done without a photo

alter table portal_projects
  add column final_summary text not null default '',      -- "Slutdokumentation": the finished result
  add column archived_at   timestamptz,                    -- set by "Lås dokumentationen"
  -- Fingerprint of the content the cached report was rendered from; the PDF
  -- lies at projects/{id}/rapport-{report_hash}.pdf in the portal bucket.
  add column report_hash   text;

create index portal_projects_archived_idx on portal_projects (archived_at desc) where archived_at is not null;

-- project_documents.kind is free text checked by the app (0010); 'report' is
-- the locked documentation. Nothing to alter, noted here for the reader.
comment on column project_documents.kind is 'quote|invoice|rot|certificate|warranty|care|report|other';

-- Phases that the built-in templates mark (Tätskikt, El och VVS) start with the rule on.
update project_phases set photo_required = true
where name ~* '^(tätskikt|el och vvs)$' and done_at is null;

-- ---- photos moved to project_photos in 0012 ----
-- The app has read and written project_photos only since 0012. Rows posted
-- before it were copied there by 0012; drop the old array.
alter table project_updates drop column photos;

-- ---- the lock ----
-- Once archived_at is set the documentation is the record handed to the
-- customer: refuse any change to its phases, notes and photos, and to the
-- final summary, whoever asks. Unlocking (archived_at back to null) is the
-- only way to edit again. Deleting the whole project still cascades: the
-- parent row is gone by the time the cascade runs, so the check passes.
create or replace function public.documentation_is_locked(project uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.portal_projects where id = project and archived_at is not null) $$;
revoke all on function public.documentation_is_locked(uuid) from public;

create or replace function public.refuse_when_locked() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  if public.documentation_is_locked(case when tg_op = 'DELETE' then old.project_id else new.project_id end)
     or (tg_op = 'UPDATE' and old.project_id <> new.project_id and public.documentation_is_locked(old.project_id)) then
    raise exception 'Dokumentationen är låst.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

create trigger project_phases_locked before insert or update or delete on project_phases
  for each row execute function public.refuse_when_locked();
create trigger project_updates_locked before insert or update or delete on project_updates
  for each row execute function public.refuse_when_locked();
create trigger project_photos_locked before insert or update or delete on project_photos
  for each row execute function public.refuse_when_locked();

create or replace function public.refuse_locked_summary() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  if old.archived_at is not null and new.archived_at is not null and new.final_summary is distinct from old.final_summary then
    raise exception 'Dokumentationen är låst.' using errcode = 'P0001';
  end if;
  return new;
end
$$;
create trigger portal_projects_locked_summary before update on portal_projects
  for each row execute function public.refuse_locked_summary();

-- No new tables: the new columns follow the policies of 0010 (admins write,
-- members read their own project).
