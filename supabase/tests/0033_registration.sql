-- Prov för 0033 (självregistrering). Körs i Supabase SQL-editor efter 0033.
-- Allt sker i en transaktion som rullas tillbaka: två provanvändare, inget
-- blir kvar. Ett fel avbryter med ett tydligt meddelande; "Prov 0033: alla
-- gick igenom" betyder att allt höll.
--
--   R1  registrerar Prov Registrering AB och slutför med sin länk
--   R2  en annan inloggad användare som försöker använda R1:s länk

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000033a1', 'ny@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000033b1', 'annan@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v text) on commit drop;
grant all on prov to authenticated, service_role, anon;

-- Anon och inloggade kan varken läsa tabellen eller starta en registrering själva.
set local role anon;
do $$
begin
  begin
    perform 1 from pending_registrations;
    raise exception 'anon läser pending_registrations';
  exception when insufficient_privilege then null;
  end;
  begin
    perform start_registration('Intrång AB', '559000-3301', 'X', 'x@prov.se', repeat('a', 64), null);
    raise exception 'anon kunde starta en registrering';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- Servern (service role) sparar registreringen. Fel uppgifter stoppas.
set local role service_role;
do $$
declare r text;
begin
  begin
    perform start_registration('Prov AB', '12345', 'Ny Person', 'ny@prov.se', repeat('a', 64), null);
    raise exception 'Ett felaktigt organisationsnummer gick igenom';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform start_registration('Prov AB', '559000-3301', 'Ny Person', 'inte-en-adress', repeat('a', 64), null);
    raise exception 'En felaktig e-postadress gick igenom';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform start_registration('Prov AB', '559000-3301', 'Ny Person', 'ny@prov.se', 'kort', null);
    raise exception 'En för kort token gick igenom';
  exception when invalid_parameter_value then null;
  end;

  r := start_registration('Prov Registreringen AB', '5590003301', 'Ny Person', 'NY@prov.se', repeat('1', 64), '203.0.113.7');
  if r <> 'created' then raise exception 'Första registreringen gav %', r; end if;
  -- Samma adress igen: samma rad, ny token, den gamla länken gäller inte längre.
  r := start_registration('Prov Registrering AB', '559000-3301', 'Ny Person', 'ny@prov.se', repeat('2', 64), '203.0.113.7');
  if r <> 'resent' then raise exception 'Dubbletten gav %', r; end if;
end $$;
reset role;

do $$
declare n int; v_nr text; v_name text;
begin
  select count(*), max(org_nr), max(org_name) into n, v_nr, v_name from pending_registrations where email = 'ny@prov.se';
  if n <> 1 then raise exception 'Dubbletten skapade en ny rad (% rader).', n; end if;
  if v_nr <> '559000-3301' then raise exception 'Organisationsnumret normaliserades inte (%).', v_nr; end if;
  if v_name <> 'Prov Registrering AB' then raise exception 'Namnet uppdaterades inte (%).', v_name; end if;
  if exists (select 1 from pending_registrations where token_hash = repeat('2', 64)) then
    raise exception 'Token sparas i klartext';
  end if;
end $$;

-- En annan inloggad användare kan inte använda länken.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000033b1","role":"authenticated","email":"annan@prov.se"}';
do $$
begin
  begin
    perform complete_registration(repeat('2', 64));
    raise exception 'Fel användare kunde slutföra registreringen';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from pending_registrations;
    raise exception 'En inloggad läser pending_registrations';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Rätt användare: den gamla länken gäller inte, den nya skapar organisationen.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000033a1","role":"authenticated","email":"ny@prov.se"}';
do $$
begin
  begin
    perform complete_registration(repeat('1', 64));
    raise exception 'Den ersatta länken fungerade';
  exception when no_data_found then null;
  end;
end $$;
insert into prov values ('org', complete_registration(repeat('2', 64))::text);

do $$
declare v_org uuid := (select v from prov where k = 'org')::uuid; n int; v_role text; v_company jsonb;
begin
  select role into v_role from memberships where org_id = v_org and user_id = '00000000-0000-4000-8000-0000000033a1';
  if v_role is distinct from 'owner' then raise exception 'Den som registrerade blev inte owner (%).', v_role; end if;
  select count(*) into n from organizations where id = v_org and name = 'Prov Registrering AB' and org_nr = '559000-3301';
  if n <> 1 then raise exception 'Organisationen har fel namn eller org.nr.'; end if;
  select count(*) into n from number_series where org_id = v_org;
  -- F, V och L (lönebesked, 0039).
  if n <> 3 then raise exception 'Nummerserierna saknas (%).', n; end if;
  select data->'company' into v_company from org_settings where org_id = v_org;
  if v_company->>'legalName' <> 'Prov Registrering AB' or v_company->>'email' <> 'ny@prov.se' or v_company->>'signer' <> 'Ny Person' then
    raise exception 'Inställningarna fick inte kontaktuppgifterna: %', v_company;
  end if;
end $$;

-- En förbrukad token kan inte användas igen, varken av samma eller en annan användare.
do $$
begin
  begin
    perform complete_registration(repeat('2', 64));
    raise exception 'En förbrukad token skapade en organisation till';
  exception when invalid_parameter_value then null;
  end;
end $$;
do $$
declare n int;
begin
  select count(*) into n from memberships where user_id = '00000000-0000-4000-8000-0000000033a1';
  if n <> 1 then raise exception 'Väntade en organisation, fick %.', n; end if;
end $$;

reset role;
do $$
declare n int;
begin
  select count(*) into n from pending_registrations where email = 'ny@prov.se' and consumed_at is not null and org_id = (select v from prov where k = 'org')::uuid;
  if n <> 1 then raise exception 'Registreringen markerades inte förbrukad.'; end if;
end $$;

-- Efter en slutförd registrering kan samma adress registrera ett företag till (ny rad),
-- och en utgången länk stoppas.
set local role service_role;
do $$
declare r text;
begin
  r := start_registration('Prov Två AB', '559000-3302', 'Ny Person', 'ny@prov.se', repeat('3', 64), null);
  if r <> 'created' then raise exception 'Andra registreringen gav %', r; end if;
end $$;
reset role;
update pending_registrations set expires_at = now() - interval '1 minute' where email = 'ny@prov.se' and consumed_at is null;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000033a1","role":"authenticated","email":"ny@prov.se"}';
do $$
begin
  begin
    perform complete_registration(repeat('3', 64));
    raise exception 'En utgången länk fungerade';
  exception when invalid_parameter_value then null;
  end;
end $$;
-- Utan inloggning går inget.
set local request.jwt.claims = '{"role":"authenticated"}';
do $$
begin
  begin
    perform complete_registration(repeat('3', 64));
    raise exception 'Utan inloggning gick det';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

do $$ begin raise notice 'Prov 0033: alla gick igenom'; end $$;
rollback;
