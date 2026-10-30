-- Prov för 0043 (produkt: onboarding av en andra organisation, förval av
-- lönearter, drivmedelsförmån i ruta 018, lönens händelser till webhooks;
-- docs/hr-lon.md fas 6). Körs i Supabase SQL-editor efter 0043, eller
-- lokalt med supabase/tests/local/run.sh. Allt sker i en transaktion som
-- rullas tillbaka; "Prov 0043: alla gick igenom" betyder att allt höll.
--
--   A1  owner i A
--   B1  owner i B (den andra organisationen, skapad efter A)
--   B2  redovisningskonsult i B
--
-- B skapas med create_organization och ska ha allt en lön behöver utan
-- manuell SQL: löneartsregistret med 1830/1831, serien L, lönekontona och
-- lönebesluten. B:s ägare tillämpar Byggavtalets förval (nya versioner,
-- loggat); A:s register rörs inte. B ser inget av A; en API-nyckel för B
-- syns inte för A, och det servern läser som B är bara B:s rader. B:s
-- webhook får payslip.approved för B, inte A:s och inte interna händelser.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000043a1', 'a-agare@prov43.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000043b1', 'b-agare@prov43.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000043b2', 'b-konsult@prov43.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated, service_role;

create function pg_temp.som(p_user text) returns void
  language sql
as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-4000-8000-0000000043' || p_user, 'role', 'authenticated', 'email', p_user || '@prov43.se')::text, true)
$$;
grant execute on function pg_temp.som(text) to authenticated;

-- En löneart som payroll_apply_preset() tar den (pay-item-presets.ts presetRows).
create function pg_temp.art(p_code text, p_name text, p_kind text, p_avgift boolean, p_semester boolean, p_pension boolean,
                            p_box text, p_account text, p_counter text, p_fora text) returns jsonb
  language sql
as $$
  select jsonb_build_object('code', p_code, 'name', p_name, 'kind', p_kind, 'taxable', true, 'taxMode', 'table',
    'subjectToEmployerContribution', p_avgift, 'vacationPayBasis', p_semester, 'pensionReportable', p_pension,
    'agiBox', p_box, 'account', p_account, 'counterAccount', p_counter, 'foraCategory', p_fora)
$$;
grant execute on function pg_temp.art(text, text, text, boolean, boolean, boolean, text, text, text, text) to authenticated;

-- Byggavtalets förval, tre rader: 1100 som standard (ingen ny version), 1010 utan
-- Collectum (ny version), 1120 Helglön (ny löneart).
create function pg_temp.bygg() returns jsonb
  language sql
as $$
  select jsonb_build_array(
    pg_temp.art('1100', 'Timlön', 'hourly', true, true, true, '011', '7010', '2820', 'lon'),
    pg_temp.art('1010', 'Månadslön', 'salary', true, true, false, '011', '7210', '2820', null),
    pg_temp.art('1120', 'Helglön', 'hourly', true, true, true, '011', '7010', '2820', 'lon'))
$$;
grant execute on function pg_temp.bygg() to authenticated;

-- ---------------------------------------------------------------- två organisationer

set local role authenticated;
select pg_temp.som('a1');
insert into prov values ('a', create_organization('Prov A AB', '559000-4301'));
select pg_temp.som('b1');
insert into prov values ('b', create_organization('Prov B AB', '559000-4302'));

reset role;
insert into memberships (org_id, user_id, role) values
  ((select v from prov where k = 'b'), '00000000-0000-4000-8000-0000000043b2', 'accountant');

-- B fick allt en lön behöver när organisationen skapades.
do $$
declare b uuid := (select v from prov where k = 'b'); n int;
begin
  select count(*) into n from pay_items where org_id = b;
  if n <> 39 then raise exception 'B:s löneartsregister: % arter, inte 39', n; end if;
  if not exists (select 1 from pay_items where org_id = b and code = '1830' and agi_box = '018' and subject_to_employer_contribution)
     or not exists (select 1 from pay_items where org_id = b and code = '1831' and agi_box = '018' and not subject_to_employer_contribution) then
    raise exception 'B saknar drivmedelsförmånens lönearter 1830/1831 med ruta 018';
  end if;
  if not exists (select 1 from number_series where org_id = b and series = 'L') then raise exception 'B saknar serien L'; end if;
  if not exists (select 1 from payroll_settings where org_id = b) then raise exception 'B saknar lönebesluten'; end if;
  select count(*) into n from accounts where org_id = b and number in ('7010', '7210', '7385', '7399', '2710', '2820', '2731', '7533', '2514');
  if n <> 9 then raise exception 'B saknar lönekonton (% av 9)', n; end if;
  -- A, skapad före B, har samma register.
  select count(*) into n from pay_items where org_id = (select v from prov where k = 'a');
  if n <> 39 then raise exception 'A:s löneartsregister: % arter', n; end if;
end $$;

-- ---------------------------------------------------------------- förvalet

set local role authenticated;
select pg_temp.som('b1');
do $$
declare b uuid := (select v from prov where k = 'b'); n int; r record;
begin
  n := payroll_apply_preset(b, 'byggavtalet', pg_temp.bygg(), '2026-11-01');
  if n <> 2 then raise exception 'Förvalet gav % nya versioner, inte 2', n; end if;
  select count(*) into n from pay_items where org_id = b;
  if n <> 41 then raise exception 'B:s register efter förvalet: % arter, inte 41', n; end if;
  select * into r from pay_items where org_id = b and code = '1010' order by version desc limit 1;
  if r.version <> 2 or r.valid_from <> '2026-11-01' or r.pension_reportable then raise exception 'Månadslönens nya version stämmer inte: v% från %', r.version, r.valid_from; end if;
  if (select count(*) from pay_items where org_id = b and code = '1100') <> 1 then raise exception 'Timlönen fick en version fast den var som förvalet'; end if;
  if not exists (select 1 from pay_items where org_id = b and code = '1120' and version = 1 and name = 'Helglön') then raise exception 'Helglön lades inte till'; end if;
  if (select data->>'payItemPreset' from payroll_settings where org_id = b) <> 'byggavtalet' then raise exception 'Förvalet antecknades inte i lönebesluten'; end if;
  if not exists (select 1 from events where org_id = b and aggregate_type = 'payroll' and type = 'payroll.preset_applied'
                   and data->>'preset' = 'byggavtalet' and (data->>'versions')::int = 2 and data->'codes' = '["1010","1120"]'::jsonb) then
    raise exception 'payroll.preset_applied loggades inte';
  end if;
  -- Samma förval igen: ingenting ändras.
  if payroll_apply_preset(b, 'byggavtalet', pg_temp.bygg(), '2026-11-01') <> 0 then raise exception 'Förvalet gav nya versioner andra gången'; end if;
  begin
    perform payroll_apply_preset(b, 'ackordsavtalet', pg_temp.bygg(), '2026-11-01');
    raise exception 'Ett okänt förval gick igenom';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- A:s register rördes inte, och A:s ägare kan inte ändra B:s.
select pg_temp.som('a1');
do $$
declare a uuid := (select v from prov where k = 'a'); b uuid := (select v from prov where k = 'b');
begin
  if (select count(*) from pay_items where org_id = a) <> 39 or (select max(version) from pay_items where org_id = a) <> 1 then
    raise exception 'A:s register ändrades av B:s förval';
  end if;
  if (select count(*) from pay_items where org_id = b) <> 0 then raise exception 'A ser B:s lönearter'; end if;
  if (select count(*) from payroll_settings where org_id = b) <> 0 then raise exception 'A ser B:s lönebeslut'; end if;
  begin
    perform payroll_apply_preset(b, 'none', pg_temp.bygg(), '2026-11-01');
    raise exception 'A:s ägare kunde tillämpa ett förval på B';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Konsulten läser men tillämpar inte förval.
select pg_temp.som('b2');
do $$
declare b uuid := (select v from prov where k = 'b');
begin
  if (select count(*) from pay_items where org_id = b) <> 41 then raise exception 'Konsulten ser inte B:s register'; end if;
  begin
    perform payroll_apply_preset(b, 'none', pg_temp.bygg(), '2026-11-01');
    raise exception 'Konsulten kunde tillämpa ett förval';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- personal, förmån med drivmedel, AGI-rutan

select pg_temp.som('a1');
insert into prov values ('anna', hr_create_employee((select v from prov where k = 'a'), '{"name":"Anna Andersson"}', '199005052387', '8327', '9 123 456 789'));
select pg_temp.som('b1');
insert into prov values ('bert', hr_create_employee((select v from prov where k = 'b'), '{"name":"Bert Berg"}', '198802022387', '6000', '123 456 789'));

do $$
declare b uuid := (select v from prov where k = 'b'); v_id uuid;
begin
  if (select count(*) from employees) <> 1 or (select count(*) from employees where org_id = (select v from prov where k = 'a')) <> 0 then
    raise exception 'B ser inte bara sin egen personal';
  end if;
  -- Bilförmån med drivmedel: 0042:s private_fuel_ore och 0043:s fuel_employee_payment_ore.
  insert into benefits (org_id, employee_id, kind, valid_from, registration_number, car_model, first_registered_on, model_year, fuel,
                        new_car_price_ore, fuel_paid_by_employer, private_fuel_ore, monthly_value_ore, rule_version)
  values (b, (select v from prov where k = 'bert'), 'bil', '2026-01-01', 'ABC123', 'Volvo V60', '2024-03-01', 2024, 'diesel',
          30000000, true, 120000, 600300, '2026-04-01/benefits-1')
  returning id into v_id;
  update benefits set fuel_employee_payment_ore = 120000 where id = v_id;
  if (select fuel_employee_payment_ore from benefits where id = v_id) <> 120000 then raise exception 'Drivmedlets återbetalning sparades inte'; end if;
  begin
    update benefits set fuel_employee_payment_ore = -1 where id = v_id;
    raise exception 'En negativ återbetalning gick igenom';
  exception when check_violation then null;
  end;
  -- Månadens AGI-bygge har ruta 018 bland rutorna (tom månad: 0).
  if not ((agi_build(b, '2026-11')->'totals'->'boxes') ? '018') then raise exception 'agi_build saknar ruta 018'; end if;
  if (agi_build(b, '2026-11')->'totals'->'boxes'->>'018')::bigint <> 0 then raise exception 'Ruta 018 är inte 0 för en tom månad'; end if;
end $$;

-- ---------------------------------------------------------------- API-nyckel och webhook

select pg_temp.som('b1');
insert into api_keys (org_id, name, prefix, key_hash, scopes, created_by)
  values ((select v from prov where k = 'b'), 'Lönesystemet', 'bf_test_PROV', repeat('b', 64), '{read}', 'b-agare@prov43.se');
with w as (
  insert into webhook_endpoints (org_id, url, events) values ((select v from prov where k = 'b'), 'https://example.se/lon-hook', '{}') returning id)
insert into prov select 'hook', id from w;

select pg_temp.som('a1');
do $$
begin
  if (select count(*) from api_keys where org_id = (select v from prov where k = 'b')) <> 0 then raise exception 'A ser B:s API-nyckel'; end if;
  if (select count(*) from webhook_endpoints where org_id = (select v from prov where k = 'b')) <> 0 then raise exception 'A ser B:s webhook'; end if;
end $$;

-- Servern läser som service role med nyckelns organisation på varje fråga (lib/api/route.ts asSystem):
-- B:s nyckel ger B:s personal och ingenting av A:s.
reset role;
set local role service_role;
do $$
declare a uuid := (select v from prov where k = 'a'); b uuid := (select v from prov where k = 'b');
begin
  if (select count(*) from api_keys where org_id = b and revoked_at is null) <> 1 then raise exception 'B:s nyckel finns inte'; end if;
  if (select count(*) from employees where org_id = b) <> 1 or (select count(*) from employees where org_id = a) <> 1 then
    raise exception 'Personalen per organisation stämmer inte';
  end if;
  if (select count(*) from pay_runs where org_id = b) <> 0 then raise exception 'B har körningar den inte skapat'; end if;
  -- Lönens händelser är webhook-händelser, de interna inte.
  if not is_webhook_event('payslip.approved') or not is_webhook_event('payroll.run_approved') or not is_webhook_event('payroll.run_closed')
     or not is_webhook_event('time.approved') or not is_webhook_event('expense.approved') then
    raise exception 'Lönens händelser levereras inte till webhooks';
  end if;
  if is_webhook_event('payroll.run_calculated') or is_webhook_event('employee.pnr_revealed') or is_webhook_event('payroll.preset_applied') then
    raise exception 'En intern händelse levereras till webhooks';
  end if;
  -- B:s endpoint får B:s godkända lönebesked, inte A:s och inte en intern händelse.
  insert into events (org_id, aggregate_type, aggregate_id, type, data, actor) values
    (b, 'employee', (select v from prov where k = 'bert'), 'payslip.approved', '{"payslipId":"x","number":1,"netOre":2500000}', '{"kind":"system","name":"prov"}'),
    (b, 'payroll', b, 'payroll.run_calculated', '{"payslips":1}', '{"kind":"system","name":"prov"}'),
    (a, 'employee', (select v from prov where k = 'anna'), 'payslip.approved', '{"payslipId":"y","number":1,"netOre":2500000}', '{"kind":"system","name":"prov"}');
  if (select count(*) from webhook_deliveries where endpoint_id = (select v from prov where k = 'hook')) <> 1 then
    raise exception 'B:s webhook fick % leveranser, inte 1', (select count(*) from webhook_deliveries where endpoint_id = (select v from prov where k = 'hook'));
  end if;
  if (select count(*) from webhook_deliveries d join events e on e.id = d.event_id where d.endpoint_id = (select v from prov where k = 'hook') and e.org_id = b and e.type = 'payslip.approved') <> 1 then
    raise exception 'Leveransen är inte B:s payslip.approved';
  end if;
end $$;

do $$ begin raise notice 'Prov 0043: alla gick igenom'; end $$;

rollback;
