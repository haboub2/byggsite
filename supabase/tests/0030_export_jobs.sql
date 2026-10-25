-- Prov för 0030, del 1: export_jobs och bucketen exports. Körs i Supabase
-- SQL-editor efter 0030 (eller i PGlite). Allt sker i en transaktion som
-- rullas tillbaka: två provanvändare, två provorganisationer, inget blir
-- kvar. "Prov 0030 exportjobb: alla gick igenom" betyder att allt höll.
--
--   A1  owner i organisation A, som köar PDF-arkivet
--   B1  owner i organisation B, som inte ska se A:s jobb eller filer

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000030a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000030b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000030b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000030a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', ''));

-- A1 köar ett arkiv i eget namn.
with x as (
  insert into export_jobs (org_id, kind, requested_by, requested_email)
  values ((select v from prov where k = 'a'), 'pdf_archive', '00000000-0000-4000-8000-0000000030a1', 'a-agare@prov.se')
  returning id)
insert into prov select 'job', id from x;

do $$
declare
  v_a uuid := (select v from prov where k = 'a');
  v_b uuid := (select v from prov where k = 'b');
  v_n int;
begin
  if (select status from export_jobs where id = (select v from prov where k = 'job')) <> 'queued' then
    raise exception 'Jobbet köades inte.';
  end if;
  -- Ett pågående arkiv per organisation.
  begin
    insert into export_jobs (org_id, kind, requested_by) values (v_a, 'pdf_archive', '00000000-0000-4000-8000-0000000030a1');
    raise exception 'Två pågående arkiv i samma organisation';
  exception when unique_violation then null;
  end;
  -- Inte i någon annans namn, inte i en annan organisation, inte som klart jobb.
  begin
    insert into export_jobs (org_id, kind, requested_by) values (v_a, 'pdf_archive', '00000000-0000-4000-8000-0000000030b1');
    raise exception 'Ett jobb köades i någon annans namn';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into export_jobs (org_id, kind, requested_by) values (v_b, 'pdf_archive', '00000000-0000-4000-8000-0000000030a1');
    raise exception 'Ett jobb köades i en annan organisation';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into export_jobs (org_id, kind, requested_by, status, file_path) values (v_a, 'pdf_archive', '00000000-0000-4000-8000-0000000030a1', 'done', 'x/y.zip');
    raise exception 'Ett färdigt jobb kunde läggas in av en medlem';
  exception when insufficient_privilege or unique_violation then null;
  end;
  -- Medlemmen kan inte ändra jobbet; det gör bara jobbet själv med service role.
  update export_jobs set status = 'done', file_path = 'x' where id = (select v from prov where k = 'job');
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'En medlem kunde ändra jobbets status.'; end if;
  delete from export_jobs where id = (select v from prov where k = 'job');
  get diagnostics v_n = row_count;
  if v_n <> 0 then raise exception 'En medlem kunde ta bort jobbet.'; end if;
end $$;

-- B1 ser inte A:s jobb.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000030b1","role":"authenticated","email":"b-agare@prov.se"}';
do $$
begin
  if exists (select 1 from export_jobs) then raise exception 'B ser A:s exportjobb.'; end if;
end $$;

-- Filerna läggs av jobbet (service role); här som postgres.
reset role;
insert into storage.objects (bucket_id, name) values
  ('exports', (select v from prov where k = 'a')::text || '/' || (select v from prov where k = 'job')::text || '/prov-a.zip'),
  ('exports', (select v from prov where k = 'b')::text || '/00000000-0000-4000-8000-000000000000/prov-b.zip'),
  ('exports', 'inte-en-organisation/prov-c.zip');
do $$
begin
  if (select public from storage.buckets where id = 'exports') then raise exception 'Bucketen exports är publik.'; end if;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000030a1","role":"authenticated","email":"a-agare@prov.se"}';
do $$
declare
  v_names text[];
begin
  select array_agg(name) into v_names from storage.objects where bucket_id = 'exports';
  if coalesce(array_length(v_names, 1), 0) <> 1 or v_names[1] not like '%/prov-a.zip' then
    raise exception 'A ser fel filer i exports: %', v_names;
  end if;
  -- Ingen medlem lägger filer i bucketen.
  begin
    insert into storage.objects (bucket_id, name) values ('exports', (select v from prov where k = 'a')::text || '/egen.zip');
    raise exception 'En medlem kunde lägga en fil i exports';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000030b1","role":"authenticated","email":"b-agare@prov.se"}';
do $$
begin
  if (select count(*) from storage.objects where bucket_id = 'exports') <> 1
     or not exists (select 1 from storage.objects where bucket_id = 'exports' and name like '%/prov-b.zip') then
    raise exception 'B ser fel filer i exports.';
  end if;
end $$;

reset role;
do $$ begin raise notice 'Prov 0030 exportjobb: alla gick igenom'; end $$;

rollback;
