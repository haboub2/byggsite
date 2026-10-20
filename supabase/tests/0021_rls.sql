-- RLS- och funktionsprov för 0021 (fas 5). Körs i Supabase SQL-editor efter
-- 0021. Allt sker i en transaktion som rullas tillbaka: två provanvändare,
-- två organisationer, inget blir kvar. Ett fel avbryter med ett tydligt
-- meddelande; "RLS-prov 0021: alla gick igenom" betyder att allt höll.

begin;

-- Två användare (bara i transaktionen).
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000000a1', 'agare-a@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b1', 'agare-b@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c1', 'konsult@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

-- Som användare A: skapa organisation A.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","email":"agare-a@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', '5590000001'));

-- Som användare B: skapa organisation B och en kund där.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated","email":"agare-b@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));
insert into customers (org_id, type, name) values ((select v from prov where k = 'b'), 'foretag', 'Kund i B');

do $$
declare n int;
begin
  -- B ser sin egen organisation och kund, men inte A:s.
  select count(*) into n from organizations where id = (select v from prov where k = 'a');
  if n <> 0 then raise exception 'B ser organisation A'; end if;
  select count(*) into n from customers where org_id = (select v from prov where k = 'b');
  if n <> 1 then raise exception 'B ser inte sin kund (%).', n; end if;
  -- create_organization satte upp serier, konton och inställningar.
  select count(*) into n from number_series where org_id = (select v from prov where k = 'b');
  if n <> 2 then raise exception 'Nummerserierna saknas (%).', n; end if;
  select count(*) into n from accounts where org_id = (select v from prov where k = 'b');
  if n < 10 then raise exception 'Kontoplanen saknas (%).', n; end if;
  select count(*) into n from org_settings where org_id = (select v from prov where k = 'b');
  if n <> 1 then raise exception 'Inställningarna saknas.'; end if;
end $$;

-- B kan inte skriva i A.
do $$
begin
  begin
    insert into customers (org_id, type, name) values ((select v from prov where k = 'a'), 'privat', 'Intrång');
    raise exception 'B kunde skapa en kund i A';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into memberships (org_id, user_id, role) values ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000000b1', 'owner');
    raise exception 'B kunde göra sig till owner i A';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Som A: bjud in konsulten som accountant; en owner-inbjudan stoppas.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","email":"agare-a@prov.se"}';
insert into invitations (org_id, email, role) values ((select v from prov where k = 'a'), 'konsult@prov.se', 'accountant');
do $$
begin
  begin
    insert into invitations (org_id, email, role) values ((select v from prov where k = 'a'), 'x@prov.se', 'owner');
    raise exception 'En owner-inbjudan gick igenom';
  exception when check_violation then null;
  end;
  -- Sista ownern kan inte tas bort eller degraderas.
  begin
    update memberships set role = 'admin' where org_id = (select v from prov where k = 'a') and user_id = '00000000-0000-4000-8000-0000000000a1';
    raise exception 'Sista ownern kunde degraderas';
  exception when check_violation then null;
  end;
end $$;
create temp table prov_token on commit drop as select token from invitations where email = 'konsult@prov.se';
grant select on prov_token to authenticated;

-- Fel användare kan inte använda inbjudan.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000b1","role":"authenticated","email":"agare-b@prov.se"}';
do $$
begin
  begin
    perform accept_invitation((select token from prov_token));
    raise exception 'B kunde använda konsultens inbjudan';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Konsulten accepterar, läser men skriver inte.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000c1","role":"authenticated","email":"konsult@prov.se"}';
select accept_invitation((select token from prov_token));
do $$
declare n int;
begin
  select count(*) into n from organizations where id = (select v from prov where k = 'a');
  if n <> 1 then raise exception 'Konsulten ser inte organisation A'; end if;
  select count(*) into n from accounts where org_id = (select v from prov where k = 'a');
  if n < 10 then raise exception 'Konsulten läser inte kontoplanen'; end if;
  begin
    insert into customers (org_id, type, name) values ((select v from prov where k = 'a'), 'privat', 'Från konsulten');
    raise exception 'Konsulten kunde skriva en kund';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from api_keys where org_id = (select v from prov where k = 'a');
  -- api_keys är bara för owner/admin: konsulten ser inga, inte ens tomt fel.
  if n <> 0 then raise exception 'Konsulten ser API-nycklar'; end if;
end $$;

-- Webhook-triggern: en leverans per aktiv endpoint och publik händelse.
reset role;
insert into webhook_endpoints (org_id, url, events) values ((select v from prov where k = 'a'), 'https://httpbin.org/post', '{}');
insert into webhook_endpoints (org_id, url, events, active) values ((select v from prov where k = 'a'), 'https://exempel.se/av', '{}', false);
insert into events (org_id, aggregate_type, aggregate_id, type) values ((select v from prov where k = 'a'), 'invoice', gen_random_uuid(), 'invoice.paid');
insert into events (org_id, aggregate_type, aggregate_id, type) values ((select v from prov where k = 'a'), 'invoice', gen_random_uuid(), 'invoice.updated');
do $$
declare n int;
begin
  select count(*) into n from webhook_deliveries where org_id = (select v from prov where k = 'a');
  if n <> 1 then raise exception 'Väntade en leverans, fick %.', n; end if;
end $$;

do $$ begin raise notice 'RLS-prov 0021: alla gick igenom'; end $$;
rollback;
