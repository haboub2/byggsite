-- RLS- och funktionsprov för 0042 (förmåner, utlägg, Collectum, ägarnas
-- planerare; docs/hr-lon.md fas 5). Körs i Supabase SQL-editor efter 0042,
-- eller lokalt med supabase/tests/local/run.sh. Allt sker i en transaktion
-- som rullas tillbaka; "Prov 0042: alla gick igenom" betyder att allt höll.
--
--   A1  owner i A              A2  redovisningskonsult i A
--   A3  personal (staff) i A   A4  anställd, är Erik
--   A5  admin i A (godkänner det konsulten räknat)
--   B1  owner i B
--
-- Erik (ITP1) lämnar en milersättning på 60 mil med egen bil och ett utlägg
-- med kvitto; admin godkänner milersättningen som 1 500 kr skattefritt och
-- 300 kr skattepliktigt (företaget betalar 30 kr/mil). Erik har bilförmån
-- 4 000 kr i månaden. November körs: Erik månadslön 30 000 kr, bilförmån,
-- milersättningen; Fatima (SAF-LO) timlön 20 000 kr. Godkännandet betalar
-- milersättningen; Collectum-underlaget är Eriks 30 000 kr och inget annat.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000042a1', 'a-agare@prov42.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000042a2', 'a-konsult@prov42.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000042a3', 'a-personal@prov42.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000042a4', 'erik@prov42.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000042a5', 'a-admin@prov42.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000042b1', 'b-agare@prov42.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

create function pg_temp.som(p_user text) returns void
  language sql
as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-4000-8000-0000000042' || p_user, 'role', 'authenticated', 'email', p_user || '@prov42.se')::text, true)
$$;
grant execute on function pg_temp.som(text) to authenticated;

-- En rad i ett lönebesked, med källa (utlägg eller förmån) när den finns.
create function pg_temp.rad(p_code text, p_kind text, p_box text, p_account text, p_counter text, p_amount bigint, p_taxable boolean,
                            p_source jsonb default null) returns jsonb
  language sql
as $$
  select jsonb_build_object('code', p_code, 'text', p_code, 'amountOre', p_amount,
    'item', jsonb_build_object('code', p_code, 'name', p_code, 'kind', p_kind, 'version', 1,
      'flags', jsonb_build_object('account', p_account, 'counterAccount', p_counter, 'agiBox', p_box, 'taxable', p_taxable)))
    || case when p_source is null then '{}'::jsonb else jsonb_build_object('source', p_source) end
$$;
grant execute on function pg_temp.rad(text, text, text, text, text, bigint, boolean, jsonb) to authenticated;

create function pg_temp.doc(p_emp uuid, p_name text, p_birth int, p_lines jsonb, p_tax bigint, p_contrib bigint, p_scheme text) returns jsonb
  language sql
as $$
  select jsonb_build_object(
    'schema', 1, 'employeeId', p_emp, 'employeeName', p_name, 'birthYear', p_birth,
    'periodStart', '2026-11-01', 'periodEnd', '2026-11-30', 'payDate', '2026-11-25', 'ruleSetValidFrom', '2026-04-01', 'taxTableVersion', null,
    'lines', p_lines,
    'contributions', jsonb_build_object('category', 'full', 'baseOre', 0, 'ratePercent', 31.42, 'amountOre', p_contrib),
    'context', jsonb_build_object('pension', jsonb_build_object('scheme', p_scheme, 'premiumOre', 0)),
    'totals', jsonb_build_object(
      'cashGrossOre', (select coalesce(sum((l->>'amountOre')::bigint), 0) from jsonb_array_elements(p_lines) l
                        where (l->'item'->'flags'->>'taxable')::boolean and l->'item'->>'kind' <> 'benefit'),
      'taxFreeReimbursementOre', (select coalesce(sum((l->>'amountOre')::bigint), 0) from jsonb_array_elements(p_lines) l
                                   where not (l->'item'->'flags'->>'taxable')::boolean),
      'benefitOre', (select coalesce(sum((l->>'amountOre')::bigint), 0) from jsonb_array_elements(p_lines) l where l->'item'->>'kind' = 'benefit'),
      'taxOre', p_tax, 'netAdjustmentOre', 0,
      'netOre', (select coalesce(sum((l->>'amountOre')::bigint), 0) from jsonb_array_elements(p_lines) l where l->'item'->>'kind' <> 'benefit') - p_tax,
      'employerContributionOre', p_contrib, 'sickPayCostOre', 0))
$$;
grant execute on function pg_temp.doc(uuid, text, int, jsonb, bigint, bigint, text) to authenticated;

-- Novembers resultat: Erik med bilförmånen och milersättningen (källorna), Fatima.
create function pg_temp.resultat(p_mileage_taxfree bigint) returns jsonb
  language sql
as $$
  select jsonb_build_object('ruleSetValidFrom', '2026-04-01', 'taxTableImportId', null, 'checks', '[]'::jsonb,
    'payslips', jsonb_build_array(
      jsonb_build_object('employeeId', (select v from prov where k = 'erik'), 'document', pg_temp.doc((select v from prov where k = 'erik'), 'Erik Eriksson', 1990,
        jsonb_build_array(
          pg_temp.rad('1010', 'salary', '011', '7210', '2820', 3000000, true),
          pg_temp.rad('1800', 'benefit', '013', '7385', '7399', 400000, true, jsonb_build_object('kind', 'benefit', 'id', (select v from prov where k = 'bil'))),
          pg_temp.rad('1910', 'mileage', '050', '7331', '2820', p_mileage_taxfree, false, jsonb_build_object('kind', 'expense_claim', 'id', (select v from prov where k = 'mil'))),
          pg_temp.rad('1911', 'mileage', '011', '7332', '2820', 30000, true, jsonb_build_object('kind', 'expense_claim', 'id', (select v from prov where k = 'mil')))),
        900000, 1069000, 'itp1')),
      jsonb_build_object('employeeId', (select v from prov where k = 'fatima'), 'document', pg_temp.doc((select v from prov where k = 'fatima'), 'Fatima Falk', 1985,
        jsonb_build_array(pg_temp.rad('1100', 'hourly', '011', '7010', '2820', 2000000, true)), 400000, 628400, 'saf-lo'))))
$$;
grant execute on function pg_temp.resultat(bigint) to authenticated;

-- ---------------------------------------------------------------- organisationerna och personerna

set local role authenticated;
select pg_temp.som('a1');
insert into prov values ('a', create_organization('Prov A AB', ''));
select pg_temp.som('b1');
insert into prov values ('b', create_organization('Prov B AB', ''));

reset role;
insert into memberships (org_id, user_id, role) values
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000042a2', 'accountant'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000042a3', 'staff'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000042a5', 'admin');

set local role authenticated;
select pg_temp.som('a1');
insert into prov values
  ('erik',   hr_create_employee((select v from prov where k = 'a'), '{"name":"Erik Eriksson","email":"erik@prov42.se"}', '199006301234', '8327', '9 123 456 789')),
  ('fatima', hr_create_employee((select v from prov where k = 'a'), '{"name":"Fatima Falk"}', null, '6000', '123 456 789')),
  ('olle',   hr_create_employee((select v from prov where k = 'a'), '{"name":"Olle Ägare","isOwner":true}', null, '6000', '123 456 780'));
insert into employments (org_id, employee_id, form, pay_form, monthly_salary_ore, weekly_hours, starts_on, valid_from, vacation_rule, pension_scheme) values
  ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'tillsvidare', 'monthly', 3000000, 40, '2025-03-01', '2025-03-01', 'sammalon', 'itp1');

reset role;
insert into memberships (org_id, user_id, role) values ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000042a4', 'employee');

-- ---------------------------------------------------------------- förmånen

set local role authenticated;
select pg_temp.som('a1');
with x as (
insert into benefits (org_id, employee_id, kind, valid_from, registration_number, car_model, first_registered_on, model_year, fuel,
                      new_car_price_ore, monthly_value_ore, rule_version)
values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'bil', '2026-01-01', 'ABC123', 'Volvo V60',
        '2025-03-01', 2025, 'diesel', 45000000, 400000, '2026-04-01/benefits-1')
returning id)
insert into prov select 'bil', id from x;

-- Konsulten läser men skriver inte förmåner; den anställde läser sin egen.
select pg_temp.som('a2');
do $$
begin
  if (select count(*) from benefits) <> 1 then raise exception 'Konsulten ser inte förmånen'; end if;
  begin
    insert into benefits (org_id, employee_id, kind, valid_from, monthly_value_ore, rule_version)
    values ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), 'annan', '2026-01-01', 10000, 'x');
    raise exception 'Konsulten kunde lägga in en förmån';
  exception when insufficient_privilege then null;
  end;
end $$;
select pg_temp.som('a4');
do $$
begin
  if (select count(*) from benefits where employee_id = (select v from prov where k = 'erik')) <> 1 then raise exception 'Erik ser inte sin förmån'; end if;
end $$;

-- ---------------------------------------------------------------- Erik lämnar utlägg

select pg_temp.som('a4');
with x as (
insert into expense_claims (org_id, employee_id, kind, date_from, date_to, description, distance_km, car_type, tax_free_ore, taxable_ore)
values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'milersattning', '2026-10-12', '2026-10-12',
        'Göteborg–Borås–Göteborg, platsbesök', 600, 'egen', 150000, 30000)
returning id)
insert into prov select 'mil', id from x;
with x as (
insert into expense_claims (org_id, employee_id, kind, date_from, date_to, description, amount_ore, vat_ore, tax_free_ore)
values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'utlagg', '2026-10-14', '2026-10-14', 'Skruv, Bauhaus', 45000, 9000, 45000)
returning id)
insert into prov select 'utlagg', id from x;

do $$
declare
  v_path text := (select v from prov where k = 'a') || '/' || (select v from prov where k = 'erik') || '/kvitto-' || (select v from prov where k = 'utlagg') || '-1.jpg';
begin
  -- Inte för någon annan.
  begin
    insert into expense_claims (org_id, employee_id, kind, date_from, date_to, amount_ore, tax_free_ore)
    values ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), 'utlagg', '2026-10-14', '2026-10-14', 100, 100);
    raise exception 'Erik kunde lägga ett utlägg åt Fatima';
  exception when insufficient_privilege then null;
  end;
  -- Ett utlägg utan kvitto skickas inte in.
  begin
    perform expense_submit((select v from prov where k = 'utlagg'));
    raise exception 'Ett utlägg utan kvitto gick att skicka in';
  exception when invalid_parameter_value then null;
  end;
  -- Hinken tar bara ett kvitto som utlägget redan listar.
  begin
    insert into storage.objects (bucket_id, name) values ('hr', v_path);
    raise exception 'Ett kvitto som inte är registrerat kunde laddas upp';
  exception when insufficient_privilege then null;
  end;
  perform expense_add_receipt((select v from prov where k = 'utlagg'), v_path, repeat('ab', 32), 1234, 'image/jpeg', 'kvitto.jpg');
  insert into storage.objects (bucket_id, name) values ('hr', v_path);
  begin
    perform expense_add_receipt((select v from prov where k = 'utlagg'),
      (select v from prov where k = 'a') || '/' || (select v from prov where k = 'fatima') || '/kvitto-' || (select v from prov where k = 'utlagg') || '-2.jpg',
      repeat('ab', 32), 1234, 'image/jpeg', 'fel.jpg');
    raise exception 'Ett kvitto i någon annans mapp gick in';
  exception when invalid_parameter_value then null;
  end;
  perform expense_submit((select v from prov where k = 'utlagg'));
  perform expense_submit((select v from prov where k = 'mil'));
  -- Inskickat ändrar den anställde inte (RLS: bara utkast).
  update expense_claims set description = 'ändrad' where id = (select v from prov where k = 'mil');
  if (select description from expense_claims where id = (select v from prov where k = 'mil')) = 'ändrad' then
    raise exception 'Erik kunde ändra ett inskickat utlägg';
  end if;
  -- Den anställde godkänner inte.
  begin
    perform expense_approve((select v from prov where k = 'mil'), 150000, 30000, '{}', 'x');
    raise exception 'Erik kunde godkänna';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Fatimas eget utkast syns inte för Erik.
reset role;
insert into expense_claims (org_id, employee_id, kind, date_from, date_to, amount_ore, tax_free_ore, description)
values ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), 'utlagg', '2026-10-01', '2026-10-01', 5000, 5000, 'Fatimas');
set local role authenticated;
select pg_temp.som('a4');
do $$
begin
  if exists (select 1 from expense_claims where description = 'Fatimas') then raise exception 'Erik ser Fatimas utlägg'; end if;
  if (select count(*) from expense_claims) <> 2 then raise exception 'Erik ser inte sina två utlägg'; end if;
end $$;

-- ---------------------------------------------------------------- godkännandet

select pg_temp.som('a2');
do $$
begin
  if (select count(*) from expense_claims) <> 3 then raise exception 'Konsulten ser inte alla utlägg'; end if;
  begin
    perform expense_approve((select v from prov where k = 'mil'), 150000, 30000, '{}', 'x');
    raise exception 'Konsulten kunde godkänna';
  exception when insufficient_privilege then null;
  end;
end $$;

select pg_temp.som('a5');
do $$
begin
  -- Mer skattefritt än 60 mil × 25 kr vägras; ett utlägg ersätts med kvittots belopp.
  begin
    perform expense_approve((select v from prov where k = 'mil'), 150100, 29900, '{}', 'x');
    raise exception 'För hög skattefri milersättning gick in';
  exception when check_violation then null;
  end;
  begin
    perform expense_approve((select v from prov where k = 'utlagg'), 40000, 5000, '{}', 'x');
    raise exception 'Ett utlägg med skattepliktig del gick in';
  exception when check_violation then null;
  end;
  perform expense_approve((select v from prov where k = 'mil'), 150000, 30000, '{"perMilOre":3000}', '2026-04-01/expenses-1');
  perform expense_approve((select v from prov where k = 'utlagg'), 45000, 0, '{}', '2026-04-01/expenses-1');
  -- Godkänt är fryst: RLS släpper inte igenom ändringen, och status/lönebesked får ingen skriva.
  update expense_claims set description = 'ändrad' where id = (select v from prov where k = 'mil');
  if (select description from expense_claims where id = (select v from prov where k = 'mil')) = 'ändrad' then
    raise exception 'Ett godkänt utlägg ändrades';
  end if;
  begin
    update expense_claims set status = 'paid' where id = (select v from prov where k = 'mil');
    raise exception 'Admin kunde sätta betalt';
  exception when insufficient_privilege then null;
  end;
  begin
    perform expense_reject((select v from prov where k = 'mil'), 'för sent');
    raise exception 'Ett godkänt utlägg kunde avslås';
  exception when feature_not_supported then null;
  end;
end $$;

-- Inte ens tabellens ägare ändrar ett godkänt utlägg (frysningen är en trigger).
reset role;
do $$
begin
  begin
    update expense_claims set taxable_ore = 0 where id = (select v from prov where k = 'mil');
    raise exception 'Ett godkänt utlägg ändrades förbi RLS';
  exception when feature_not_supported then null;
  end;
  begin
    update expense_claims set status = 'paid', paid_at = now() where id = (select v from prov where k = 'mil');
    raise exception 'Ett utlägg blev betalt utan körning';
  exception when feature_not_supported or check_violation then null;
  end;
  begin
    delete from expense_claims where id = (select v from prov where k = 'mil');
    raise exception 'Ett godkänt utlägg togs bort';
  exception when feature_not_supported then null;
  end;
end $$;
set local role authenticated;

-- ---------------------------------------------------------------- november: körningen betalar

select pg_temp.som('a2');
insert into prov values ('nov', payroll_run_create((select v from prov where k = 'a'), '2026-11-01', '2026-11-25'));
do $$
begin
  -- Fel belopp för utlägget vägras redan när resultatet lagras.
  begin
    perform payroll_run_store_result((select v from prov where k = 'nov'), pg_temp.resultat(140000));
    raise exception 'Ett lönebesked med fel belopp för utlägget gick in';
  exception when check_violation then null;
  end;
end $$;
select payroll_run_store_result((select v from prov where k = 'nov'), pg_temp.resultat(150000));
do $$
begin
  if (select status from expense_claims where id = (select v from prov where k = 'mil')) <> 'approved' then
    raise exception 'Utlägget blev betalt redan när lönen räknades';
  end if;
end $$;

-- Ett utlägg som godkänns efter beräkningen ändrar underlaget: godkännandet vägras.
select pg_temp.som('a4');
with x as (
insert into expense_claims (org_id, employee_id, kind, date_from, date_to, amount_ore, tax_free_ore, description)
values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'utlagg', '2026-10-20', '2026-10-20', 2000, 2000, 'Parkering')
returning id)
insert into prov select 'park', id from x;
select expense_add_receipt((select v from prov where k = 'park'),
  (select v from prov where k = 'a') || '/' || (select v from prov where k = 'erik') || '/kvitto-' || (select v from prov where k = 'park') || '-1.pdf',
  repeat('cd', 32), 2000, 'application/pdf', 'p.pdf');
select expense_submit((select v from prov where k = 'park'));
select pg_temp.som('a1');
select expense_approve((select v from prov where k = 'park'), 2000, 0, '{}', '2026-04-01/expenses-1');
select pg_temp.som('a5');
do $$
begin
  perform payroll_run_approve((select v from prov where k = 'nov'));
  raise exception 'Körningen godkändes fast ett utlägg godkänts efter beräkningen';
exception when invalid_parameter_value then
  if sqlerrm not like '%Underlaget har ändrats%' then raise exception 'Fel meddelande: %', sqlerrm; end if;
end $$;
select pg_temp.som('a2');
select payroll_run_store_result((select v from prov where k = 'nov'), pg_temp.resultat(150000));
select pg_temp.som('a5');
select payroll_run_approve((select v from prov where k = 'nov'));

do $$
declare
  c expense_claims;
begin
  select * into c from expense_claims where id = (select v from prov where k = 'mil');
  if c.status <> 'paid' or c.payslip_id is null or c.paid_at is null then raise exception 'Körningen betalade inte milersättningen: %', c.status; end if;
  if (select employee_id from payslips where id = c.payslip_id) <> (select v from prov where k = 'erik') then raise exception 'Fel lönebesked'; end if;
  if (select status from expense_claims where id = (select v from prov where k = 'utlagg')) <> 'approved' then
    raise exception 'Utlägget som inte var med på lönebeskedet blev betalt';
  end if;
  if not exists (select 1 from events where type = 'expense.paid') then raise exception 'Ingen händelse för betalningen'; end if;
end $$;

-- Den betalda förmånen är fryst; ett slutdatum efter november går, före inte.
select pg_temp.som('a1');
do $$
begin
  begin
    update benefits set monthly_value_ore = 1 where id = (select v from prov where k = 'bil');
    raise exception 'En betald förmån ändrades';
  exception when feature_not_supported then null;
  end;
  begin
    update benefits set valid_to = '2026-11-15' where id = (select v from prov where k = 'bil');
    raise exception 'Slutdatum före den betalda månaden gick in';
  exception when invalid_parameter_value then null;
  end;
  begin
    delete from benefits where id = (select v from prov where k = 'bil');
    raise exception 'En betald förmån togs bort';
  exception when feature_not_supported then null;
  end;
  update benefits set valid_to = '2026-12-31' where id = (select v from prov where k = 'bil');
end $$;

-- Bankfil, bokföring, stängning; sedan Collectum.
select payroll_bank_file_store((select v from prov where k = 'nov'),
  '<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn>'
  || '<GrpHdr><MsgId>PROV</MsgId><NbOfTxs>2</NbOfTxs><CtrlSum>38800.00</CtrlSum></GrpHdr><PmtInf>'
  || '<CdtTrfTxInf><Amt><InstdAmt Ccy="SEK">22800.00</InstdAmt></Amt></CdtTrfTxInf><CdtTrfTxInf><Amt><InstdAmt Ccy="SEK">16000.00</InstdAmt></Amt></CdtTrfTxInf>'
  || '</PmtInf></CstmrCdtTrfInitn></Document>', 'PROV', '2026-11-25');
select payroll_run_book((select v from prov where k = 'nov'),
  '[{"account":"7410","debitOre":135000,"creditOre":0,"text":"ITP1"},{"account":"2950","debitOre":0,"creditOre":135000,"text":"ITP1"},'
  '{"account":"7533","debitOre":32751,"creditOre":0,"text":"SLP"},{"account":"2514","debitOre":0,"creditOre":32751,"text":"SLP"}]');
select payroll_run_close((select v from prov where k = 'nov'));

do $$
declare
  c jsonb := collectum_basis((select v from prov where k = 'a'), '2026-11');
begin
  -- Bara Erik (ITP1), bara lönen: inte bilförmånen, inte milersättningen (skattefri eller skattepliktig), inte Fatima (SAF-LO).
  if jsonb_array_length(c) <> 1 or c->0->>'name' <> 'Erik Eriksson' or (c->0->>'payOre')::bigint <> 3000000 then
    raise exception 'Collectum-underlaget blev fel: %', c;
  end if;
  if pension_basis((select v from prov where k = 'a'), '2026-11', 'collectum') <> c then raise exception 'pension_basis tar inte Collectum'; end if;
  if (pension_basis((select v from prov where k = 'a'), '2026-11', 'fora')->0->>'name') <> 'Fatima Falk' then raise exception 'Fora ändrades'; end if;
  -- Kontona för den särskilda löneskatten finns och bokades.
  if not exists (select 1 from journal_lines jl join pay_runs r on r.journal_entry_id = jl.entry_id
                  where r.id = (select v from prov where k = 'nov') and jl.account = '7533' and jl.debit_ore = 32751) then
    raise exception 'Särskild löneskatt bokades inte';
  end if;
end $$;

-- Konsulten lagrar inte; ägaren lagrar Collectum-rapporten (summan i sjätte kolumnen).
select pg_temp.som('a2');
do $$
begin
  perform pension_report_store((select v from prov where k = 'a'), '2026-11', 'collectum', 'x', collectum_basis((select v from prov where k = 'a'), '2026-11'));
  raise exception 'Konsulten kunde lagra Collectum-rapporten';
exception when insufficient_privilege then null;
end $$;
select pg_temp.som('a1');
do $$
declare
  v_id uuid;
  v_lines jsonb := collectum_basis((select v from prov where k = 'a'), '2026-11');
begin
  begin
    perform pension_report_store((select v from prov where k = 'a'), '2026-11', 'collectum',
      E'personnummer;fornamn;efternamn;kundnummer;period;lon\r\n199006301234;Erik;Eriksson;12345;2026-11;29000\r\n', v_lines);
    raise exception 'En fil med fel summa gick in';
  exception when check_violation then null;
  end;
  v_id := pension_report_store((select v from prov where k = 'a'), '2026-11', 'collectum',
    E'personnummer;fornamn;efternamn;kundnummer;period;lon\r\n199006301234;Erik;Eriksson;12345;2026-11;30000\r\n', v_lines);
  if (select format from pension_reports where id = v_id) <> 'collectum-manuell-csv-1' then raise exception 'Fel format'; end if;
  perform pension_report_mark_filed(v_id);
end $$;

-- ---------------------------------------------------------------- planeraren

select pg_temp.som('a1');
do $$
begin
  begin
    insert into owner_planner_snapshots (org_id, employee_id, year, inputs, result, rule_version)
    values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 2026, '{}', '{}', 'x');
    raise exception 'Planeraren sparades för någon som inte är ägare';
  exception when invalid_parameter_value then null;
  end;
  insert into owner_planner_snapshots (org_id, employee_id, year, inputs, result, rule_version)
  values ((select v from prov where k = 'a'), (select v from prov where k = 'olle'), 2026, '{"projectedSalaryOre":60000000}', '{"limitOre":33360000}', '2026-04-01');
end $$;

-- ---------------------------------------------------------------- andra roller och B

select pg_temp.som('a4');
do $$
begin
  if exists (select 1 from owner_planner_snapshots) then raise exception 'Den anställde ser planeraren'; end if;
  if exists (select 1 from benefits where employee_id <> (select v from prov where k = 'erik')) then raise exception 'Erik ser andras förmåner'; end if;
  begin
    perform collectum_basis((select v from prov where k = 'a'), '2026-11');
    raise exception 'Den anställde läste Collectum-underlaget';
  exception when insufficient_privilege then null;
  end;
end $$;

select pg_temp.som('a3');
do $$
begin
  if (select count(*) from benefits) + (select count(*) from expense_claims) + (select count(*) from owner_planner_snapshots) <> 0 then
    raise exception 'Personal (staff) ser förmåner, utlägg eller planeraren';
  end if;
  if exists (select 1 from events where type like 'expense.%' or type like 'benefit.%') then raise exception 'Personal ser händelserna'; end if;
end $$;

select pg_temp.som('b1');
do $$
begin
  if (select count(*) from benefits) + (select count(*) from expense_claims) + (select count(*) from owner_planner_snapshots) <> 0 then
    raise exception 'B ser A:s förmåner, utlägg eller planerare';
  end if;
  begin
    perform collectum_basis((select v from prov where k = 'a'), '2026-11');
    raise exception 'B läste A:s Collectum-underlag';
  exception when insufficient_privilege then null;
  end;
  begin
    perform expense_approve((select v from prov where k = 'park'), 2000, 0, '{}', 'x');
    raise exception 'B kunde godkänna A:s utlägg';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into storage.objects (bucket_id, name)
    values ('hr', (select v from prov where k = 'a') || '/' || (select v from prov where k = 'erik') || '/kvitto-' || (select v from prov where k = 'utlagg') || '-1.jpg');
    raise exception 'B kunde ladda upp i A:s mapp';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$ begin raise notice 'Prov 0042: alla gick igenom'; end $$;

rollback;
