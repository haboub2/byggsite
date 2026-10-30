-- RLS- och funktionsprov för 0040 och 0041 (myndigheterna, docs/hr-lon.md fas 4).
-- Körs i Supabase SQL-editor efter 0041, eller lokalt med
-- supabase/tests/local/run.sh. Allt sker i en transaktion som rullas
-- tillbaka; "Prov 0040: alla gick igenom" betyder att allt höll.
--
--   A1  owner i A              A2  redovisningskonsult i A
--   A3  personal (staff) i A   A4  anställd, är Erik
--   A5  admin i A (godkänner det konsulten räknat)
--   B1  owner i B
--
-- November 2026 körs igenom (konsulten räknar, admin godkänner, bankfil,
-- bokföring, stängning) med tre handskrivna lönebesked:
--   Erik   född 1992, månadslön 32 000,50 kr, skatt 6 450 kr       → full avgift
--   Fatima född 2004, timlön 30 000 kr, bilförmån 1 500 kr,
--          skattefri milersättning 500 kr, skatt 5 400 kr, SAF-LO   → ungdomsnedsättningen
--   Gustav född 1950, styrelsearvode 10 000 kr, skatt 3 000 kr      → bara ålderspensionsavgift
-- Avgifterna som agiContributions(): full (32 000 + 6 500) × 31,42 % =
-- 12 096 kr, ung 25 000 × 20,81 % = 5 202 kr, äldre 10 000 × 10,21 % =
-- 1 021 kr; 487 = 18 319 kr, 497 = 14 850 kr. Samma fall i
-- lib/core/payroll/agi.test.ts ("the SQL test's month").

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000040a1', 'a-agare@prov40.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000040a2', 'a-konsult@prov40.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000040a3', 'a-personal@prov40.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000040a4', 'erik@prov40.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000040a5', 'a-admin@prov40.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000040b1', 'b-agare@prov40.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

create function pg_temp.som(p_user text) returns void
  language sql
as $$
  select set_config('request.jwt.claims',
    jsonb_build_object('sub', '00000000-0000-4000-8000-0000000040' || p_user, 'role', 'authenticated', 'email', p_user || '@prov40.se')::text, true)
$$;
grant execute on function pg_temp.som(text) to authenticated;

-- En rad i ett lönebesked: kod, art, AGI-ruta, konto, motkonto, belopp, skattepliktig, avgiftsunderlag.
create function pg_temp.rad(p_code text, p_kind text, p_box text, p_account text, p_counter text, p_amount bigint, p_taxable boolean) returns jsonb
  language sql
as $$
  select jsonb_build_object('code', p_code, 'text', p_code, 'amountOre', p_amount,
    'item', jsonb_build_object('code', p_code, 'name', p_code, 'kind', p_kind, 'version', 1,
      'flags', jsonb_build_object('account', p_account, 'counterAccount', p_counter, 'agiBox', p_box, 'taxable', p_taxable)))
$$;
grant execute on function pg_temp.rad(text, text, text, text, text, bigint, boolean) to authenticated;

-- Lönebeskedet som PayslipDocument (det databasen läser).
create function pg_temp.doc(p_emp uuid, p_name text, p_birth int, p_lines jsonb, p_tax bigint, p_category text, p_base bigint,
                            p_contrib bigint, p_scheme text) returns jsonb
  language sql
as $$
  select jsonb_build_object(
    'schema', 1, 'employeeId', p_emp, 'employeeName', p_name, 'birthYear', p_birth,
    'periodStart', '2026-11-01', 'periodEnd', '2026-11-30', 'payDate', '2026-11-25', 'ruleSetValidFrom', '2026-04-01', 'taxTableVersion', null,
    'lines', p_lines,
    'contributions', jsonb_build_object('category', p_category, 'baseOre', p_base, 'ratePercent', 31.42, 'amountOre', p_contrib),
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
grant execute on function pg_temp.doc(uuid, text, int, jsonb, bigint, text, bigint, bigint, text) to authenticated;

-- AGI-filen som agi.ts skriver den (bara det databasen läser), ur posterna.
create function pg_temp.agi_fil(p_records jsonb, p_487 bigint, p_497 bigint) returns text
  language sql
as $$
  select '<?xml version="1.0" encoding="UTF-8"?><Skatteverket omrade="Arbetsgivardeklaration" '
      || 'xmlns="http://xmls.skatteverket.se/se/skatteverket/da/instans/schema/1.1" xmlns:agd="http://xmls.skatteverket.se/se/skatteverket/da/komponent/schema/1.1">'
      || '<agd:Blankett><agd:Blankettinnehall><agd:HU><agd:RedovisningsPeriod faltkod="006">202611</agd:RedovisningsPeriod>'
      || '<agd:SummaArbAvgSlf faltkod="487">' || p_487 || '</agd:SummaArbAvgSlf><agd:SummaSkatteavdr faltkod="497">' || p_497 || '</agd:SummaSkatteavdr>'
      || '</agd:HU></agd:Blankettinnehall></agd:Blankett>'
      || coalesce((select string_agg('<agd:Blankett><agd:Blankettinnehall><agd:IU>'
           || '<agd:RedovisningsPeriod faltkod="006">202611</agd:RedovisningsPeriod><agd:Specifikationsnummer faltkod="570">' || (r->>'specNo') || '</agd:Specifikationsnummer>'
           || case when coalesce((r->>'removed')::boolean, false) then '<agd:Borttag faltkod="205">1</agd:Borttag>'
              else '<agd:KontantErsattningUlagAG faltkod="011">' || ((r->'boxes'->>'011')::bigint / 100) || '</agd:KontantErsattningUlagAG>'
                || case when (r->'boxes'->>'012')::bigint <> 0 then '<agd:SkatteplOvrigaFormanerUlagAG faltkod="012">' || ((r->'boxes'->>'012')::bigint / 100) || '</agd:SkatteplOvrigaFormanerUlagAG>' else '' end
                || case when (r->'boxes'->>'013')::bigint <> 0 then '<agd:SkatteplBilformanUlagAG faltkod="013">' || ((r->'boxes'->>'013')::bigint / 100) || '</agd:SkatteplBilformanUlagAG>' else '' end
                || case when (r->'boxes'->>'023')::bigint <> 0 then '<agd:AndelStyrelsearvode faltkod="023">' || ((r->'boxes'->>'023')::bigint / 100) || '</agd:AndelStyrelsearvode>' else '' end
                || case when (r->'ticks'->>'050')::boolean then '<agd:Bilersattning faltkod="050">1</agd:Bilersattning>' else '' end
                || '<agd:AvdrPrelSkatt faltkod="001">' || ((r->'boxes'->>'001')::bigint / 100) || '</agd:AvdrPrelSkatt>' end
           || '</agd:IU></agd:Blankettinnehall></agd:Blankett>', '' order by (r->>'specNo')::int)
           from jsonb_array_elements(p_records) r), '')
      || '</Skatteverket>'
$$;
grant execute on function pg_temp.agi_fil(jsonb, bigint, bigint) to authenticated;

-- Posterna ur ett bygge: personerna med specifikationsnummer i namnordning (agiRecords).
create function pg_temp.poster(p_build jsonb) returns jsonb
  language sql
as $$
  select coalesce(jsonb_agg(p || jsonb_build_object('specNo', n, 'pnrMasked', '') order by n), '[]'::jsonb)
    from jsonb_array_elements(p_build->'people') with ordinality x(p, n)
$$;
grant execute on function pg_temp.poster(jsonb) to authenticated;

-- ---------------------------------------------------------------- organisationerna och personerna

set local role authenticated;
select pg_temp.som('a1');
insert into prov values ('a', create_organization('Prov A AB', ''));
select pg_temp.som('b1');
insert into prov values ('b', create_organization('Prov B AB', ''));

reset role;
insert into memberships (org_id, user_id, role) values
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000040a2', 'accountant'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000040a3', 'staff'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000040a5', 'admin');

set local role authenticated;
select pg_temp.som('a1');
insert into prov values
  ('erik',   hr_create_employee((select v from prov where k = 'a'), '{"name":"Erik Eriksson","email":"erik@prov40.se"}', '199206301234', '8327', '9 123 456 789')),
  ('fatima', hr_create_employee((select v from prov where k = 'a'), '{"name":"Fatima Falk"}', null, '6000', '123 456 789')),
  ('gustav', hr_create_employee((select v from prov where k = 'a'), '{"name":"Gustav Gran"}', null, '6000', '123 456 780'));
-- Erik anställd efter april 2024 (taket 35 000 kr), Fatima före (25 000 kr).
insert into employments (org_id, employee_id, form, pay_form, monthly_salary_ore, weekly_hours, starts_on, valid_from, vacation_rule) values
  ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'tillsvidare', 'monthly', 3200050, 40, '2025-03-01', '2025-03-01', 'sammalon');
insert into employments (org_id, employee_id, form, pay_form, hourly_rate_ore, starts_on, valid_from, vacation_rule, vacation_percent) values
  ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), 'tillsvidare', 'hourly', 18000, '2024-03-01', '2024-03-01', 'procent', 12);

reset role;
insert into memberships (org_id, user_id, role) values ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000040a4', 'employee');

-- ---------------------------------------------------------------- november: räknas, godkänns, betalas, bokförs, stängs

set local role authenticated;
select pg_temp.som('a2');
insert into prov values ('nov', payroll_run_create((select v from prov where k = 'a'), '2026-11-01', '2026-11-25'));
select payroll_run_store_result((select v from prov where k = 'nov'), jsonb_build_object(
  'ruleSetValidFrom', '2026-04-01', 'taxTableImportId', null, 'checks', '[]'::jsonb,
  'payslips', jsonb_build_array(
    jsonb_build_object('employeeId', (select v from prov where k = 'erik'), 'document', pg_temp.doc((select v from prov where k = 'erik'), 'Erik Eriksson', 1992,
      jsonb_build_array(pg_temp.rad('1010', 'salary', '011', '7210', '2820', 3200050, true)), 645000, 'full', 3200050, 1005455, 'itp1')),
    jsonb_build_object('employeeId', (select v from prov where k = 'fatima'), 'document', pg_temp.doc((select v from prov where k = 'fatima'), 'Fatima Falk', 2004,
      jsonb_build_array(pg_temp.rad('1100', 'hourly', '011', '7010', '2820', 3000000, true),
                        pg_temp.rad('1800', 'benefit', '013', '7385', '7399', 150000, true),
                        pg_temp.rad('1910', 'mileage', '050', '7331', '2820', 50000, false)), 540000, 'young', 3150000, 724480, 'saf-lo')),
    jsonb_build_object('employeeId', (select v from prov where k = 'gustav'), 'document', pg_temp.doc((select v from prov where k = 'gustav'), 'Gustav Gran', 1950,
      jsonb_build_array(pg_temp.rad('1600', 'fee', '011', '7240', '2820', 1000000, true)), 300000, 'older', 1000000, 102100, 'none')))));

select pg_temp.som('a5');
select payroll_run_approve((select v from prov where k = 'nov'));
-- Nettolönerna: Erik 25 550,50, Fatima 25 100 (30 000 + 500 − 5 400), Gustav 7 000.
select payroll_bank_file_store((select v from prov where k = 'nov'),
  '<?xml version="1.0" encoding="UTF-8"?><Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"><CstmrCdtTrfInitn>'
  || '<GrpHdr><MsgId>PROV</MsgId><NbOfTxs>3</NbOfTxs><CtrlSum>57650.50</CtrlSum></GrpHdr><PmtInf>'
  || '<CdtTrfTxInf><Amt><InstdAmt Ccy="SEK">25550.50</InstdAmt></Amt></CdtTrfTxInf><CdtTrfTxInf><Amt><InstdAmt Ccy="SEK">25100.00</InstdAmt></Amt></CdtTrfTxInf>'
  || '<CdtTrfTxInf><Amt><InstdAmt Ccy="SEK">7000.00</InstdAmt></Amt></CdtTrfTxInf></PmtInf></CstmrCdtTrfInitn></Document>', 'PROV', '2026-11-25');

-- Före stängningen finns inget att deklarera, och den öppna körningen är ett problem som stoppar filen (0041).
select pg_temp.som('a2');
do $$
declare
  b jsonb := agi_build((select v from prov where k = 'a'), '2026-11');
begin
  if jsonb_array_length(b->'people') <> 0 then
    raise exception 'En körning som inte är stängd kom med i AGI';
  end if;
  if b->'problems'->>0 not like 'Körningen för november 2026 (lönedag 2026-11-25) är inte stängd%' then
    raise exception 'Den öppna körningen syns inte som problem: %', b->'problems';
  end if;
end $$;
select pg_temp.som('a1');
do $$
begin
  perform agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil('[]', 0, 0), '[]');
  raise exception 'AGI kunde skapas medan körningen var öppen';
exception when invalid_parameter_value then
  if sqlerrm not like '%inte stängd%' then raise exception 'Fel meddelande: %', sqlerrm; end if;
end $$;

select pg_temp.som('a5');
select payroll_run_book((select v from prov where k = 'nov'), '[]');
select payroll_run_close((select v from prov where k = 'nov'));

-- ---------------------------------------------------------------- konsulten bygger men lagrar inte

select pg_temp.som('a2');
create temp table prov_agi on commit drop as select agi_build((select v from prov where k = 'a'), '2026-11') as bygge;
grant select on prov_agi to authenticated;

do $$
declare
  b jsonb := (select bygge from prov_agi);
  e jsonb := (select p from jsonb_array_elements(b->'people') p where p->>'name' = 'Erik Eriksson');
  f jsonb := (select p from jsonb_array_elements(b->'people') p where p->>'name' = 'Fatima Falk');
  g jsonb := (select p from jsonb_array_elements(b->'people') p where p->>'name' = 'Gustav Gran');
begin
  if (b->'totals'->>'contributionsOre')::bigint <> 1831900 or (b->'totals'->>'taxOre')::bigint <> 1485000 then
    raise exception 'Summorna blev fel: %', b->'totals';
  end if;
  if jsonb_array_length(b->'problems') <> 0 then raise exception 'Problem efter stängningen: %', b->'problems'; end if;
  -- Summorna är de stängda körningarnas: skatten är körningens, avgifterna i hela kronor per sats.
  if (b->'totals'->>'taxOre')::bigint <> (select (totals->>'taxOre')::bigint from pay_runs where id = (select v from prov where k = 'nov')) then
    raise exception 'Skatten i AGI är inte körningens';
  end if;
  if b->'totals'->'contributionRows' <> '[{"category":"full","ratePercent":31.42,"baseOre":3850000,"amountOre":1209600},'
                                        '{"category":"young","ratePercent":20.81,"baseOre":2500000,"amountOre":520200},'
                                        '{"category":"older","ratePercent":10.21,"baseOre":1000000,"amountOre":102100}]'::jsonb then
    raise exception 'Satsraderna blev fel: %', b->'totals'->'contributionRows';
  end if;
  -- Erik: 32 000,50 kr blir 32 000 kr (ören bort).
  if e->'boxes' <> '{"001":645000,"011":3200000,"012":0,"013":0,"018":0,"023":0,"131":0}'::jsonb then raise exception 'Eriks rutor: %', e->'boxes'; end if;
  if f->'boxes'->>'013' <> '150000' or not (f->'ticks'->>'050')::boolean or f->'contributions' <>
     '[{"category":"young","ratePercent":20.81,"baseOre":2500000},{"category":"full","ratePercent":31.42,"baseOre":650000}]'::jsonb then
    raise exception 'Fatimas rader: %', f;
  end if;
  if g->'boxes'->>'011' <> '1000000' or g->'boxes'->>'023' <> '1000000' then raise exception 'Gustavs arvode: %', g->'boxes'; end if;
  begin
    perform agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil(pg_temp.poster(b), 18319, 14850), pg_temp.poster(b));
    raise exception 'Redovisningskonsulten kunde lagra AGI';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- ägaren lagrar version 1

select pg_temp.som('a1');
do $$
declare
  b jsonb := (select bygge from prov_agi);
  r jsonb := pg_temp.poster((select bygge from prov_agi));
  v_id uuid;
begin
  -- Fel i filen eller i posterna vägras.
  begin
    perform agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil(r, 18320, 14850), r);
    raise exception 'En fil med fel 487 gick in';
  exception when check_violation then null;
  end;
  begin
    perform agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil(jsonb_set(r, '{0,boxes,011}', '3200100'), 18319, 14850), r);
    raise exception 'En fil med fel ruta 011 gick in';
  exception when check_violation then null;
  end;
  begin
    perform agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil(r, 18319, 14850), jsonb_set(r, '{0,boxes,011}', '3200100'));
    raise exception 'Poster som inte är månadens gick in';
  exception when check_violation then null;
  end;
  begin
    perform agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil(r, 18319, 14850), jsonb_set(r, '{1,specNo}', '1'));
    raise exception 'Två lika specifikationsnummer gick in';
  exception when check_violation then null;
  end;
  v_id := agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil(r, 18319, 14850), r);
  insert into prov values ('agi1', v_id);
  if (select version || status || contributions_ore || '/' || tax_ore from agi_declarations where id = v_id) <> '1draft1831900/1485000' then
    raise exception 'Version 1 blev fel: %', (select row_to_json(d) from agi_declarations d where id = v_id);
  end if;
  begin
    perform agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil(r, 18319, 14850), r);
    raise exception 'Samma månad utan ändring blev en ny version';
  exception when invalid_parameter_value then null;
  end;
  begin
    update agi_declarations set tax_ore = 0 where id = v_id;
    raise exception 'Deklarationen kunde ändras direkt';
  exception when insufficient_privilege then null;
  end;
  perform agi_mark_filed(v_id);
  if (select status from agi_declarations where id = v_id) <> 'filed' then raise exception 'Version 1 blev inte lämnad'; end if;
end $$;

-- Konsulten läser deklarationen men inte filen, och markerar inget.
select pg_temp.som('a2');
do $$
begin
  if (select count(*) from agi_declarations) <> 1 then raise exception 'Konsulten ser inte deklarationen'; end if;
  begin
    perform agi_xml((select v from prov where k = 'agi1'));
    raise exception 'Konsulten kunde läsa filen med personnumren';
  exception when insufficient_privilege then null;
  end;
  begin
    perform xml from agi_declarations;
    raise exception 'Konsulten kunde välja kolumnen xml';
  exception when insufficient_privilege then null;
  end;
  begin
    perform agi_mark_filed((select v from prov where k = 'agi1'));
    raise exception 'Konsulten kunde markera som lämnad';
  exception when insufficient_privilege then null;
  end;
  begin
    perform agi_mark_paid((select v from prov where k = 'agi1'), true);
    raise exception 'Konsulten kunde markera skattekontot';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------------------------------------------------------------- återbetalning och omprövning

select pg_temp.som('a1');
do $$
declare
  v_slip uuid := (select id from payslips where employee_id = (select v from prov where k = 'erik'));
  b jsonb;
  r jsonb;
  v_id uuid;
  d record;
begin
  begin
    perform agi_repayment_add(v_slip, 4000000, 'För mycket', '2026-12-05');
    raise exception 'En återbetalning större än lönen gick in';
  exception when invalid_parameter_value then null;
  end;
  perform agi_repayment_add(v_slip, 600000, 'För mycket utbetalt i november', '2026-12-05');
  b := agi_build((select v from prov where k = 'a'), '2026-11');
  -- Erik 26 000 kr: full (26 000 + 6 500) × 31,42 % = 10 211 kr; 487 = 10 211 + 5 202 + 1 021. Skatten ändras inte.
  if (b->'totals'->>'contributionsOre')::bigint <> 1643400 or (b->'totals'->>'taxOre')::bigint <> 1485000 then
    raise exception 'Omprövningens summor: %', b->'totals';
  end if;
  r := pg_temp.poster(b);
  begin
    perform agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil(r, 16434, 14850),
                      jsonb_set(jsonb_set(r, '{0,specNo}', '7'), '{1,specNo}', '1'));
    raise exception 'Nya specifikationsnummer för samma personer gick in';
  exception when check_violation then null;
  end;
  v_id := agi_store((select v from prov where k = 'a'), '2026-11', pg_temp.agi_fil(r, 16434, 14850), r);
  insert into prov values ('agi2', v_id);
  -- Ett utkast markeras inte betalt (0041).
  begin
    perform agi_mark_paid(v_id, true);
    raise exception 'Ett utkast kunde markeras betalt';
  exception when feature_not_supported then null;
  end;
  if (select version from agi_declarations where id = v_id) <> 2 or (select status from agi_declarations where id = (select v from prov where k = 'agi1')) <> 'filed' then
    raise exception 'Omprövningen blev inte version 2 bredvid den lämnade version 1';
  end if;
  -- Diffen: bara Erik, bara ruta 011.
  if (select count(*) from agi_diff(v_id)) <> 1 then raise exception 'Diffen visar fler än Erik: %', (select json_agg(x) from agi_diff(v_id) x); end if;
  select * into d from agi_diff(v_id);
  if d.name <> 'Erik Eriksson' or d.change <> 'changed' or d.field <> '011' or d.before <> '3200000' or d.after <> '2600000' then
    raise exception 'Diffen blev fel: %', row_to_json(d);
  end if;
  perform agi_mark_filed(v_id);
  if (select status from agi_declarations where id = (select v from prov where k = 'agi1')) <> 'corrected' then
    raise exception 'Version 1 blev inte rättad när version 2 lämnades';
  end if;
  begin
    perform agi_mark_filed((select v from prov where k = 'agi1'));
    raise exception 'En rättad version kunde lämnas igen';
  exception when feature_not_supported then null;
  end;
  perform agi_mark_paid(v_id, true);
  if (select paid_at from agi_declarations where id = v_id) is null then raise exception 'Skattekontot markerades inte betalt'; end if;
  if agi_xml(v_id) not like '%<agd:SummaArbAvgSlf faltkod="487">16434</agd:SummaArbAvgSlf>%' then raise exception 'agi_xml gav inte filen'; end if;
end $$;

-- ---------------------------------------------------------------- Fora, växa-stöd, årssammanställning

do $$
declare
  v_basis jsonb := pension_basis((select v from prov where k = 'a'), '2026-11', 'fora');
  v_file text := E'personnummer;fornamn;efternamn;fokId;manad;bruttolon\r\n200401011234;Fatima;Falk;FOK306834;2026-11;30000\r\n';
  v_id uuid;
begin
  -- Bara Fatima (SAF-LO); timlönen men inte bilförmånen eller milersättningen.
  if v_basis <> jsonb_build_array(jsonb_build_object('employeeId', (select v from prov where k = 'fatima'), 'name', 'Fatima Falk',
       'payslipIds', jsonb_build_array((select id from payslips where employee_id = (select v from prov where k = 'fatima'))), 'payOre', 3000000)) then
    raise exception 'Fora-underlaget blev fel: %', v_basis;
  end if;
  begin
    perform pension_report_store((select v from prov where k = 'a'), '2026-11', 'fora', replace(v_file, ';30000', ';30001'), v_basis);
    raise exception 'En Fora-fil med fel summa gick in';
  exception when check_violation then null;
  end;
  v_id := pension_report_store((select v from prov where k = 'a'), '2026-11', 'fora', v_file, v_basis);
  perform pension_report_mark_filed(v_id);
  if (select status || total_ore from pension_reports where id = v_id) <> 'filed3000000' then raise exception 'Fora-rapporten lämnades inte'; end if;

  if (select (b->>'contributionBaseOre')::bigint from jsonb_array_elements(vaxa_stod_basis((select v from prov where k = 'a'), '2026-11')) b
       where b->>'employeeId' = (select v from prov where k = 'erik')::text) <> 3200050 then
    raise exception 'Växa-stödets underlag för Erik blev fel';
  end if;
  -- Fatima anställdes före maj 2024: taket är 25 000 kr, inte 35 000 kr som appen skickar (0041).
  begin
    perform vaxa_stod_claim_store((select v from prov where k = 'a'), '2026-11', jsonb_build_array(jsonb_build_object(
      'employeeId', (select v from prov where k = 'fatima'), 'monthNo', 33, 'baseOre', 3150000, 'cappedBaseOre', 3150000, 'refundOre', 668100)));
    raise exception 'Växa-stöd med fel tak gick in';
  exception when check_violation then
    if sqlerrm not like 'Taket är 25000 kr (anställd från 2024-03-01)%' then raise exception 'Fel meddelande om taket: %', sqlerrm; end if;
  end;
  -- Med rätt tak: månad 33 är efter de 24 månaderna.
  begin
    perform vaxa_stod_claim_store((select v from prov where k = 'a'), '2026-11', jsonb_build_array(jsonb_build_object(
      'employeeId', (select v from prov where k = 'fatima'), 'monthNo', 33, 'baseOre', 3150000, 'cappedBaseOre', 2500000, 'refundOre', 530200)));
    raise exception 'Växa-stöd efter 24 månader gick in';
  exception when check_violation then
    if sqlerrm not like 'Månad 33 av anställningen%' then raise exception 'Fel meddelande om månaden: %', sqlerrm; end if;
  end;
  -- Erik från 2025-03-01: månad 21, 32 000 kr × 21,21 % = 6 787,20 → 6 787 kr.
  begin
    perform vaxa_stod_claim_store((select v from prov where k = 'a'), '2026-11', jsonb_build_array(jsonb_build_object(
      'employeeId', (select v from prov where k = 'erik'), 'monthNo', 3, 'baseOre', 3200050, 'cappedBaseOre', 3200000, 'refundOre', 678700)));
    raise exception 'Fel månad gick in';
  exception when check_violation then null;
  end;
  if vaxa_stod_claim_store((select v from prov where k = 'a'), '2026-11', jsonb_build_array(jsonb_build_object(
       'employeeId', (select v from prov where k = 'erik'), 'monthNo', 21, 'baseOre', 3200050, 'cappedBaseOre', 3200000, 'refundOre', 678700))) <> 1 then
    raise exception 'Växa-stödet registrerades inte';
  end if;
  if (select month_no from vaxa_stod_claims where employee_id = (select v from prov where k = 'erik')) <> 21 then
    raise exception 'Månaden sparades inte';
  end if;

  if (select s from jsonb_array_elements(year_summary((select v from prov where k = 'a'), 2026)) s where s->>'name' = 'Erik Eriksson')
     <> jsonb_build_object('employeeId', (select v from prov where k = 'erik'), 'name', 'Erik Eriksson', 'payslips', 1, 'cashGrossOre', 3200050,
          'benefitOre', 0, 'taxFreeReimbursementOre', 0, 'taxOre', 645000, 'netOre', 2555050, 'employerContributionOre', 1005455, 'repaidOre', 600000,
          'firstPayDate', '2026-11-25', 'lastPayDate', '2026-11-25') then
    raise exception 'Årssammanställningen för Erik: %', year_summary((select v from prov where k = 'a'), 2026);
  end if;
end $$;

-- ---------------------------------------------------------------- årsskiftet

create temp table prov_ar on commit drop as
select jsonb_build_array(jsonb_build_object('employeeId', (select v from prov where k = 'erik'), 'name', 'Erik Eriksson',
  'closing', jsonb_build_object('yearFrom', '2025-04-01', 'yearTo', '2026-03-31', 'earnedDays', 25, 'takenDays', 20, 'takenFromSavedDays', 0,
                                'savedInDays', 0, 'savedDays', 5),
  'opening', jsonb_build_object('yearFrom', '2026-04-01', 'yearTo', '2027-03-31', 'earnedDays', 25, 'savedInDays', 5),
  'expiredDays', 0, 'lapsedDays', 0)) as rows;
grant select on prov_ar to authenticated;

select pg_temp.som('a2');
do $$
begin
  begin
    perform year_close((select v from prov where k = 'a'), 2026, (select rows from prov_ar));
    raise exception 'Konsulten kunde göra årsskiftet';
  exception when insufficient_privilege then null;
  end;
end $$;

select pg_temp.som('a1');
do $$
begin
  -- Sex sparade dagar av 25 intjänade och 20 uttagna går inte (högst 5).
  begin
    perform year_close((select v from prov where k = 'a'), 2026, jsonb_set((select rows from prov_ar), '{0,closing,savedDays}', '6'));
    raise exception 'För många sparade dagar gick in';
  exception when check_violation then null;
  end;
  begin
    perform year_close((select v from prov where k = 'a'), 2027, (select rows from prov_ar));
    raise exception 'Ett semesterår som inte har slutat stängdes';
  exception when feature_not_supported then null;
  end;
  perform year_close((select v from prov where k = 'a'), 2026, (select rows from prov_ar));
  if (select earned_days || '/' || paid_days || '/' || saved_days || '/' || (closed_at is not null) from leave_balances
       where employee_id = (select v from prov where k = 'erik') and vacation_year_start = '2025-04-01') <> '25.00/20.00/5.00/true' then
    raise exception 'Det stängda semesteråret blev fel';
  end if;
  if (select earned_days || '/' || saved_in_days || '/' || (closed_at is null) from leave_balances
       where employee_id = (select v from prov where k = 'erik') and vacation_year_start = '2026-04-01') <> '25.00/5.00/true' then
    raise exception 'Det nya semesteråret blev fel';
  end if;
  if (select jsonb_array_length(summary) from year_closings where org_id = (select v from prov where k = 'a') and year = 2026) <> 3 then
    raise exception 'Årssammanställningen sparades inte';
  end if;
  begin
    perform year_close((select v from prov where k = 'a'), 2026, (select rows from prov_ar));
    raise exception 'Årsskiftet gjordes två gånger';
  exception when unique_violation then null;
  end;
  begin
    update leave_balances set saved_days = 0 where employee_id = (select v from prov where k = 'erik') and vacation_year_start = '2025-04-01';
    raise exception 'Ett stängt semesterår kunde ändras';
  exception when feature_not_supported then null;
  end;
end $$;

-- ---------------------------------------------------------------- arbetsgivarintyg

insert into prov select 'intyg', gen_random_uuid();
insert into employer_certificates (id, org_id, employee_id, from_date, to_date, reason, content, storage_path, sha256, size_bytes)
select i.v, a.v, e.v, '2025-12-01', '2026-11-30', 'arbetsbrist', '{}'::jsonb, a.v || '/' || e.v || '/' || i.v || '.pdf', repeat('f', 64), 1000
  from prov i, prov a, prov e where i.k = 'intyg' and a.k = 'a' and e.k = 'erik';
do $$
begin
  begin
    insert into employer_certificates (org_id, employee_id, from_date, to_date, reason, content, storage_path, sha256, size_bytes)
    values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), '2025-12-01', '2026-11-30', 'annat', '{}', 'fel/sokvag.pdf', repeat('f', 64), 1000);
    raise exception 'Ett intyg med fel sökväg gick in';
  exception when check_violation then null;
  end;
  if not exists (select 1 from events where aggregate_type = 'employee' and type = 'employee.certificate_created') then
    raise exception 'Intyget loggades inte';
  end if;
end $$;

-- ---------------------------------------------------------------- vem ser vad

-- Erik ser sitt eget intyg och inget annat.
select pg_temp.som('a4');
do $$
begin
  if (select count(*) from employer_certificates) <> 1 then raise exception 'Erik ser inte sitt intyg'; end if;
  if (select count(*) from agi_declarations) + (select count(*) from agi_repayments) + (select count(*) from pension_reports)
     + (select count(*) from vaxa_stod_claims) + (select count(*) from year_closings) <> 0 then
    raise exception 'Erik ser deklarationer, rapporter eller årsskiftet';
  end if;
  begin
    perform agi_build((select v from prov where k = 'a'), '2026-11');
    raise exception 'Erik kunde bygga AGI';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into employer_certificates (org_id, employee_id, from_date, to_date, reason, content, storage_path, sha256, size_bytes)
    values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), '2025-12-01', '2026-11-30', 'annat', '{}', 'x', repeat('f', 64), 1);
    raise exception 'Erik kunde skriva ett intyg';
  exception when insufficient_privilege then null;
  end;
end $$;

select pg_temp.som('a3');
do $$
begin
  if (select count(*) from agi_declarations) + (select count(*) from employer_certificates) + (select count(*) from pension_reports) <> 0 then
    raise exception 'Personal (staff) ser myndighetsrapporterna';
  end if;
  if exists (select 1 from events where type like 'agi.%' or type like 'pension.%') then raise exception 'Personal ser händelserna'; end if;
end $$;

-- B ser inget av A.
select pg_temp.som('b1');
do $$
begin
  if (select count(*) from agi_declarations) + (select count(*) from agi_repayments) + (select count(*) from pension_reports)
     + (select count(*) from employer_certificates) + (select count(*) from vaxa_stod_claims) + (select count(*) from year_closings) <> 0 then
    raise exception 'B ser A:s rapporter';
  end if;
  begin
    perform agi_build((select v from prov where k = 'a'), '2026-11');
    raise exception 'B kunde bygga A:s AGI';
  exception when insufficient_privilege then null;
  end;
  begin
    perform agi_diff((select v from prov where k = 'agi2'));
    raise exception 'B kunde läsa A:s diff';
  exception when insufficient_privilege then null;
  end;
  begin
    perform year_summary((select v from prov where k = 'a'), 2026);
    raise exception 'B kunde läsa A:s årssammanställning';
  exception when insufficient_privilege then null;
  end;
  if jsonb_array_length(agi_build((select v from prov where k = 'b'), '2026-11')->'people') <> 0 then
    raise exception 'B:s egen månad har A:s personer';
  end if;
end $$;

do $$ begin raise notice 'Prov 0040: alla gick igenom'; end $$;

rollback;
