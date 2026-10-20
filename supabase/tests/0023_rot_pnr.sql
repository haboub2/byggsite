-- Prov för 0023 (krypterade personnummer). Körs i Supabase SQL-editor efter
-- 0023, med nyckeln rot_pnr_key i Vault. Allt sker i en transaktion som
-- rullas tillbaka: fem provanvändare, två provorganisationer, inget blir kvar.
-- Ett fel avbryter med ett tydligt meddelande; "Prov 0023: alla gick igenom"
-- betyder att allt höll.
--
-- I PGlite och vanlig Postgres finns ingen Vault. Då skapas en ersättning
-- (vault.decrypted_secrets med en provnyckel) i transaktionen; det riktiga
-- provet av Vault görs i Supabase.
--
--   A1  owner i organisation A
--   A2  personal (staff) i A
--   A3  läsare (readonly) i A
--   A4  redovisningskonsult (accountant) i A
--   B1  owner i organisation B

begin;

do $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    create schema if not exists vault;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    insert into vault.decrypted_secrets values ('rot_pnr_key', 'provnyckel-bara-for-pglite-0123456789abcdef');
  end if;
end $$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000023a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000023a2', 'a-personal@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000023a3', 'a-lasare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000023a4', 'a-konsult@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000023b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000023a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000023b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));

reset role;
insert into memberships (org_id, user_id, role) values
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000023a2', 'staff'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000023a3', 'readonly'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000023a4', 'accountant');

-- A2 (personal) skriver ett utkast med två ROT-köpare i klartext, som
-- formuläret och API:t gör, och lägger köpare 1 i en ROT-begäran.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000023a2","role":"authenticated","email":"a-personal@prov.se"}';
with i as (
  insert into invoices (org_id, document) values ((select v from prov where k = 'a'),
    '{"title":"Prov","se":{"rot":{"buyers":[{"name":"Anna","personalNumber":"850412-1234","roomOre":null},{"name":"Bo","personalNumber":"198301015678","roomOre":null}],"property":{"kind":"fastighet","designation":"Prov 1:1"},"deductionOre":null}}}')
  returning id)
insert into prov select 'inv', id from i;

do $$
declare n int;
begin
  begin
    perform invoice_buyer_pnr((select v from prov where k = 'inv'), 0);
    raise exception 'Personalen fick fakturans personnummer';
  exception when insufficient_privilege then null;
  end;

  insert into prov values ('buyer', rot_buyer_from_invoice((select v from prov where k = 'inv'), 0, 5000000, '{"kind":"fastighet","designation":"Prov 1:1"}', 'Bygg'));
  select count(*) into n from rot_buyers;
  if n <> 0 then raise exception 'Personalen ser rot_buyers'; end if;
  begin
    perform rot_buyer_pnr((select v from prov where k = 'buyer'));
    raise exception 'Personalen fick köparens personnummer';
  exception when insufficient_privilege then null;
  end;

  -- Ändrar namnet och behåller det maskerade numret, som formuläret gör;
  -- tömmer köpare 2.
  update invoices set document = jsonb_set(jsonb_set(document, '{se,rot,buyers,0,name}', '"Anna L"'), '{se,rot,buyers,1,personalNumber}', '""')
    where id = (select v from prov where k = 'inv');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Personalen kunde inte spara utkastet'; end if;
end $$;

-- Som postgres: ingen klartext i databasen.
reset role;
do $$
declare
  v_doc jsonb;
begin
  select document into v_doc from invoices where id = (select v from prov where k = 'inv');
  if v_doc::text ~ '(850412-?1234|198301015678|5678)' then
    raise exception 'Klartext ligger kvar i fakturans dokument: %', v_doc #> '{se,rot,buyers}';
  end if;
  if v_doc #>> '{se,rot,buyers,0,personalNumber}' <> '19850412-XXXX' then
    raise exception 'Fel maskering: %', v_doc #>> '{se,rot,buyers,0,personalNumber}';
  end if;
  if coalesce(v_doc #>> '{se,rot,buyers,0,personalNumberSealed}', '') = '' then
    raise exception 'Kryptotexten saknas i dokumentet';
  end if;
  if v_doc #> '{se,rot,buyers,1}' ? 'personalNumberSealed' then
    raise exception 'Ett tömt personnummer behöll sin kryptotext';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'rot_buyers' and column_name = 'personal_number') then
    raise exception 'rot_buyers.personal_number finns kvar';
  end if;
  if exists (select 1 from rot_buyers where position('8504121234'::bytea in personal_number_enc) > 0) then
    raise exception 'rot_buyers har klartext i den krypterade kolumnen';
  end if;
  -- Kryptotexten går inte att öppna med en annan organisations nyckel.
  begin
    perform rot_pnr_decrypt((select v from prov where k = 'b'), personal_number_enc) from rot_buyers where id = (select v from prov where k = 'buyer');
    raise exception 'Kryptotexten gick att öppna i organisation B';
  exception when others then
    if sqlerrm like 'Kryptotexten gick%' then raise; end if;
  end;
end $$;

-- Läsare och redovisningskonsult i A, owner i B: inget personnummer.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000023a3","role":"authenticated","email":"a-lasare@prov.se"}';
do $$
begin
  begin
    perform invoice_buyer_pnr((select v from prov where k = 'inv'), 0);
    raise exception 'Läsaren fick fakturans personnummer';
  exception when insufficient_privilege then null;
  end;
  begin
    perform rot_buyer_pnr((select v from prov where k = 'buyer'));
    raise exception 'Läsaren fick köparens personnummer';
  exception when insufficient_privilege then null;
  end;
  begin
    perform rot_buyer_from_invoice((select v from prov where k = 'inv'), 0, 1, '{}', 'Bygg');
    raise exception 'Läsaren kunde skapa en ROT-köpare';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000023a4","role":"authenticated","email":"a-konsult@prov.se"}';
do $$
begin
  begin
    perform invoice_buyer_pnr((select v from prov where k = 'inv'), 0);
    raise exception 'Konsulten fick fakturans personnummer';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000023b1","role":"authenticated","email":"b-agare@prov.se"}';
do $$
begin
  begin
    perform invoice_buyer_pnr((select v from prov where k = 'inv'), 0);
    raise exception 'B fick A:s personnummer';
  exception when insufficient_privilege then null;
  end;
  begin
    perform rot_buyer_pnr((select v from prov where k = 'buyer'));
    raise exception 'B fick A:s köpare';
  exception when insufficient_privilege then null;
  end;
end $$;

-- A1 (owner): rätt personnummer tillbaka, men aldrig kryptotexten direkt.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000023a1","role":"authenticated","email":"a-agare@prov.se"}';
do $$
declare
  v_pnr text;
begin
  v_pnr := invoice_buyer_pnr((select v from prov where k = 'inv'), 0);
  if v_pnr is distinct from '198504121234' then raise exception 'Owner fick fel personnummer från fakturan: %', v_pnr; end if;
  v_pnr := invoice_buyer_pnr((select v from prov where k = 'inv'), 1);
  if v_pnr is not null then raise exception 'Tömt personnummer gav %', v_pnr; end if;
  v_pnr := rot_buyer_pnr((select v from prov where k = 'buyer'));
  if v_pnr is distinct from '198504121234' then raise exception 'Owner fick fel personnummer från begäran: %', v_pnr; end if;
  select personal_number_masked into v_pnr from rot_buyers where id = (select v from prov where k = 'buyer');
  if v_pnr is distinct from '19850412-XXXX' then raise exception 'Owner ser inte det maskerade numret: %', v_pnr; end if;
  begin
    perform personal_number_enc from rot_buyers;
    raise exception 'Owner kunde läsa kryptotexten direkt';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$ begin raise notice 'Prov 0023: alla gick igenom'; end $$;
rollback;
