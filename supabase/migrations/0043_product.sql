-- Produkt, fas 6 (docs/hr-lon.md, avsnitt 12: onboarding av en andra
-- organisation, förval av lönearter per kollektivavtal, drivmedelsförmån i
-- ruta 018, lönens händelser till webhooks). Läggs på efter 0042, som inte
-- ändras; funktioner som byts ut här (payroll_seed_org, agi_build_sums,
-- agi_store, agi_diff, is_webhook_event, payroll_inputs_hash) skrivs om med
-- create or replace. OBS: 0041_payroll_repair.sql får fortfarande inte köras
-- igen: den skriver payroll_inputs_hash() med 0039:s text (utan 0042:s
-- utlägg och förmåner och utan 0043:s lönearter).
--
-- 1. benefits: det den anställde betalar för drivmedlet (private_fuel_ore,
--    marknadsvärdet för privat körning per månad, finns sedan 0042 men lästes
--    inte av appen). Körningen lägger raderna 1830
--    (värdet, underlag för skatt och avgifter) och 1831 (uppräkningen till
--    1,2 enligt 61 kap. 10 § IL, bara skatt), båda i ruta 018.
-- 2. Löneartsregistret: 1830 och 1831 i standardregistret. payroll_seed_org
--    lägger nu till lönearter som saknas i en befintlig organisation (inte
--    bara när registret är tomt), så alla organisationer får dem här.
--    Blocket mellan BEGIN/END hålls lika med pay-items.default.ts av
--    lib/core/payroll/pay-items-sql.test.ts; 0039:s block står kvar som det
--    var då.
-- 3. payroll_apply_preset(): förvalet för ett kollektivavtal (appen räknar
--    fram raderna ur pay-item-presets.ts): en ny version från ett datum för
--    varje löneart som saknas eller skiljer sig, inget annat tas bort eller
--    ändras. Förvalet antecknas i payroll_settings.data och loggas som
--    payroll.preset_applied.
-- 4. Arbetsgivardeklarationen: ruta 018 (DrivmVidBilformanUlagAG) summeras,
--    kontrolleras i filen och jämförs mellan versioner som de andra rutorna.
--    Avgifterna kommer som förut ur lönebeskedens avgiftsunderlag, där
--    drivmedlet ligger utan uppräkning. agi_build_hash() får en ny nyckel i
--    rutorna, så en månad som deklarerades före 0043 ser ändrad ut vid en
--    jämförelse (ingen riktig månad är lämnad än).
-- 5. Webhooks: payslip.approved, payroll.run_approved, payroll.run_closed,
--    time.approved och expense.approved kan levereras (samma lista som
--    WEBHOOK_EVENT_TYPES i lib/core/events.ts; lib/api/webhooks.test.ts
--    håller dem lika). Händelsernas data är id och summor, aldrig dokument
--    eller personnummer.
-- 6. payroll_inputs_hash: 0042:s text plus löneartsregistret, så att ett
--    förval (eller en handgjord version) efter beräkningen stoppar
--    godkännandet tills körningen räknats om med de nya flaggorna.
--
-- Inga nya tabeller, ingen ny RLS: pay_items och payroll_settings har 0039:s
-- policyer, och funktionen här är security definer med can_payroll_approve.

begin;

-- =====================================================================
-- 1. Drivmedelsförmån på bilförmånen
-- =====================================================================

alter table benefits add column fuel_employee_payment_ore bigint not null default 0 check (fuel_employee_payment_ore >= 0);
comment on column benefits.private_fuel_ore is 'Drivmedlets marknadsvärde för den privata körningen per månad (61 kap. 10 § IL); körningen räknar 1,2 × värdet i skatteunderlaget och värdet utan uppräkning i avgiftsunderlaget (0042; läses av appen sedan 0043).';
comment on column benefits.fuel_employee_payment_ore is 'Det den anställde betalar för drivmedlet per månad; minskar drivmedelsförmånen krona för krona.';
grant update (fuel_employee_payment_ore) on benefits to authenticated;

-- =====================================================================
-- 2. Löneartsregistret med 1830 och 1831; sådden lägger till det som saknas
-- =====================================================================

create or replace function public.payroll_seed_org(p_org uuid) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  insert into public.number_series (org_id, series, per_year, start, pad) values (p_org, 'L', false, 1, 0)
    on conflict do nothing;
  perform public.seed_payroll_accounts(p_org);
  insert into public.pay_items (org_id, code, name, kind, valid_from, taxable, tax_mode, subject_to_employer_contribution,
                                vacation_pay_basis, pension_reportable, agi_box, account, counter_account, fora_category)
  select p_org, v.code, v.name, v.kind, '2026-01-01', v.taxable, v.tax_mode, v.avgift, v.semester, v.pension, v.agi_box,
         v.account, v.counter_account, v.fora
    from (values
-- BEGIN pay items
    ('1010', 'Månadslön', 'salary', true, 'table', true, true, true, '011', '7210', '2820', null),
    ('1011', 'Månadslön kollektiv', 'salary', true, 'table', true, true, true, '011', '7010', '2820', 'lon'),
    ('1020', 'Lön VD', 'salary', true, 'table', true, true, true, '011', '7220', '2820', null),
    ('1100', 'Timlön', 'hourly', true, 'table', true, true, true, '011', '7010', '2820', 'lon'),
    ('1101', 'Timlön tjänsteman', 'hourly', true, 'table', true, true, true, '011', '7210', '2820', null),
    ('1150', 'Löneavdrag frånvaro', 'gross_adjustment', true, 'table', true, true, true, '011', '7210', '2820', null),
    ('1151', 'Löneavdrag frånvaro kollektiv', 'gross_adjustment', true, 'table', true, true, true, '011', '7010', '2820', 'lon'),
    ('1200', 'OB-tillägg', 'ob', true, 'table', true, true, true, '011', '7010', '2820', 'lon'),
    ('1201', 'OB-tillägg tjänsteman', 'ob', true, 'table', true, true, true, '011', '7210', '2820', null),
    ('1300', 'Övertid', 'overtime', true, 'table', true, true, true, '011', '7010', '2820', 'lon'),
    ('1301', 'Övertid tjänsteman', 'overtime', true, 'table', true, true, true, '011', '7210', '2820', null),
    ('1400', 'Sjuklön', 'sick_pay', true, 'table', true, false, true, '011', '7081', '2820', 'lon'),
    ('1401', 'Sjuklön tjänsteman', 'sick_pay', true, 'table', true, false, true, '011', '7281', '2820', null),
    ('1410', 'Karensavdrag', 'sick_pay', true, 'table', true, false, true, '011', '7081', '2820', 'lon'),
    ('1411', 'Karensavdrag tjänsteman', 'sick_pay', true, 'table', true, false, true, '011', '7281', '2820', null),
    ('1420', 'Sjukavdrag', 'sick_deduction', true, 'table', true, true, true, '011', '7010', '2820', 'lon'),
    ('1421', 'Sjukavdrag tjänsteman', 'sick_deduction', true, 'table', true, true, true, '011', '7210', '2820', null),
    ('1500', 'Semesterlön', 'vacation_pay', true, 'table', true, false, true, '011', '7082', '2820', 'lon'),
    ('1501', 'Semesterlön tjänsteman', 'vacation_pay', true, 'table', true, false, true, '011', '7282', '2820', null),
    ('1510', 'Semestertillägg', 'vacation_pay', true, 'table', true, false, true, '011', '7282', '2820', null),
    ('1520', 'Semesterersättning', 'vacation_pay', true, 'table', true, false, true, '011', '7082', '2820', 'lon'),
    ('1521', 'Semesterersättning slutlön', 'vacation_pay', true, 'lump_sum', true, false, true, '011', '7082', '2820', 'lon'),
    ('1522', 'Semesterersättning slutlön tjänsteman', 'vacation_pay', true, 'lump_sum', true, false, true, '011', '7282', '2820', null),
    ('1530', 'Semesteravdrag obetald semester', 'vacation_deduction', true, 'table', true, false, true, '011', '7210', '2820', null),
    ('1600', 'Styrelsearvode', 'fee', true, 'table', true, false, false, '011', '7240', '2820', null),
    ('1700', 'Bonus', 'gross_adjustment', true, 'lump_sum', true, true, true, '011', '7210', '2820', null),
    ('1710', 'Retroaktiv lön', 'retro', true, 'lump_sum', true, true, true, '011', '7210', '2820', null),
    ('1711', 'Retroaktiv lön kollektiv', 'retro', true, 'lump_sum', true, true, true, '011', '7010', '2820', 'lon'),
    ('1800', 'Bilförmån', 'benefit', true, 'table', true, false, false, '013', '7385', '7399', null),
    ('1810', 'Kostförmån', 'benefit', true, 'table', true, false, false, '012', '7382', '7399', null),
    ('1820', 'Övrig förmån', 'benefit', true, 'table', true, false, false, '012', '7389', '7399', null),
    ('1830', 'Drivmedelsförmån', 'benefit', true, 'table', true, false, false, '018', '7385', '7399', null),
    ('1831', 'Drivmedelsförmån, uppräkning 1,2', 'benefit', true, 'table', false, false, false, '018', '7385', '7399', null),
    ('1900', 'Traktamente skattefritt', 'per_diem', false, 'none', false, false, false, '051', '7321', '2820', null),
    ('1901', 'Traktamente skattepliktigt', 'per_diem', true, 'table', true, false, false, '011', '7322', '2820', null),
    ('1910', 'Milersättning skattefri', 'mileage', false, 'none', false, false, false, '050', '7331', '2820', null),
    ('1911', 'Milersättning skattepliktig', 'mileage', true, 'table', true, false, false, '011', '7332', '2820', null),
    ('1920', 'Utlägg', 'expense', false, 'none', false, false, false, null, '7690', '2820', null),
    ('2000', 'Nettolöneavdrag', 'net_adjustment', false, 'none', false, false, false, null, '1610', '2820', null)
-- END pay items
    ) as v(code, name, kind, taxable, tax_mode, avgift, semester, pension, agi_box, account, counter_account, fora)
   where not exists (select 1 from public.pay_items p where p.org_id = p_org and p.code = v.code);
  insert into public.payroll_settings (org_id) values (p_org) on conflict do nothing;
end;
$$;
revoke all on function public.payroll_seed_org(uuid) from public, anon, authenticated;

select public.payroll_seed_org(id) from organizations;

-- =====================================================================
-- 3. Förval av lönearter per kollektivavtal
-- =====================================================================

-- p_items: [{code, name, kind, taxable, taxMode, subjectToEmployerContribution,
-- vacationPayBasis, pensionReportable, agiBox, account, counterAccount,
-- foraCategory}] (pay-item-presets.ts presetRows). För varje kod jämförs den
-- version som gäller p_valid_from; saknas den eller skiljer den sig läggs en
-- ny version in från p_valid_from (numret sätts av pay_items_version).
-- Lönearter organisationen har utöver förvalet lämnas. Ger antalet nya
-- versioner.
create or replace function public.payroll_apply_preset(p_org uuid, p_preset text, p_items jsonb, p_valid_from date default current_date) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  i jsonb;
  cur public.pay_items;
  v_n int := 0;
  v_codes text[] := '{}';
begin
  if not public.can_payroll_approve(p_org) then
    raise exception 'Bara ägare och administratörer ändrar löneartsregistret.' using errcode = '42501';
  end if;
  if p_preset is null or p_preset not in ('none', 'byggavtalet', 'tjanstemannaavtalet', 'both') then
    raise exception 'Okänt förval: %.', p_preset using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Förvalet saknar lönearter.' using errcode = '22023';
  end if;
  if p_valid_from is null then
    raise exception 'Ange från vilken dag förvalet gäller.' using errcode = '22023';
  end if;
  perform public.payroll_seed_org(p_org);

  for i in select x from jsonb_array_elements(p_items) x order by x->>'code' loop
    select p.* into cur from public.pay_items p
     where p.org_id = p_org and p.code = i->>'code' and p.valid_from <= p_valid_from
     order by p.valid_from desc, p.version desc limit 1;
    if cur.id is not null
       and cur.name = i->>'name' and cur.kind = i->>'kind'
       and cur.taxable = (i->>'taxable')::boolean and cur.tax_mode = i->>'taxMode'
       and cur.subject_to_employer_contribution = (i->>'subjectToEmployerContribution')::boolean
       and cur.vacation_pay_basis = (i->>'vacationPayBasis')::boolean
       and cur.pension_reportable = (i->>'pensionReportable')::boolean
       and cur.agi_box is not distinct from (i->>'agiBox')
       and cur.account = i->>'account' and cur.counter_account = i->>'counterAccount'
       and cur.fora_category is not distinct from (i->>'foraCategory') then
      continue;
    end if;
    insert into public.pay_items (org_id, code, name, kind, valid_from, taxable, tax_mode, subject_to_employer_contribution,
                                  vacation_pay_basis, pension_reportable, agi_box, account, counter_account, fora_category)
    values (p_org, i->>'code', i->>'name', i->>'kind', p_valid_from, (i->>'taxable')::boolean, i->>'taxMode',
            (i->>'subjectToEmployerContribution')::boolean, (i->>'vacationPayBasis')::boolean, (i->>'pensionReportable')::boolean,
            i->>'agiBox', i->>'account', i->>'counterAccount', i->>'foraCategory');
    v_n := v_n + 1;
    v_codes := v_codes || (i->>'code');
  end loop;

  update public.payroll_settings
     set data = coalesce(data, '{}'::jsonb) || jsonb_build_object('payItemPreset', p_preset, 'payItemPresetAppliedAt', now())
   where org_id = p_org;
  perform public.payroll_log(p_org, p_org, 'payroll.preset_applied',
    jsonb_build_object('preset', p_preset, 'validFrom', p_valid_from, 'versions', v_n, 'codes', to_jsonb(v_codes)));
  return v_n;
end;
$$;
revoke all on function public.payroll_apply_preset(uuid, text, jsonb, date) from public, anon;
grant execute on function public.payroll_apply_preset(uuid, text, jsonb, date) to authenticated;

-- =====================================================================
-- 4. Arbetsgivardeklarationen: ruta 018
-- =====================================================================

-- 0040:s agi_build() (döpt till agi_build_sums av 0041) med ruta 018 i
-- summorna per person och i månadens rutor; i övrigt samma text.
create or replace function public.agi_build_sums(p_org uuid, p_period text) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
declare
  c record := public.employer_contribution_rules();
  v_cap bigint := (select young_cap_ore from public.agi_rules());
  v_young boolean;
  v_people jsonb;
  v_rows jsonb;
  v_runs jsonb;
  v_problems jsonb;
  v_boxes jsonb;
begin
  if not public.can_payroll_read(p_org) then
    raise exception 'Bara ägare, administratörer och redovisningskonsulten bygger arbetsgivardeklarationen.' using errcode = '42501';
  end if;
  if p_period is null or p_period !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Perioden skrivs ÅÅÅÅ-MM.' using errcode = '22023';
  end if;
  v_young := (p_period || '-01')::date between c.young_from and c.young_to;

  with runs as (
    select r.id from public.pay_runs r
     where r.org_id = p_org and r.status = 'closed' and to_char(r.pay_date, 'YYYY-MM') = p_period
  ), slips as (
    select p.id, p.employee_id, p.document, p.tax_ore from public.payslips p
     where p.run_id in (select id from runs) and p.approved_at is not null
  ), per as (
    select s.employee_id,
           (array_agg(s.document->>'employeeName' order by s.document->>'payDate' desc, s.id))[1] as name,
           (array_agg((s.document->>'birthYear')::int order by s.document->>'payDate' desc, s.id))[1] as birth_year,
           (array_agg(s.document->'contributions'->>'category' order by s.document->>'payDate' desc, s.id))[1] as category,
           jsonb_agg(s.id order by s.id) as payslip_ids,
           sum(s.tax_ore)::bigint as tax,
           sum((s.document->'contributions'->>'baseOre')::bigint)::bigint as base
      from slips s group by s.employee_id
  ), box as (
    select l.employee_id,
           coalesce(sum(l.amount_ore) filter (where l.agi_box = '011'), 0)::bigint as b011,
           coalesce(sum(l.amount_ore) filter (where l.agi_box = '012'), 0)::bigint as b012,
           coalesce(sum(l.amount_ore) filter (where l.agi_box = '013'), 0)::bigint as b013,
           coalesce(sum(l.amount_ore) filter (where l.agi_box = '018'), 0)::bigint as b018,
           coalesce(sum(l.amount_ore) filter (where l.agi_box = '131'), 0)::bigint as b131,
           coalesce(sum(l.amount_ore) filter (where l.kind = 'fee'), 0)::bigint as b023,
           coalesce(bool_or(l.agi_box = '050' and l.amount_ore > 0), false) as t050,
           coalesce(bool_or(l.agi_box = '051' and l.amount_ore > 0), false) as t051
      from public.payslip_lines l where l.payslip_id in (select id from slips) group by l.employee_id
  ), rep as (
    select a.employee_id, sum(a.amount_ore)::bigint as amount, jsonb_agg(a.id order by a.id) as ids
      from public.agi_repayments a where a.org_id = p_org and a.period = p_period group by a.employee_id
  ), raw as (
    select per.employee_id, per.name, per.birth_year, per.category, per.payslip_ids, coalesce(rep.ids, '[]'::jsonb) as repayment_ids,
           per.tax as b001, coalesce(box.b011, 0) - coalesce(rep.amount, 0) as c011, coalesce(box.b012, 0) as b012,
           coalesce(box.b013, 0) as b013, coalesce(box.b018, 0) as b018, coalesce(box.b023, 0) as b023, coalesce(box.b131, 0) as c131,
           coalesce(box.t050, false) as t050, coalesce(box.t051, false) as t051, per.base - coalesce(rep.amount, 0) as base
      from per left join box on box.employee_id = per.employee_id left join rep on rep.employee_id = per.employee_id
  ), fin as (
    -- Under 1 000 kr om året är lönen inte underlag för avgifter (ruta 131). Hela kronor, ören bort mot noll
    -- (heltalsdivision i Postgres trunkerar). Personens underlag per sats utan ören, en rad när underlaget inte är noll.
    select r.*,
           (case when r.category = 'below-annual-threshold' then 0 else r.c011 end) / 100 * 100 as b011,
           (case when r.category = 'below-annual-threshold' then r.c131 + r.c011 else r.c131 end) / 100 * 100 as b131,
           case
             when r.category = 'older' and r.base <> 0 then
               jsonb_build_array(jsonb_build_object('category', 'older', 'ratePercent', c.older_percent, 'baseOre', r.base / 100 * 100))
             when r.category = 'young' and v_young then
               (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from (values
                 (1, case when least(r.base, v_cap) <> 0 then jsonb_build_object('category', 'young', 'ratePercent', c.young_percent, 'baseOre', least(r.base, v_cap) / 100 * 100) end),
                 (2, case when r.base - least(r.base, v_cap) <> 0 then jsonb_build_object('category', 'full', 'ratePercent', c.full_percent, 'baseOre', (r.base - least(r.base, v_cap)) / 100 * 100) end)
               ) v(o, x) where x is not null)
             when r.category in ('full', 'young') and r.base <> 0 then
               jsonb_build_array(jsonb_build_object('category', 'full', 'ratePercent', c.full_percent, 'baseOre', r.base / 100 * 100))
             else '[]'::jsonb end as rows
      from raw r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'employeeId', f.employee_id, 'name', f.name, 'birthYear', f.birth_year, 'category', f.category,
           'payslipIds', f.payslip_ids, 'repaymentIds', f.repayment_ids,
           'boxes', jsonb_build_object('001', f.b001 / 100 * 100, '011', f.b011, '012', f.b012 / 100 * 100, '013', f.b013 / 100 * 100,
                                       '018', f.b018 / 100 * 100, '023', f.b023 / 100 * 100, '131', f.b131),
           'ticks', jsonb_build_object('050', f.t050, '051', f.t051),
           'contributionBaseOre', f.base, 'contributions', f.rows) order by f.name collate "C", f.employee_id), '[]'::jsonb)
    into v_people
    from fin f;

  select coalesce(jsonb_agg(to_jsonb(p->>'name' || ': ruta ' || b.key || ' blir ' || ((b.value #>> '{}')::bigint / 100) || ' kr, och AGI tar inga negativa belopp.')), '[]'::jsonb)
    into v_problems
    from jsonb_array_elements(v_people) p, jsonb_each(p->'boxes') b
   where (b.value #>> '{}')::bigint < 0;

  -- Per sats över personerna, gånger satsen, ören bort per sats.
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'ratePercent', rate, 'baseOre', base,
                                               'amountOre', (trunc(base * rate * 100 / 1000000) * 100)::bigint) order by rate desc), '[]'::jsonb)
    into v_rows
    from (select r->>'category' as category, (r->>'ratePercent')::numeric as rate, sum((r->>'baseOre')::bigint)::bigint as base
            from jsonb_array_elements(v_people) p, jsonb_array_elements(p->'contributions') r group by 1, 2) g;

  select jsonb_object_agg(k, coalesce((select sum((p->'boxes'->>k)::bigint) from jsonb_array_elements(v_people) p), 0))
    into v_boxes from unnest(array['001','011','012','013','018','023','131']) k;
  select coalesce(jsonb_agg(r.id order by r.id::text), '[]'::jsonb) into v_runs
    from public.pay_runs r where r.org_id = p_org and r.status = 'closed' and to_char(r.pay_date, 'YYYY-MM') = p_period;

  return jsonb_build_object(
    'period', p_period, 'runIds', v_runs, 'people', v_people, 'problems', v_problems,
    'totals', jsonb_build_object(
      'taxOre', (v_boxes->>'001')::bigint,
      'contributionsOre', (select coalesce(sum((r->>'amountOre')::bigint), 0) from jsonb_array_elements(v_rows) r),
      'boxes', v_boxes, 'contributionRows', v_rows));
end;
$$;
revoke all on function public.agi_build_sums(uuid, text) from public, anon, authenticated;

-- 0040:s agi_store() med 018 bland rutorna som läses ur filen och jämförs.
create or replace function public.agi_store(p_org uuid, p_period text, p_xml text, p_records jsonb) returns uuid
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_build jsonb;
  v_prev public.agi_declarations;
  v_x xml;
  v_hash text;
  v_id uuid;
  v_version int;
  v_bad text;
  v_iu text;
  v_count int;
  v_spec bigint;
  v_rec jsonb;
  v_n int := 0;
  v_tax bigint := 0;
  v_kr text;
begin
  if not public.can_payroll_approve(p_org) then
    raise exception 'Bara ägare och administratörer skapar arbetsgivardeklarationen.' using errcode = '42501';
  end if;
  v_build := public.agi_build(p_org, p_period);
  if jsonb_array_length(v_build->'problems') > 0 then
    raise exception 'Månaden går inte att deklarera: %', (select string_agg(x #>> '{}', ' ') from jsonb_array_elements(v_build->'problems') x)
      using errcode = '22023';
  end if;
  select * into v_prev from public.agi_declarations where org_id = p_org and period = p_period order by version desc limit 1 for update;
  v_hash := public.agi_build_hash(v_build);
  if v_prev.id is not null and v_prev.build_hash = v_hash then
    raise exception 'Ingenting har ändrats sedan version % av %.', v_prev.version, p_period using errcode = '22023';
  end if;
  if jsonb_typeof(p_records) <> 'array' then
    raise exception 'Posterna ska vara en lista.' using errcode = '22023';
  end if;

  -- Posterna: varje person i månaden med rutorna och bockarna som agi_build() ger.
  select string_agg(coalesce(b->>'name', r->>'name'), ', ') into v_bad
    from jsonb_array_elements(v_build->'people') b
    full join (select r from jsonb_array_elements(p_records) r where not coalesce((r->>'removed')::boolean, false)) x(r)
      on r->>'employeeId' = b->>'employeeId'
   where b is null or r is null or r->'boxes' <> b->'boxes' or r->'ticks' <> b->'ticks';
  if v_bad is not null then
    raise exception 'Posterna stämmer inte med månadens lönebesked: %.', v_bad using errcode = '23514';
  end if;
  -- Specifikationsnumren: unika, och samma som i förra versionen för den som var med där.
  if (select count(distinct (r->>'specNo')::bigint) from jsonb_array_elements(p_records) r) <> jsonb_array_length(p_records)
     or exists (select 1 from jsonb_array_elements(p_records) r where (r->>'specNo')::bigint not between 1 and 9999999999) then
    raise exception 'Specifikationsnumren ska vara unika, 1–9999999999.' using errcode = '23514';
  end if;
  if v_prev.id is not null then
    select string_agg(o->>'name', ', ') into v_bad
      from jsonb_array_elements(v_prev.records) o
      left join jsonb_array_elements(p_records) r on r->>'employeeId' = o->>'employeeId'
     where not coalesce((o->>'removed')::boolean, false)
       and (r is null or r->>'specNo' <> o->>'specNo');
    if v_bad is not null then
      raise exception 'Specifikationsnumret ska vara detsamma som i version % (eller borttaget med samma nummer): %.', v_prev.version, v_bad
        using errcode = '23514';
    end if;
  end if;
  if exists (select 1 from jsonb_array_elements(p_records) r
              where coalesce((r->>'removed')::boolean, false)
                and (v_prev.id is null or not exists (select 1 from jsonb_array_elements(v_prev.records) o
                                                       where o->>'employeeId' = r->>'employeeId' and not coalesce((o->>'removed')::boolean, false))
                     or exists (select 1 from jsonb_array_elements(v_build->'people') b where b->>'employeeId' = r->>'employeeId'))) then
    raise exception 'Bara den som fanns i förra versionen och inte längre är med i månaden tas bort.' using errcode = '23514';
  end if;

  -- Filen: huvuduppgiften och varje individuppgift läses och jämförs.
  begin
    v_x := p_xml::xml;
  exception when others then
    raise exception 'AGI-filen är inte giltig XML.' using errcode = '22023';
  end;
  if (xpath('string(//*[local-name()="HU"]/*[@faltkod="006"])', v_x))[1]::text <> replace(p_period, '-', '')
     or coalesce((xpath('string(//*[local-name()="HU"]/*[@faltkod="487"])', v_x))[1]::text, '') <> ((v_build->'totals'->>'contributionsOre')::bigint / 100)::text
     or coalesce((xpath('string(//*[local-name()="HU"]/*[@faltkod="497"])', v_x))[1]::text, '') <> ((v_build->'totals'->>'taxOre')::bigint / 100)::text then
    raise exception 'Huvuduppgiften i filen (period, 487, 497) stämmer inte med månaden: % kr avgifter, % kr skatt.',
      (v_build->'totals'->>'contributionsOre')::bigint / 100, (v_build->'totals'->>'taxOre')::bigint / 100 using errcode = '23514';
  end if;
  v_count := ((xpath('count(//*[local-name()="IU"])', v_x))[1]::text)::numeric::int;
  for i in 1 .. v_count loop
    v_n := v_n + 1;
    v_iu := '(//*[local-name()="IU"])[' || i || ']';
    v_spec := nullif((xpath('string(' || v_iu || '/*[@faltkod="570"])', v_x))[1]::text, '')::bigint;
    select r into v_rec from jsonb_array_elements(p_records) r where (r->>'specNo')::bigint = v_spec;
    if v_rec is null or (xpath('string(' || v_iu || '/*[@faltkod="006"])', v_x))[1]::text <> replace(p_period, '-', '') then
      raise exception 'Individuppgift % i filen finns inte bland posterna.', v_spec using errcode = '23514';
    end if;
    if coalesce((v_rec->>'removed')::boolean, false) then
      if (xpath('string(' || v_iu || '/*[@faltkod="205"])', v_x))[1]::text not in ('1', 'true') then
        raise exception 'Individuppgift % ska vara ett borttag.', v_spec using errcode = '23514';
      end if;
      continue;
    end if;
    foreach v_kr in array array['001','011','012','013','018','023','131'] loop
      if coalesce(nullif((xpath('string(' || v_iu || '/*[@faltkod="' || v_kr || '"])', v_x))[1]::text, ''), '0')::bigint * 100
         <> (v_rec->'boxes'->>v_kr)::bigint then
        raise exception 'Ruta % i individuppgift % stämmer inte med månaden.', v_kr, v_spec using errcode = '23514';
      end if;
    end loop;
    foreach v_kr in array array['050','051'] loop
      if ((xpath('string(' || v_iu || '/*[@faltkod="' || v_kr || '"])', v_x))[1]::text in ('1', 'true')) <> (v_rec->'ticks'->>v_kr)::boolean then
        raise exception 'Ruta % i individuppgift % stämmer inte med månaden.', v_kr, v_spec using errcode = '23514';
      end if;
    end loop;
    v_tax := v_tax + (v_rec->'boxes'->>'001')::bigint;
  end loop;
  if v_n <> jsonb_array_length(p_records) or v_tax <> (v_build->'totals'->>'taxOre')::bigint then
    raise exception 'Filen har % individuppgifter och % kr skatt; månaden % och % kr.', v_n, v_tax / 100,
      jsonb_array_length(p_records), (v_build->'totals'->>'taxOre')::bigint / 100 using errcode = '23514';
  end if;

  v_version := coalesce(v_prev.version, 0) + 1;
  -- Utkast som aldrig lämnades ersätts av den nya versionen.
  update public.agi_declarations set status = 'corrected' where org_id = p_org and period = p_period and status = 'draft';
  insert into public.agi_declarations (org_id, period, version, schema_version, xml, sha256, tax_ore, contributions_ore, totals, records,
                                       run_ids, build_hash)
  values (p_org, p_period, v_version, (select schema_version from public.agi_rules()), p_xml,
          encode(digest(convert_to(p_xml, 'UTF8'), 'sha256'), 'hex'), (v_build->'totals'->>'taxOre')::bigint,
          (v_build->'totals'->>'contributionsOre')::bigint, v_build->'totals', p_records,
          (select coalesce(array_agg((x #>> '{}')::uuid), '{}') from jsonb_array_elements(v_build->'runIds') x), v_hash)
  returning id into v_id;
  perform public.payroll_log(p_org, v_id, 'agi.created', jsonb_build_object('period', p_period, 'version', v_version,
    'taxOre', v_build->'totals'->'taxOre', 'contributionsOre', v_build->'totals'->'contributionsOre', 'people', jsonb_array_length(v_build->'people')));
  return v_id;
end;
$$;
revoke all on function public.agi_store(uuid, text, text, jsonb) from public, anon;
grant execute on function public.agi_store(uuid, text, text, jsonb) to authenticated;

-- 0040:s agi_diff() med 018 bland fälten som jämförs mellan versioner.
create or replace function public.agi_diff(p_id uuid)
returns table (employee_id uuid, name text, spec_no bigint, change text, field text, before jsonb, after jsonb)
  language plpgsql stable security definer set search_path = public
as $$
declare
  d public.agi_declarations;
  v_prev jsonb;
begin
  select * into d from public.agi_declarations where id = p_id;
  if d.id is null or not public.can_payroll_read(d.org_id) then
    raise exception 'Deklarationen finns inte.' using errcode = '42501';
  end if;
  select a.records into v_prev from public.agi_declarations a where a.org_id = d.org_id and a.period = d.period and a.version = d.version - 1;
  v_prev := coalesce(v_prev, '[]'::jsonb);
  return query
  with o as (select r from jsonb_array_elements(v_prev) r where not coalesce((r->>'removed')::boolean, false)),
       n as (select r from jsonb_array_elements(d.records) r)
  select (n.r->>'employeeId')::uuid, n.r->>'name', (n.r->>'specNo')::bigint, 'removed'::text, null::text, null::jsonb, null::jsonb
    from n where coalesce((n.r->>'removed')::boolean, false) and exists (select 1 from o where o.r->>'employeeId' = n.r->>'employeeId')
  union all
  select (n.r->>'employeeId')::uuid, n.r->>'name', (n.r->>'specNo')::bigint,
         case when o.r is null then 'added' else 'changed' end, f.k,
         case when o.r is null then null when f.k in ('050','051') then o.r->'ticks'->f.k else o.r->'boxes'->f.k end,
         case when f.k in ('050','051') then n.r->'ticks'->f.k else n.r->'boxes'->f.k end
    from n left join o on o.r->>'employeeId' = n.r->>'employeeId'
    cross join (values ('001'), ('011'), ('012'), ('013'), ('018'), ('023'), ('131'), ('050'), ('051')) f(k)
   where not coalesce((n.r->>'removed')::boolean, false)
     and case when f.k in ('050','051') then (n.r->'ticks'->f.k) is distinct from coalesce(o.r->'ticks'->f.k, 'false'::jsonb)
              else (n.r->'boxes'->f.k) is distinct from coalesce(o.r->'boxes'->f.k, case when o.r is null then '0'::jsonb end) end
  order by 2, 5;
end;
$$;
revoke all on function public.agi_diff(uuid) from public, anon;
grant execute on function public.agi_diff(uuid) to authenticated;

-- =====================================================================
-- 5. Webhooks: lönens händelser
-- =====================================================================

-- Samma lista som WEBHOOK_EVENT_TYPES i lib/core/events.ts.
create or replace function public.is_webhook_event(p_type text) returns boolean
  language sql immutable
as $$
  select p_type = any(array[
    'invoice.issued', 'invoice.sent', 'invoice.reminded', 'invoice.partially_paid', 'invoice.paid',
    'invoice.credited', 'invoice.voided', 'invoice.corrected', 'payment.received', 'rot_claim.sent', 'rot_claim.paid', 'rot_claim.rejected',
    'payslip.approved', 'payroll.run_approved', 'payroll.run_closed', 'time.approved', 'expense.approved'
  ])
$$;

-- =====================================================================
-- 6. Underlagets fingeravtryck (0042:s plus löneartsregistret)
-- =====================================================================

create or replace function public.payroll_inputs_hash(p_run uuid) returns text
  language sql stable security definer set search_path = public
as $$
  select md5(concat_ws('|',
    (select string_agg(concat_ws(',', t.id, case t.status when 'locked' then 'approved' else t.status end, t.hours, t.start_time,
                                 t.end_time, t.break_minutes, t.kind, t.corrects_id), ';' order by t.id)
       from public.time_entries t
      where t.org_id = r.org_id and t.work_date between r.time_period_start and r.time_period_end),
    (select string_agg(concat_ws(',', a.id, a.kind, a.from_date, a.to_date, a.extent, a.approved_at is not null), ';' order by a.id)
       from public.absences a
      where a.org_id = r.org_id and a.from_date <= r.time_period_end
        and (a.to_date is null or a.to_date >= (r.time_period_start - interval '1 year')::date)),
    (select string_agg(concat_ws(',', v.id, v.schedule_id), ';' order by v.id) from public.employments v where v.org_id = r.org_id),
    (select string_agg(x.id::text, ';' order by x.id) from public.employee_tax x where x.org_id = r.org_id),
    (select string_agg(concat_ws(',', e.id, e.birth_date, e.agreement, e.ended_at), ';' order by e.id) from public.employees e where e.org_id = r.org_id),
    (select string_agg(c.id::text, ';' order by c.id) from public.payroll_corrections c
      where c.org_id = r.org_id and (c.target_run_id is null or c.target_run_id = r.id)),
    (select s.data->>'vacationYear' from public.payroll_settings s where s.org_id = r.org_id),
    -- 0042: godkända obetalda utlägg och förmånerna.
    (select string_agg(concat_ws(',', c.id, c.tax_free_ore, c.taxable_ore), ';' order by c.id) from public.expense_claims c
      where c.org_id = r.org_id and c.status = 'approved'),
    (select string_agg(concat_ws(',', b.id, b.valid_from, b.valid_to, b.updated_at), ';' order by b.id) from public.benefits b
      where b.org_id = r.org_id),
    -- 0043: löneartsregistret, så att ett förval som tillämpas efter beräkningen ("räkna om") stoppar godkännandet.
    (select string_agg(concat_ws(',', p.id, p.code, p.version, p.valid_from), ';' order by p.id) from public.pay_items p
      where p.org_id = r.org_id)))
  from public.pay_runs r where r.id = p_run
$$;
revoke all on function public.payroll_inputs_hash(uuid) from public, anon, authenticated;

commit;
