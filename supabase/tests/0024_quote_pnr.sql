-- Prov för 0024 (krypterade personnummer i offerterna). Körs i Supabase
-- SQL-editor efter 0023 och 0024, med nyckeln rot_pnr_key i Vault. Allt sker
-- i en transaktion som rullas tillbaka: tre provanvändare, två
-- provorganisationer, inget blir kvar. Ett fel avbryter med ett tydligt
-- meddelande; "Prov 0024: alla gick igenom" betyder att allt höll.
--
-- I PGlite och vanlig Postgres finns ingen Vault. Då skapas en ersättning
-- (vault.decrypted_secrets med en provnyckel) i transaktionen; det riktiga
-- provet av Vault görs i Supabase.
--
--   A1  owner i organisation A
--   A2  personal (staff) i A
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
  ('00000000-0000-4000-8000-0000000024a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000024a2', 'a-personal@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000024b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000024a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000024b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));

reset role;
insert into memberships (org_id, user_id, role) values
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000024a2', 'staff');

-- A2 (personal) sparar en offert med tre ROT-personer, som offertformuläret
-- gör: tio siffror, tolv siffror och ett tomt fält.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000024a2","role":"authenticated","email":"a-personal@prov.se"}';
with q as (
  insert into quotes (org_id, division, data) values ((select v from prov where k = 'a'), 'bygg',
    '{"title":"Prov","rot":true,"rotPersons":[{"name":"Anna","personalNumber":"850412-1234"},{"name":"Bo","personalNumber":"198301015678"},{"name":"Cia","personalNumber":""}]}')
  returning id)
insert into prov select 'quote', id from q;

-- En mall med en person (formuläret sparar mallar utan, men triggern gäller ändå).
with t as (
  insert into quote_templates (org_id, name, division, data) values ((select v from prov where k = 'a'), 'Prov', 'bygg',
    '{"title":"Mall","rotPersons":[{"name":"Dan","personalNumber":"7001019999"}]}')
  returning id)
insert into prov select 'tpl', id from t;

do $$
declare
  v_data jsonb;
  v_sealed text;
  n int;
begin
  -- Personalen ser offerten men bara det maskerade numret.
  select data into v_data from quotes where id = (select v from prov where k = 'quote');
  if v_data::text ~ '(850412-?1234|198301015678|5678)' then
    raise exception 'Klartext i offerten: %', v_data -> 'rotPersons';
  end if;
  if v_data #>> '{rotPersons,0,personalNumber}' <> '19850412-XXXX' or v_data #>> '{rotPersons,1,personalNumber}' <> '19830101-XXXX' then
    raise exception 'Fel maskering: %', v_data -> 'rotPersons';
  end if;
  if coalesce(v_data #>> '{rotPersons,0,personalNumberSealed}', '') = '' or coalesce(v_data #>> '{rotPersons,1,personalNumberSealed}', '') = '' then
    raise exception 'Kryptotexten saknas i offerten';
  end if;
  if v_data #> '{rotPersons,2}' ? 'personalNumberSealed' then
    raise exception 'Ett tomt personnummer fick kryptotext';
  end if;
  v_sealed := v_data #>> '{rotPersons,0,personalNumberSealed}';

  -- Personalen kan inte dekryptera själv.
  begin
    perform rot_pnr_decrypt((select v from prov where k = 'a'), decode(v_sealed, 'base64'));
    raise exception 'Personalen kunde anropa rot_pnr_decrypt';
  exception when insufficient_privilege then null;
  end;

  -- Formuläret sparar igen med maskerat nummer och kryptotext (namnet ändrat):
  -- kryptotexten följer med orörd. Person 2 töms.
  update quotes set data = jsonb_set(jsonb_set(data, '{rotPersons,0,name}', '"Anna L"'), '{rotPersons,1,personalNumber}', '""')
    where id = (select v from prov where k = 'quote');
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'Personalen kunde inte spara offerten'; end if;
  select data into v_data from quotes where id = (select v from prov where k = 'quote');
  if v_data #>> '{rotPersons,0,personalNumberSealed}' is distinct from v_sealed then
    raise exception 'Kryptotexten ändrades när offerten sparades igen';
  end if;
  if v_data #> '{rotPersons,1}' ? 'personalNumberSealed' then
    raise exception 'Ett tömt personnummer behöll sin kryptotext';
  end if;

  -- Ett felaktigt nummer stoppas.
  begin
    update quotes set data = jsonb_set(data, '{rotPersons,2,personalNumber}', '"12-34"') where id = (select v from prov where k = 'quote');
    raise exception 'Ett felaktigt personnummer sparades';
  exception when invalid_parameter_value then null;
  end;

  select data into v_data from quote_templates where id = (select v from prov where k = 'tpl');
  if v_data::text ~ '7001019999' or v_data #>> '{rotPersons,0,personalNumber}' <> '19700101-XXXX' then
    raise exception 'Mallen har klartext: %', v_data -> 'rotPersons';
  end if;

  -- Fakturan från offerten (from-quote.ts): maskerat nummer och kryptotext
  -- kopieras, fakturans trigger lämnar dem orörda.
  insert into invoices (org_id, document)
    select (select v from prov where k = 'a'),
      jsonb_build_object('title', 'Från offert', 'se', jsonb_build_object('rot', jsonb_build_object(
        'buyers', jsonb_build_array(jsonb_build_object('name', q.data #>> '{rotPersons,0,name}', 'personalNumber', q.data #>> '{rotPersons,0,personalNumber}',
                                                       'personalNumberSealed', q.data #>> '{rotPersons,0,personalNumberSealed}', 'roomOre', null)),
        'property', null, 'deductionOre', null)))
    from quotes q where q.id = (select v from prov where k = 'quote');
  select count(*) into n from invoices where org_id = (select v from prov where k = 'a') and document #>> '{se,rot,buyers,0,personalNumberSealed}' = v_sealed;
  if n <> 1 then raise exception 'Fakturan fick inte offertens kryptotext'; end if;
end $$;

insert into prov select 'inv', id from invoices where org_id = (select v from prov where k = 'a') and document->>'title' = 'Från offert';

-- B1 (owner i B) ser inte A:s offert, och A:s kryptotext går inte att öppna
-- i en faktura i B.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000024b1","role":"authenticated","email":"b-agare@prov.se"}';
do $$
declare n int;
begin
  select count(*) into n from quotes where org_id = (select v from prov where k = 'a');
  if n <> 0 then raise exception 'B ser A:s offerter'; end if;
  begin
    perform invoice_buyer_pnr((select v from prov where k = 'inv'), 0);
    raise exception 'B fick personnumret från A:s faktura';
  exception when insufficient_privilege then null;
  end;
end $$;

reset role;
do $$
begin
  begin
    perform rot_pnr_decrypt((select v from prov where k = 'b'), decode(data #>> '{rotPersons,0,personalNumberSealed}', 'base64'))
      from quotes where id = (select v from prov where k = 'quote');
    raise exception 'Offertens kryptotext gick att öppna med B:s nyckel';
  exception when others then
    if sqlerrm like 'Offertens kryptotext%' then raise; end if;
  end;
end $$;

-- A2 (personal) får inte numret från fakturan; A1 (owner) får rätt tolv siffror.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000024a2","role":"authenticated","email":"a-personal@prov.se"}';
do $$
begin
  begin
    perform invoice_buyer_pnr((select v from prov where k = 'inv'), 0);
    raise exception 'Personalen fick personnumret från fakturan';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000024a1","role":"authenticated","email":"a-agare@prov.se"}';
do $$
declare
  v_pnr text;
begin
  v_pnr := invoice_buyer_pnr((select v from prov where k = 'inv'), 0);
  if v_pnr is distinct from '198504121234' then raise exception 'Owner fick fel personnummer från fakturan: %', v_pnr; end if;
end $$;

reset role;
do $$ begin raise notice 'Prov 0024: alla gick igenom'; end $$;
rollback;
