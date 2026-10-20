-- RLS-prov för 0022 (webbplatsen och förfrågningarna per organisation). Körs
-- i Supabase SQL-editor efter 0022. Allt sker i en transaktion som rullas
-- tillbaka: tre provanvändare, en provorganisation, inget blir kvar. Ett fel
-- avbryter med ett tydligt meddelande; "RLS-prov 0022: alla gick igenom"
-- betyder att allt höll.
--
--   S  owner i webbplatsens organisation (default_org(), Binaafy)
--   T  personal (staff) i webbplatsens organisation
--   B  owner i en andra organisation

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000022a1', 'sajt-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000022a2', 'sajt-personal@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000022b1', 'annan-agare@prov.se', 'authenticated', 'authenticated');

-- Som postgres, innan någon roll sätts: S och T i webbplatsens organisation,
-- en förfrågan från sajten (org_id får default_org() som default).
insert into memberships (org_id, user_id, role) values
  (default_org(), '00000000-0000-4000-8000-0000000022a1', 'owner'),
  (default_org(), '00000000-0000-4000-8000-0000000022a2', 'staff');
insert into leads (id, division, kind, name, email) values
  ('00000000-0000-4000-8000-00000000221e', 'bygg', 'offert', 'Provkund sajt', 'kund@prov.se');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

-- Som B: skapa organisation B. En förfrågan i B läggs in som postgres nedan.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000022b1","role":"authenticated","email":"annan-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));

reset role;
insert into leads (id, org_id, division, kind, name) values
  ('00000000-0000-4000-8000-00000000221f', (select v from prov where k = 'b'), 'bygg', 'kontakt', 'Provkund B');

-- B: ser bara sin egen förfrågan, rör inte webbplatsen.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000022b1","role":"authenticated","email":"annan-agare@prov.se"}';
do $$
declare n int;
begin
  if is_admin() or is_site_admin() then raise exception 'B räknas som webbplatsens admin'; end if;

  select count(*) into n from leads where id = '00000000-0000-4000-8000-00000000221e';
  if n <> 0 then raise exception 'B ser webbplatsens förfrågan'; end if;
  select count(*) into n from leads where id = '00000000-0000-4000-8000-00000000221f';
  if n <> 1 then raise exception 'B ser inte sin egen förfrågan'; end if;

  update leads set note = 'intrång' where id = '00000000-0000-4000-8000-00000000221e';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B kunde ändra webbplatsens förfrågan'; end if;

  begin
    insert into content_blocks (key, data) values ('prov', '{}');
    raise exception 'B kunde skriva content_blocks';
  exception when insufficient_privilege then null;
  end;
  update content_blocks set data = '{}' where true;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B kunde ändra content_blocks'; end if;

  begin
    insert into content_history (key, data) values ('company', '{}');
    raise exception 'B kunde skriva innehållshistoriken';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from content_history;
  if n <> 0 then raise exception 'B läser innehållshistoriken'; end if;

  begin
    insert into services (slug, title) values ('prov-tjanst', 'Prov');
    raise exception 'B kunde skapa en tjänst';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into cases (slug, title) values ('prov-case', 'Prov');
    raise exception 'B kunde skapa ett case';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into projects (slug, title) values ('prov-projekt', 'Prov');
    raise exception 'B kunde skapa ett projekt på sajten';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name) values ('gallery', 'projects/prov.jpg');
    raise exception 'B kunde ladda upp i galleriet';
  exception when insufficient_privilege then null;
  end;
end $$;

-- T (personal i webbplatsens organisation): förfrågningarna ja, innehållet nej.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000022a2","role":"authenticated","email":"sajt-personal@prov.se"}';
do $$
declare n int;
begin
  if is_site_admin() then raise exception 'Personal räknas som webbplatsens admin'; end if;
  select count(*) into n from leads where id = '00000000-0000-4000-8000-00000000221e';
  if n <> 1 then raise exception 'Personalen ser inte förfrågan'; end if;
  select count(*) into n from leads where id = '00000000-0000-4000-8000-00000000221f';
  if n <> 0 then raise exception 'Personalen ser B:s förfrågan'; end if;
  update leads set status = 'contacted' where id = '00000000-0000-4000-8000-00000000221e';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Personalen kunde inte uppdatera förfrågan'; end if;
  begin
    insert into content_blocks (key, data) values ('prov', '{}');
    raise exception 'Personalen kunde skriva content_blocks';
  exception when insufficient_privilege then null;
  end;
end $$;

-- S (owner i webbplatsens organisation): allt på webbplatsen.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000022a1","role":"authenticated","email":"sajt-agare@prov.se"}';
do $$
declare n int;
begin
  if not is_site_admin() or not is_admin() then raise exception 'Webbplatsens owner räknas inte som admin'; end if;
  select count(*) into n from leads where id = '00000000-0000-4000-8000-00000000221e';
  if n <> 1 then raise exception 'Webbplatsens owner ser inte förfrågan'; end if;
  insert into content_blocks (key, data) values ('prov', '{"x":1}');
  insert into content_history (key, data) values ('prov', '{"x":1}');
  select count(*) into n from content_history where key = 'prov';
  if n <> 1 then raise exception 'Webbplatsens owner läser inte historiken'; end if;
  insert into services (slug, title, published) values ('prov-tjanst', 'Prov', false);
  insert into storage.objects (bucket_id, name) values ('gallery', 'projects/prov.jpg');
end $$;

-- Utloggad: läser innehållet och det publicerade, inget annat.
reset role;
set local role anon;
set local request.jwt.claims = '{}';
do $$
declare n int;
begin
  select count(*) into n from content_blocks where key = 'prov';
  if n <> 1 then raise exception 'Utloggad läser inte content_blocks'; end if;
  select count(*) into n from services where slug = 'prov-tjanst';
  if n <> 0 then raise exception 'Utloggad ser en opublicerad tjänst'; end if;
  select count(*) into n from leads;
  if n <> 0 then raise exception 'Utloggad ser förfrågningar'; end if;
end $$;

reset role;
do $$ begin raise notice 'RLS-prov 0022: alla gick igenom'; end $$;
rollback;
