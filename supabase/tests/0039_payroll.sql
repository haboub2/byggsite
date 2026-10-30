-- RLS- och funktionsprov för 0039 (lönekörning, docs/hr-lon.md fas 3).
-- Körs i Supabase SQL-editor efter 0039, eller lokalt med
-- supabase/tests/local/run.sh. Allt sker i en transaktion som rullas
-- tillbaka; "Prov 0039: alla gick igenom" betyder att allt höll.
--
--   A1  owner i A              A2  redovisningskonsult i A
--   A3  personal (staff) i A   A4  anställd, är Erik (månadslön)
--   A5  admin i A (den andra som godkänner)
--   B1  owner i B
--
-- Lönebeskeden här är handskrivna dokument i PayslipDocuments form; själva
-- räkningen provas i lib/core/payroll/run.test.ts. Här provas det databasen
-- gör: lagrar, kontrollerar summorna, fryser, numrerar, bokför, stämmer av.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000039a1', 'a-agare@prov39.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000039a2', 'a-konsult@prov39.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000039a3', 'a-personal@prov39.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000039a4', 'erik@prov39.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000039a5', 'a-admin@prov39.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000039b1', 'b-agare@prov39.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

-- Ett lönebesked som PayslipDocument (bara det databasen läser).
create function pg_temp.prov_doc(p_emp uuid, p_name text, p_code text, p_account text, p_gross bigint, p_tax bigint,
                                 p_contrib bigint, p_sha text, p_period date, p_pay date) returns jsonb
  language sql
as $$
  select jsonb_build_object(
    'schema', 1, 'employeeId', p_emp, 'employeeName', p_name, 'birthYear', 1990,
    'periodStart', p_period, 'periodEnd', (p_period + interval '1 month' - interval '1 day')::date, 'payDate', p_pay,
    'ruleSetValidFrom', '2026-04-01', 'taxTableVersion', p_sha,
    'lines', jsonb_build_array(jsonb_build_object(
      'code', p_code, 'text', 'Lön', 'quantity', 1, 'unit', 'mån', 'unitPriceOre', p_gross, 'basisOre', null, 'ratePercent', null,
      'amountOre', p_gross,
      'item', jsonb_build_object('code', p_code, 'name', 'Lön', 'kind', 'salary', 'version', 1,
                                 'flags', jsonb_build_object('account', p_account, 'counterAccount', '2820', 'agiBox', '011')))),
    'contributions', jsonb_build_object('ratePercent', 31.42, 'amountOre', p_contrib),
    'totals', jsonb_build_object('cashGrossOre', p_gross, 'taxFreeReimbursementOre', 0, 'benefitOre', 0, 'taxOre', p_tax,
                                 'netAdjustmentOre', 0, 'netOre', p_gross - p_tax, 'employerContributionOre', p_contrib,
                                 'sickPayCostOre', 0))
$$;
grant execute on function pg_temp.prov_doc(uuid, text, text, text, bigint, bigint, bigint, text, date, date) to authenticated;

-- En pain.001 med summa och belopp.
create function pg_temp.prov_xml(p_ctrl text, p_nb int, p_amounts text[]) returns text
  language sql
as $$
  select '<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn>'
      || '<GrpHdr><MsgId>PROV</MsgId><NbOfTxs>' || p_nb || '</NbOfTxs><CtrlSum>' || p_ctrl || '</CtrlSum></GrpHdr><PmtInf>'
      || (select string_agg('<CdtTrfTxInf><Amt><InstdAmt Ccy="SEK">' || a || '</InstdAmt></Amt></CdtTrfTxInf>', '') from unnest(p_amounts) a)
      || '</PmtInf></CstmrCdtTrfInitn></Document>'
$$;
grant execute on function pg_temp.prov_xml(text, int, text[]) to authenticated;

-- ---------------------------------------------------------------- skattetabellerna (service role)

-- Tabell 33 kolumn 1 i tio band, och tio kontrollvektorer.
create temp table prov_tax as
select jsonb_build_object('year', 2026, 'sha256', repeat('a', 64), 'fileRowCount', 10,
         'golden', (select jsonb_agg(jsonb_build_object('ok', true, 'actualKr', 6000 + 50 * k,
                      'vector', jsonb_build_object('table', 33, 'column', 1, 'monthlyPayKr', 30100 + 200 * k, 'taxKr', 6000 + 50 * k)))
                      from generate_series(0, 9) k)) as record,
       (select jsonb_agg(jsonb_build_object('year', 2026, 'tableNo', 33, 'column', 1, 'incomeFromOre', (30001 + 200 * k) * 100,
                 'incomeToOre', (30200 + 200 * k) * 100 + 99, 'taxOre', (6000 + 50 * k) * 100, 'percent', null))
          from generate_series(0, 9) k) as rows;

-- I tre steg som laddaren gör: början, raderna i två delar, slutet.
do $$
declare
  v_id uuid := tax_tables_import_begin((select record from prov_tax));
  v_res jsonb;
begin
  if tax_tables_import_rows(v_id, (select jsonb_path_query_array(rows, '$[0 to 4]') from prov_tax)) <> 5
     or tax_tables_import_rows(v_id, (select jsonb_path_query_array(rows, '$[5 to 9]') from prov_tax)) <> 5 then
    raise exception 'Delarna lades inte in';
  end if;
  if (select completed_at from tax_table_imports where id = v_id) is not null then raise exception 'Importen blev klar före finish'; end if;
  v_res := tax_tables_import_finish(v_id);
  if not (v_res->>'ok')::boolean or (select row_count from tax_table_imports where id = v_id) <> 10
     or (select tables from tax_table_imports where id = v_id) <> array[33] then
    raise exception 'Importen blev inte klar: %', v_res;
  end if;
  insert into prov values ('tax', v_id);
  -- En klar import ändras inte, och raderna tas inte bort.
  begin
    delete from tax_tables where import_id = v_id;
    raise exception 'Raderna i en klar import kunde tas bort';
  exception when feature_not_supported then null;
  end;
end $$;

do $$
declare
  v_id uuid;
  v_res jsonb;
begin
  if tax_table_lookup((select v from prov where k = 'tax'), 33, 1, 31_950) <> 6450 then
    raise exception 'Uppslaget i den importerade tabellen stämmer inte';
  end if;
  -- En vektor som inte stämmer mot raderna: finish tar bort importen och säger varför.
  v_id := tax_tables_import_begin(
    jsonb_set(jsonb_set((select record from prov_tax), '{sha256}', to_jsonb(repeat('b', 64))), '{golden,0,vector,taxKr}', '6001'));
  perform tax_tables_import_rows(v_id, (select rows from prov_tax));
  v_res := tax_tables_import_finish(v_id);
  if (v_res->>'ok')::boolean or v_res->'problems'->>0 not like 'tabell 33 kolumn 1 30100 kr ger 6000 kr, väntade 6001 kr' then
    raise exception 'Finish godtog en fel vektor: %', v_res;
  end if;
  if exists (select 1 from tax_table_imports where id = v_id) or exists (select 1 from tax_tables where import_id = v_id) then
    raise exception 'Den stoppade importen lämnade rader kvar';
  end if;
  -- I ett anrop är samma sak ett fel.
  begin
    perform tax_tables_import(
      jsonb_set(jsonb_set((select record from prov_tax), '{sha256}', to_jsonb(repeat('b', 64))), '{golden,0,vector,taxKr}', '6001'),
      (select rows from prov_tax));
    raise exception 'En fel kontrollvektor gick igenom';
  exception when invalid_parameter_value then null;
  end;
  -- Färre än tio vektorer stoppar redan i början.
  begin
    perform tax_tables_import_begin(jsonb_set((select record from prov_tax), '{golden}', '[]'));
    raise exception 'En import utan vektorer gick igenom';
  exception when invalid_parameter_value then null;
  end;
  -- En avbruten import (ingen finish) syns inte för någon inloggad.
  v_id := tax_tables_import_begin(jsonb_set((select record from prov_tax), '{sha256}', to_jsonb(repeat('c', 64))));
  perform tax_tables_import_rows(v_id, (select rows from prov_tax));
  insert into prov values ('tax_halv', v_id);
end $$;

-- ---------------------------------------------------------------- organisationerna

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a1","role":"authenticated","email":"a-agare@prov39.se"}';
insert into prov values ('a', create_organization('Prov A AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039b1","role":"authenticated","email":"b-agare@prov39.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));

reset role;
insert into memberships (org_id, user_id, role) values
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000039a2', 'accountant'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000039a3', 'staff'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000039a5', 'admin');

do $$
begin
  if (select count(*) from pay_items where org_id = (select v from prov where k = 'a')) <> 37 then
    raise exception 'Löneartsregistret såddes inte: % arter', (select count(*) from pay_items where org_id = (select v from prov where k = 'a'));
  end if;
  if not exists (select 1 from number_series where org_id = (select v from prov where k = 'a') and series = 'L') then
    raise exception 'Serien L saknas för en ny organisation';
  end if;
  if exists (select 1 from organizations o where not exists (select 1 from number_series s where s.org_id = o.id and s.series = 'L')) then
    raise exception 'En befintlig organisation fick inte serien L';
  end if;
  if not exists (select 1 from payroll_settings where org_id = (select v from prov where k = 'a')) then
    raise exception 'Lönebesluten såddes inte';
  end if;
end $$;

-- ---------------------------------------------------------------- A1: personal och tid

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a1","role":"authenticated","email":"a-agare@prov39.se"}';

insert into prov values
  ('erik',   hr_create_employee((select v from prov where k = 'a'), '{"name":"Erik Eriksson","email":"erik@prov39.se"}', '199206301234', '8327', '9 123 456 789')),
  ('fatima', hr_create_employee((select v from prov where k = 'a'), '{"name":"Fatima Falk"}', null, '6000', '123 456 789'));
insert into employments (org_id, employee_id, form, pay_form, monthly_salary_ore, weekly_hours, starts_on, valid_from, vacation_rule) values
  ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'tillsvidare', 'monthly', 3200000, 40, '2025-01-01', '2025-01-01', 'sammalon');
insert into employments (org_id, employee_id, form, pay_form, hourly_rate_ore, starts_on, valid_from, vacation_rule, vacation_percent) values
  ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), 'tillsvidare', 'hourly', 18000, '2026-01-01', '2026-01-01', 'procent', 12);

-- En rad för Fatima i oktober som inte är godkänd ännu.
with x as (
  insert into time_entries (org_id, employee_id, work_date, start_time, end_time, hours)
  values ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), '2026-10-12', '07:00', '17:00', 0)
  returning id
)
insert into prov select 'tid', id from x;

reset role;
insert into memberships (org_id, user_id, role) values ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000039a4', 'employee');

-- ---------------------------------------------------------------- A2 (konsulten) räknar november

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a2","role":"authenticated","email":"a-konsult@prov39.se"}';

insert into prov values ('nov', payroll_run_create((select v from prov where k = 'a'), '2026-11-10', '2026-11-25'));

create temp table prov_result on commit drop as
select jsonb_build_object(
  'ruleSetValidFrom', '2026-04-01', 'taxTableImportId', (select v from prov where k = 'tax'),
  'checks', jsonb_build_array(jsonb_build_object('code', 'settings', 'level', 'warn', 'text', 'Lönedagen är inte bekräftad')),
  'payslips', jsonb_build_array(
    jsonb_build_object('employeeId', (select v from prov where k = 'erik'), 'vacationLiabilityOre', 4104000, 'pensionPremiumOre', 0,
      'document', pg_temp.prov_doc((select v from prov where k = 'erik'), 'Erik Eriksson', '1010', '7210', 3200000, 645000, 1005440, repeat('a', 64), '2026-11-01', '2026-11-25')),
    jsonb_build_object('employeeId', (select v from prov where k = 'fatima'), 'vacationLiabilityOre', 0, 'pensionPremiumOre', 0,
      'document', pg_temp.prov_doc((select v from prov where k = 'fatima'), 'Fatima Falk', '1100', '7010', 1800000, 540000, 565560, null, '2026-11-01', '2026-11-25')))) as res;
grant select on prov_result to authenticated;

do $$
declare
  r pay_runs;
begin
  select * into r from pay_runs where id = (select v from prov where k = 'nov');
  if r.time_period_start <> '2026-10-01' or r.time_period_end <> '2026-10-31' or r.agi_period <> '2026-11' then
    raise exception 'Perioderna blev fel: tid % – %, AGI %', r.time_period_start, r.time_period_end, r.agi_period;
  end if;
  -- Regel 3: ej godkänd tid stoppar och personen nämns.
  begin
    perform payroll_run_store_result((select v from prov where k = 'nov'), (select res from prov_result));
    raise exception 'Ej godkänd tid stoppade inte körningen';
  exception when invalid_parameter_value then
    if sqlerrm not like '%Fatima Falk (1 rad)%' then raise exception 'Fel meddelande om tiden: %', sqlerrm; end if;
  end;
  -- En blockerande punkt på kontrollistan stoppar.
  begin
    perform payroll_run_store_result((select v from prov where k = 'nov'),
      jsonb_set((select res from prov_result), '{checks}', '[{"code":"tax","level":"block","text":"Skatteuppgift saknas"}]'));
    raise exception 'En blockerande kontroll stoppade inte';
  exception when invalid_parameter_value then null;
  end;
  -- Två körningar för samma månad går inte.
  begin
    perform payroll_run_create((select v from prov where k = 'a'), '2026-11-01', '2026-11-25');
    raise exception 'Två körningar för november';
  exception when unique_violation then null;
  end;
end $$;

-- Ägaren godkänner tiden.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a1","role":"authenticated","email":"a-agare@prov39.se"}';
select time_submit(array[(select v from prov where k = 'tid')]);
select time_approve(array[(select v from prov where k = 'tid')]);

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a2","role":"authenticated","email":"a-konsult@prov39.se"}';
do $$
declare
  v_bad jsonb;
begin
  -- Summorna kontrolleras: en nettolön som inte stämmer vägras.
  v_bad := jsonb_set((select res from prov_result), '{payslips,0,document,totals,netOre}', '2555001');
  begin
    perform payroll_run_store_result((select v from prov where k = 'nov'), v_bad);
    raise exception 'En nettolön som inte stämmer gick in';
  exception when check_violation then null;
  end;
  -- En annan skattetabell än körningens vägras.
  v_bad := jsonb_set((select res from prov_result), '{payslips,0,document,taxTableVersion}', to_jsonb(repeat('c', 64)));
  begin
    perform payroll_run_store_result((select v from prov where k = 'nov'), v_bad);
    raise exception 'Fel skattetabell gick in';
  exception when invalid_parameter_value then null;
  end;
  if payroll_run_store_result((select v from prov where k = 'nov'), (select res from prov_result)) <> 2 then
    raise exception 'Körningen lagrade inte två lönebesked';
  end if;
  if (select status from pay_runs where id = (select v from prov where k = 'nov')) <> 'calculated'
     or (select (totals->>'netOre')::bigint from pay_runs where id = (select v from prov where k = 'nov')) <> 3815000 then
    raise exception 'Körningen blev inte beräknad med summan 38 150 kr';
  end if;
  if (select count(*) from payslip_lines where run_id = (select v from prov where k = 'nov')) <> 2 then
    raise exception 'Raderna lagrades inte';
  end if;
  -- Konsulten godkänner inte.
  begin
    perform payroll_run_approve((select v from prov where k = 'nov'));
    raise exception 'Redovisningskonsulten kunde godkänna';
  exception when insufficient_privilege then null;
  end;
  -- Ingen direkt skrivning i körningarna.
  begin
    update pay_runs set status = 'approved' where id = (select v from prov where k = 'nov');
    raise exception 'Körningen kunde ändras direkt';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- fyra ögon

-- Ägaren räknar om; då är det ägaren som inte får godkänna.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a1","role":"authenticated","email":"a-agare@prov39.se"}';
select payroll_run_store_result((select v from prov where k = 'nov'), (select res from prov_result));
do $$
begin
  if (select computed_by from pay_runs where id = (select v from prov where k = 'nov')) <> '00000000-0000-4000-8000-0000000039a1' then
    raise exception 'computed_by är inte den som räknade';
  end if;
  begin
    perform payroll_run_approve((select v from prov where k = 'nov'));
    raise exception 'Samma person räknade och godkände';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Underlaget ändras efter beräkningen: ägaren godkänner en ny tidrad i
-- oktober. Godkännandet vägras tills lönen räknas om.
with x as (
  insert into time_entries (org_id, employee_id, work_date, start_time, end_time, hours)
  values ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), '2026-10-13', '07:00', '12:00', 0)
  returning id
)
insert into prov select 'tid2', id from x;
select time_submit(array[(select v from prov where k = 'tid2')]);
select time_approve(array[(select v from prov where k = 'tid2')]);
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a5","role":"authenticated","email":"a-admin@prov39.se"}';
do $$
begin
  begin
    perform payroll_run_approve((select v from prov where k = 'nov'));
    raise exception 'Godkännandet gick igenom fast underlaget ändrats efter beräkningen';
  exception when invalid_parameter_value then
    if sqlerrm not like 'Underlaget har ändrats efter beräkningen%' then raise exception 'Fel meddelande: %', sqlerrm; end if;
  end;
  if exists (select 1 from time_locks where org_id = (select v from prov where k = 'a')) then
    raise exception 'Tiden låstes fast godkännandet vägrades';
  end if;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a1","role":"authenticated","email":"a-agare@prov39.se"}';
select payroll_run_store_result((select v from prov where k = 'nov'), (select res from prov_result));

-- Den anställde ser inget före godkännandet.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a4","role":"authenticated","email":"erik@prov39.se"}';
do $$
begin
  if (select count(*) from payslips) <> 0 then raise exception 'Erik ser ett lönebesked som inte är godkänt'; end if;
end $$;

-- Admin godkänner.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a5","role":"authenticated","email":"a-admin@prov39.se"}';
do $$
begin
  if payroll_run_approve((select v from prov where k = 'nov')) <> 2 then raise exception 'Godkännandet gav inte två lönebesked'; end if;
  -- Godkännandet låste tidsperioden, så de frysta lönebeskeden och tiden stämmer.
  if not exists (select 1 from time_locks where org_id = (select v from prov where k = 'a') and period_start = '2026-10-01' and period_end = '2026-10-31')
     or (select status from time_entries where id = (select v from prov where k = 'tid2')) <> 'locked' then
    raise exception 'Godkännandet låste inte oktober';
  end if;
  -- Numrerat i namnordning: Erik L1, Fatima L2.
  if (select number from payslips where employee_id = (select v from prov where k = 'erik')) <> 1
     or (select number from payslips where employee_id = (select v from prov where k = 'fatima')) <> 2 then
    raise exception 'Serien L numrerade fel';
  end if;
  if (select approved_by from pay_runs where id = (select v from prov where k = 'nov')) <> '00000000-0000-4000-8000-0000000039a5' then
    raise exception 'approved_by sattes inte';
  end if;
  -- Ett godkänt lönebesked ändras inte, ens av den som får skriva PDF:en.
  begin
    perform payroll_run_store_result((select v from prov where k = 'nov'), (select res from prov_result));
    raise exception 'En godkänd körning räknades om';
  exception when feature_not_supported then null;
  end;
  -- PDF:en fästs en gång, på rätt sökväg.
  begin
    perform payslip_attach_pdf((select id from payslips where employee_id = (select v from prov where k = 'erik')), 'fel/sokvag.pdf', repeat('d', 64), 100);
    raise exception 'Fel sökväg för PDF:en gick in';
  exception when invalid_parameter_value then null;
  end;
  perform payslip_attach_pdf(p.id, p.org_id || '/' || p.employee_id || '/payslip-' || p.id || '.pdf', repeat('d', 64), 100)
     from payslips p where p.employee_id = (select v from prov where k = 'erik');
  begin
    perform payslip_attach_pdf(p.id, p.org_id || '/' || p.employee_id || '/payslip-' || p.id || '.pdf', repeat('e', 64), 100)
       from payslips p where p.employee_id = (select v from prov where k = 'erik');
    raise exception 'PDF:en kunde bytas';
  exception when feature_not_supported then null;
  end;
end $$;

reset role;
do $$
begin
  -- Triggern håller även för den som äger tabellen.
  begin
    update payslips set net_ore = net_ore + 100 where employee_id = (select v from prov where k = 'erik');
    raise exception 'Ett godkänt lönebesked kunde ändras';
  exception when feature_not_supported then null;
  end;
  begin
    delete from payslip_lines where employee_id = (select v from prov where k = 'erik');
    raise exception 'Raderna på ett godkänt lönebesked kunde tas bort';
  exception when feature_not_supported then null;
  end;
  begin
    delete from payslips where employee_id = (select v from prov where k = 'erik');
    raise exception 'Ett godkänt lönebesked kunde tas bort';
  exception when feature_not_supported then null;
  end;
end $$;

-- ---------------------------------------------------------------- vem ser vad

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a4","role":"authenticated","email":"erik@prov39.se"}';
do $$
begin
  if (select count(*) from payslips) <> 1 or (select employee_id from payslips) <> (select v from prov where k = 'erik') then
    raise exception 'Erik ser inte bara sitt eget lönebesked';
  end if;
  if (select count(*) from payslip_lines) <> 1 then raise exception 'Erik ser andras rader'; end if;
  if exists (select 1 from tax_table_imports where id = (select v from prov where k = 'tax_halv'))
     or exists (select 1 from tax_tables where import_id = (select v from prov where k = 'tax_halv')) then
    raise exception 'En halvfärdig import av skattetabeller syns';
  end if;
  if (select count(*) from pay_runs) + (select count(*) from bank_files) + (select count(*) from payroll_corrections)
     + (select count(*) from pay_items) + (select count(*) from payroll_settings) <> 0 then
    raise exception 'Erik ser körningar, bankfiler, rättelser, lönearter eller beslut';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a3","role":"authenticated","email":"a-personal@prov39.se"}';
do $$
begin
  if (select count(*) from payslips) + (select count(*) from payslip_lines) + (select count(*) from pay_runs)
     + (select count(*) from pay_items) + (select count(*) from payroll_settings) <> 0 then
    raise exception 'Personal (staff) ser löner';
  end if;
  if exists (select 1 from events where aggregate_type in ('payroll', 'employee')) then
    raise exception 'Personal ser lönens händelser';
  end if;
  begin
    perform payroll_run_create((select v from prov where k = 'a'), '2027-01-01', '2027-01-25');
    raise exception 'Personal kunde skapa en körning';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039b1","role":"authenticated","email":"b-agare@prov39.se"}';
do $$
begin
  if (select count(*) from pay_runs) + (select count(*) from payslips) + (select count(*) from payslip_lines)
     + (select count(*) from bank_files) <> 0 then
    raise exception 'B ser A:s löner';
  end if;
  if (select count(*) from pay_items where org_id = (select v from prov where k = 'a')) <> 0 then
    raise exception 'B ser A:s löneartsregister';
  end if;
  begin
    perform payroll_run_create((select v from prov where k = 'a'), '2027-01-01', '2027-01-25');
    raise exception 'B kunde skapa en körning i A';
  exception when insufficient_privilege then null;
  end;
  begin
    perform payroll_run_approve((select v from prov where k = 'nov'));
    raise exception 'B kunde godkänna A:s körning';
  exception when insufficient_privilege then null;
  end;
  begin
    perform payroll_reconciliation((select v from prov where k = 'nov'));
    raise exception 'B kunde läsa A:s avstämning';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- bankfil, bokföring, avstämning

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a5","role":"authenticated","email":"a-admin@prov39.se"}';
do $$
begin
  -- Bokföring före bankfilen går inte.
  begin
    perform payroll_run_book((select v from prov where k = 'nov'), '[]');
    raise exception 'Körningen bokfördes före bankfilen';
  exception when feature_not_supported then null;
  end;
  -- En bankfil vars summa inte är nettolönerna vägras.
  begin
    perform payroll_bank_file_store((select v from prov where k = 'nov'), pg_temp.prov_xml('38150.01', 2, array['25550.01', '12600.00']), 'PROV', '2026-11-25');
    raise exception 'En bankfil med fel summa gick in';
  exception when check_violation then null;
  end;
  perform payroll_bank_file_store((select v from prov where k = 'nov'), pg_temp.prov_xml('38150.00', 2, array['25550.00', '12600.00']), 'PROV', '2026-11-25');
  if (select status from pay_runs where id = (select v from prov where k = 'nov')) <> 'paid' then
    raise exception 'Körningen blev inte betald efter bankfilen';
  end if;
  -- Periodiseringar som rör nettolönen vägras.
  begin
    perform payroll_run_book((select v from prov where k = 'nov'), '[{"account":"2820","debitOre":100,"creditOre":0},{"account":"2920","debitOre":0,"creditOre":100}]');
    raise exception 'En periodisering mot löneskulden gick in';
  exception when check_violation then null;
  end;
  -- En låst bokföringsperiod vägras av journal_entries_check_lock.
  begin
    insert into period_locks (org_id, period_start, period_end, locked_by)
      values ((select v from prov where k = 'a'), '2026-11-01', '2026-11-30', 'prov');
    perform payroll_run_book((select v from prov where k = 'nov'), '[]');
    raise exception 'Lönen bokfördes i en låst period';
  exception when feature_not_supported then null;
  end;
  perform payroll_run_book((select v from prov where k = 'nov'),
    '[{"account":"7090","debitOre":4104000,"creditOre":0,"text":"Semesterlöneskuld"},{"account":"2920","debitOre":0,"creditOre":4104000,"text":"Semesterlöneskuld"}]');
end $$;

reset role;
do $$
declare
  v_entry uuid := (select journal_entry_id from pay_runs where id = (select v from prov where k = 'nov'));
  c record;
begin
  if (select series || entry_date from journal_entries where id = v_entry) <> 'V2026-11-25' then
    raise exception 'Verifikationen ligger inte i serien V på lönedagen';
  end if;
  if (select sum(debit_ore) from journal_lines where entry_id = v_entry) <> (select sum(credit_ore) from journal_lines where entry_id = v_entry)
     or (select debit_ore from journal_lines where entry_id = v_entry and account = '7210') <> 3200000
     or (select debit_ore from journal_lines where entry_id = v_entry and account = '7010') <> 1800000
     or (select credit_ore from journal_lines where entry_id = v_entry and account = '2710') <> 1185000
     or (select credit_ore from journal_lines where entry_id = v_entry and account = '2820') <> 3815000
     or (select debit_ore from journal_lines where entry_id = v_entry and account = '7510') <> 1571000
     or (select credit_ore from journal_lines where entry_id = v_entry and account = '2731') <> 1571000 then
    raise exception 'Verifikationens rader stämmer inte';
  end if;
  if not exists (select 1 from time_locks where org_id = (select v from prov where k = 'a') and period_start = '2026-10-01' and period_end = '2026-10-31') then
    raise exception 'Tidsperioden är inte låst efter bokföringen';
  end if;
  if (select status from time_entries where id = (select v from prov where k = 'tid')) <> 'locked' then
    raise exception 'Oktobers tid är inte låst';
  end if;
  select * into c from payroll_reconciliation((select v from prov where k = 'nov'));
  if not c.ok or c.payslips_ore <> 3815000 or c.lines_ore <> 3815000 or c.journal_ore <> 3815000 or c.bank_ore <> 3815000 then
    raise exception 'Avstämningen går inte ihop: %', row_to_json(c);
  end if;
  -- Stängningen vägrar när summorna inte går ihop: en extra rad på
  -- löneskulden (rullas tillbaka med blocket).
  begin
    insert into journal_lines (org_id, entry_id, account, debit_ore, credit_ore, text) values
      ((select v from prov where k = 'a'), v_entry, '2820', 100, 0, 'Prov'),
      ((select v from prov where k = 'a'), v_entry, '1930', 0, 100, 'Prov');
    perform payroll_run_close((select v from prov where k = 'nov'));
    raise exception 'Körningen stängdes fast summorna inte gick ihop';
  exception when check_violation then null;
  end;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a2","role":"authenticated","email":"a-konsult@prov39.se"}';
do $$
begin
  -- Konsulten läser avstämningen men stänger inte.
  if not (select ok from payroll_reconciliation((select v from prov where k = 'nov'))) then
    raise exception 'Konsulten ser inte avstämningen';
  end if;
  begin
    perform payroll_run_close((select v from prov where k = 'nov'));
    raise exception 'Konsulten kunde stänga körningen';
  exception when insufficient_privilege then null;
  end;
  if (select count(*) from bank_files) <> 0 then raise exception 'Konsulten ser bankfilen med kontonumren'; end if;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a5","role":"authenticated","email":"a-admin@prov39.se"}';
select payroll_run_close((select v from prov where k = 'nov'));

-- ---------------------------------------------------------------- rättelse framåt, december

do $$
declare
  v_id uuid;
begin
  if (select status from pay_runs where id = (select v from prov where k = 'nov')) <> 'closed' then
    raise exception 'Körningen stängdes inte';
  end if;
  begin
    perform payroll_correction_add((select id from payslips where employee_id = (select v from prov where k = 'erik')),
      '[{"code":"9999","text":"Fel","amountOre":100}]', 'Fel löneart');
    raise exception 'En rättelse med en okänd löneart gick in';
  exception when invalid_parameter_value then null;
  end;
  v_id := payroll_correction_add((select id from payslips where employee_id = (select v from prov where k = 'erik')),
    '[{"code":"1710","text":"Retroaktiv lön november","quantity":null,"unit":null,"unitPriceOre":null,"basisOre":null,"ratePercent":null,"amountOre":120000}]',
    'Lönehöjningen från 1 november kom inte med');
  insert into prov values ('rattelse', v_id);
  if (select agi_period from payroll_corrections where id = v_id) <> '2026-11' or not (select agi_refile from payroll_corrections where id = v_id) then
    raise exception 'Rättelsen pekar inte på novembers AGI';
  end if;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a2","role":"authenticated","email":"a-konsult@prov39.se"}';
insert into prov values ('dec', payroll_run_create((select v from prov where k = 'a'), '2026-12-01', '2026-12-23'));
select payroll_run_store_result((select v from prov where k = 'dec'), jsonb_build_object(
  'ruleSetValidFrom', '2026-04-01', 'taxTableImportId', (select v from prov where k = 'tax'), 'checks', '[]'::jsonb,
  'payslips', jsonb_build_array(jsonb_build_object('employeeId', (select v from prov where k = 'erik'),
    'correctionIds', jsonb_build_array((select v from prov where k = 'rattelse')),
    'document', pg_temp.prov_doc((select v from prov where k = 'erik'), 'Erik Eriksson', '1010', '7210', 3200000, 645000, 1005440, repeat('a', 64), '2026-12-01', '2026-12-23')))));

-- En godkännarlista i lönebesluten: bara de på listan godkänner.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000039a1","role":"authenticated","email":"a-agare@prov39.se"}';
update payroll_settings set data = jsonb_build_object('approvers', jsonb_build_array('00000000-0000-4000-8000-0000000039a5'))
 where org_id = (select v from prov where k = 'a');
do $$
begin
  if (select target_run_id from payroll_corrections where id = (select v from prov where k = 'rattelse')) <> (select v from prov where k = 'dec') then
    raise exception 'Rättelsen kopplades inte till decemberkörningen';
  end if;
  begin
    perform payroll_run_approve((select v from prov where k = 'dec'));
    raise exception 'Någon utanför godkännarlistan godkände';
  exception when insufficient_privilege then null;
  end;
end $$;
update payroll_settings set data = '{}' where org_id = (select v from prov where k = 'a');
select payroll_run_approve((select v from prov where k = 'dec'));

reset role;
do $$
begin
  -- Serien L är obruten: 1, 2, 3.
  if (select array_agg(number order by number) from payslips where org_id = (select v from prov where k = 'a')) <> array[1, 2, 3] then
    raise exception 'Serien L har en lucka: %', (select array_agg(number order by number) from payslips where org_id = (select v from prov where k = 'a'));
  end if;
  -- Rättelsen sitter fast i den godkända körningen och tas inte bort.
  begin
    update payroll_corrections set target_run_id = null where id = (select v from prov where k = 'rattelse');
    raise exception 'Rättelsen kunde flyttas från en godkänd körning';
  exception when feature_not_supported then null;
  end;
  begin
    delete from payroll_corrections where id = (select v from prov where k = 'rattelse');
    raise exception 'Rättelsen kunde tas bort';
  exception when feature_not_supported then null;
  end;
  -- Löneartsregistret är versionerat, aldrig ändrat.
  begin
    update pay_items set account = '7010' where org_id = (select v from prov where k = 'a') and code = '1010';
    raise exception 'En löneart kunde ändras';
  exception when feature_not_supported then null;
  end;
  insert into pay_items (org_id, code, name, kind, taxable, tax_mode, subject_to_employer_contribution, vacation_pay_basis,
                         pension_reportable, agi_box, account, counter_account)
  values ((select v from prov where k = 'a'), '1010', 'Månadslön', 'salary', true, 'table', true, true, true, '011', '7220', '2820');
  if (select max(version) from pay_items where org_id = (select v from prov where k = 'a') and code = '1010') <> 2 then
    raise exception 'En ny löneart blev inte version 2';
  end if;
  if (select count(*) from events where aggregate_type = 'payroll' and org_id = (select v from prov where k = 'a')) < 8 then
    raise exception 'Körningarna loggades inte';
  end if;
  if (select count(*) from events where type = 'payslip.approved' and aggregate_id = (select v from prov where k = 'erik')) <> 2 then
    raise exception 'Eriks lönebesked loggades inte i hans historik';
  end if;
end $$;

do $$ begin raise notice 'Prov 0039: alla gick igenom'; end $$;

rollback;
