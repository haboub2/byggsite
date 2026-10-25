-- Prov för 0029 (anropsgränser och anropslogg för API v1). Körs i Supabase
-- SQL-editorn efter 0029. Allt sker i en transaktion som rullas tillbaka: två
-- provanvändare, två provorganisationer, inget blir kvar. Ett fel avbryter
-- med ett tydligt meddelande; "Prov 0029: alla gick igenom" betyder att allt
-- höll.
--
--   A1  owner i organisation A, som har nyckeln
--   B1  owner i organisation B, som inte får se A:s anrop
--
-- now() står still i en transaktion, så fönsterbyten provas genom att flytta
-- räknarradernas window_start bakåt.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000029a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000029b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated, service_role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000029b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000029a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', '5590000001'));

-- Admin skapar en nyckel och försöker ge den egna gränser: standard gäller.
with x as (
  insert into api_keys (org_id, name, prefix, key_hash, scopes, rate_per_minute, rate_per_day)
  values ((select v from prov where k = 'a'), 'Prov', 'bf_test_prov', 'prov-0029-hash', '{read}', 100000, 100000000)
  returning id)
insert into prov select 'k', id from x;
update api_keys set rate_per_minute = 99999, rate_per_day = 99999 where id = (select v from prov where k = 'k');
do $$
begin
  if (select (rate_per_minute, rate_per_day) from api_keys where id = (select v from prov where k = 'k')) is distinct from (600, 20000) then
    raise exception 'En inloggad admin kunde sätta nyckelns gränser.';
  end if;
end $$;

-- En inloggad användare kan inte räkna anrop eller rensa loggen.
do $$
begin
  begin
    perform api_check_rate((select v from prov where k = 'k'));
    raise exception 'authenticated fick köra api_check_rate.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform api_prune_usage(90);
    raise exception 'authenticated fick köra api_prune_usage.';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Binaafy sätter en låg gräns för provet: 3 i minuten, 5 per dygn.
reset role;
set local request.jwt.claims = '';
update api_keys set rate_per_minute = 3, rate_per_day = 5 where id = (select v from prov where k = 'k');

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
declare
  v_key uuid := (select v from prov where k = 'k');
  r jsonb;
  i int;
begin
  if (select (rate_per_minute, rate_per_day) from api_keys where id = v_key) is distinct from (3, 5) then
    raise exception 'Gränsen gick inte att sätta utanför adminsidan.';
  end if;
  for i in 1..3 loop
    r := api_check_rate(v_key);
    if not (r->>'allowed')::boolean then raise exception 'Anrop % nekades: %', i, r; end if;
    if (r->>'remaining_minute')::int <> 3 - i then raise exception 'Fel remaining_minute efter anrop %: %', i, r; end if;
  end loop;
  if (select last_used_at from api_keys where id = v_key) is null then raise exception 'last_used_at sattes inte.'; end if;

  -- Det fjärde anropet i samma minut nekas, med Retry-After inom minuten.
  r := api_check_rate(v_key);
  if (r->>'allowed')::boolean then raise exception 'Fjärde anropet släpptes igenom: %', r; end if;
  if (r->>'retry_after')::int not between 1 and 60 then raise exception 'Retry-After utanför minuten: %', r; end if;
  if (r->>'remaining_minute')::int <> 0 or (r->>'remaining_day')::int <> 2 then raise exception 'Fel remaining vid 429: %', r; end if;
  if (select count from api_rate_counters where key_id = v_key and window_kind = 'minute') <> 3 then
    raise exception 'Ett nekat anrop räknades.';
  end if;

  -- Nästa minut: räknaren börjar om, dygnet fortsätter.
  update api_rate_counters set window_start = window_start - interval '1 minute' where key_id = v_key and window_kind = 'minute';
  r := api_check_rate(v_key);
  if not (r->>'allowed')::boolean or (r->>'remaining_minute')::int <> 2 or (r->>'remaining_day')::int <> 1 then
    raise exception 'Minuten började inte om: %', r;
  end if;
  r := api_check_rate(v_key);
  if not (r->>'allowed')::boolean or (r->>'remaining_day')::int <> 0 then raise exception 'Femte anropet: %', r; end if;

  -- Dygnet är slut: nekas trots ny minut, Retry-After till midnatt (UTC).
  update api_rate_counters set window_start = window_start - interval '1 minute' where key_id = v_key and window_kind = 'minute';
  r := api_check_rate(v_key);
  if (r->>'allowed')::boolean then raise exception 'Dygnsgränsen höll inte: %', r; end if;
  if (r->>'retry_after')::int <> (r->>'reset_day')::int then raise exception 'Retry-After ska gå till dygnets slut: %', r; end if;

  -- Nästa dygn: båda börjar om.
  update api_rate_counters set window_start = window_start - interval '1 day' where key_id = v_key;
  r := api_check_rate(v_key);
  if not (r->>'allowed')::boolean or (r->>'remaining_day')::int <> 4 or (r->>'remaining_minute')::int <> 2 then
    raise exception 'Dygnet började inte om: %', r;
  end if;
  if (select count(*) from api_rate_counters where key_id = v_key) <> 2 then raise exception 'Räknartabellen ska ha två rader per nyckel.'; end if;

  begin
    perform api_check_rate('00000000-0000-4000-8000-000000000000');
    raise exception 'En okänd nyckel räknades.';
  exception when no_data_found then null;
  end;
end $$;

-- Loggen: servern skriver A:s och B:s anrop, ett av A:s är 91 dagar gammalt.
insert into api_requests (org_id, key_id, request_id, method, path, status, duration_ms, idempotency_key, created_at) values
  ((select v from prov where k = 'a'), (select v from prov where k = 'k'), 'req_a1', 'GET', '/api/v1/invoices', 200, 12, null, now()),
  ((select v from prov where k = 'a'), (select v from prov where k = 'k'), 'req_a2', 'POST', '/api/v1/invoices', 422, 8, 'prov-0029-1', now()),
  ((select v from prov where k = 'a'), (select v from prov where k = 'k'), 'req_a3', 'GET', '/api/v1/customers', 429, 1, null, now()),
  ((select v from prov where k = 'a'), (select v from prov where k = 'k'), 'req_a0', 'GET', '/api/v1/customers', 200, 5, null, now() - interval '91 days'),
  ((select v from prov where k = 'b'), null, 'req_b1', 'GET', '/api/v1/invoices', 200, 9, null, now());

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000029a1","role":"authenticated","email":"a-agare@prov.se"}';
do $$
declare
  s record;
begin
  if (select count(*) from api_requests) <> 4 then raise exception 'A ser inte exakt sina fyra anrop.'; end if;
  select * into s from api_request_stats((select v from prov where k = 'a'), now() - interval '1 day');
  if s.calls <> 3 or s.errors <> 2 then raise exception 'Nyckeltalen blev fel: % anrop, % fel', s.calls, s.errors; end if;
  if (select count(*) from api_request_stats((select v from prov where k = 'b'), now() - interval '1 day')) <> 0 then
    raise exception 'A ser nyckeltal för B.';
  end if;
  if (select count(*) from api_rate_counters) <> 0 then raise exception 'Räknarna syns för en inloggad användare.'; end if;
  begin
    insert into api_requests (org_id, request_id, method, path, status, duration_ms)
      values ((select v from prov where k = 'a'), 'req_fake', 'GET', '/api/v1/x', 200, 1);
    raise exception 'En inloggad användare kunde skriva i anropsloggen.';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000029b1","role":"authenticated","email":"b-agare@prov.se"}';
do $$
begin
  if (select count(*) from api_requests) <> 1 then raise exception 'B ser andras anrop.'; end if;
end $$;

-- Cron rensar det som är äldre än 90 dagar.
reset role;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';
do $$
begin
  if api_prune_usage(90) <> 1 then raise exception 'Rensningen tog fel antal rader.'; end if;
  if exists (select 1 from api_requests where request_id = 'req_a0') then raise exception 'Det gamla anropet finns kvar.'; end if;
  if (select count(*) from api_requests) <> 4 then raise exception 'Rensningen tog nya anrop.'; end if;
end $$;

-- Webhooks: invoice.corrected kan prenumereras på.
reset role;
do $$
begin
  if not is_webhook_event('invoice.corrected') or not is_webhook_event('invoice.paid') or is_webhook_event('invoice.updated') then
    raise exception 'is_webhook_event har fel lista.';
  end if;
  -- En borttagen nyckel tar sina räknare med sig; loggen blir kvar utan nyckel.
  delete from api_keys where id = (select v from prov where k = 'k');
  if exists (select 1 from api_rate_counters where key_id = (select v from prov where k = 'k')) then raise exception 'Räknarna blev kvar.'; end if;
  if (select count(*) from api_requests where key_id is null and org_id = (select v from prov where k = 'a')) <> 3 then
    raise exception 'Anropen försvann med nyckeln.';
  end if;
end $$;

do $$ begin raise notice 'Prov 0029: alla gick igenom'; end $$;

rollback;
