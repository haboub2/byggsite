-- Myndigheterna, fas 4 (docs/hr-lon.md, avsnitt 4, 8, 9, 11 och 12).
-- Läggs på efter 0035–0039, som inte ändras.
--
-- Appen skriver filerna (lib/core/payroll/agi.ts, fora.ts) och PDF:erna;
-- databasen summerar ur de frysta lönebeskeden, lagrar filerna frysta med
-- SHA-256 och vägrar en fil vars summor inte är databasens. Inget skickas
-- någonstans: ägaren laddar upp AGI-filen i Skatteverkets e-tjänst och
-- signerar med BankID, och Fora-filen på Foras Mina sidor.
--
-- 1. agi_declarations: arbetsgivardeklarationen per månad i versioner.
--    agi_build() summerar de stängda körningarna med lönedag i månaden
--    (kontantprincipen: retroaktiv lön och kvittning redovisas den månad de
--    betalas) och återbetald lön (agi_repayments, återkrav) för månaden,
--    som sänker 011 och avgifterna men inte 001 (Skatteverket, "Rätta en
--    arbetsgivardeklaration"). Avgifterna som agiContributions() i
--    contributions.ts: per person och sats utan ören, summerat per sats,
--    gånger satsen, ören bort per sats. agi_store() vägrar en fil vars
--    individuppgifter eller 487/497 inte är agi_build():s.
-- 2. agi_repayments: lön som den anställde betalat tillbaka, per
--    lönebesked; ger en omprövning (ny version) av den månaden.
-- 3. pension_reports: Fora (och senare Collectum) per månad i versioner;
--    pension_basis() summerar Fora-lönen ur lönebeskeden.
-- 4. employer_certificates: arbetsgivarintyg, fryst PDF i hinken hr.
-- 5. vaxa_stod_claims: växa-stöd som ansökts per månad och person;
--    vaxa_stod_basis() ger avgiftsunderlaget.
-- 6. year_closings och leave_balances: årsskiftet. year_close() tar appens
--    semesterövergång (year-end.ts), kontrollerar sparandet (18 §), skriver
--    det stängda och det nya semesteråret och låser det stängda, och
--    sparar årssammanställningen per person (year_summary()). En gång per år.
-- 7. RLS: lönebehöriga läser, owner/admin skriver; filernas innehåll (med
--    personnummer i klartext) bara för owner/admin genom agi_xml() och
--    pension_report_file(); den anställde ser bara sina egna intyg.

begin;

-- =====================================================================
-- 0. Regler som SQL behöver (samma tal som regelboken; prov i
--    lib/core/payroll/authorities-parity.test.ts)
-- =====================================================================

-- Ungdomsnedsättningens tak per person och månad (lag 2026:100) och
-- schemaversionen; sparandet av semesterdagar (semesterlagen 18 §).
create or replace function public.agi_rules(out young_cap_ore bigint, out schema_version text, out vaxa_keep_bp int, out vaxa_cap_ore bigint)
  language sql immutable
as $$ select 2500000::bigint, '1.1'::text, 2121, 3500000::bigint $$;

create or replace function public.vacation_save_rules(out min_days_taken numeric, out max_saved_years int)
  language sql immutable
as $$ select 20::numeric, 5 $$;

-- =====================================================================
-- 1–2. Arbetsgivardeklarationen
-- =====================================================================

create table agi_declarations (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  period             text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  version            int not null check (version >= 1),
  -- draft: skapad, inte lämnad. filed: lämnad i e-tjänsten. corrected:
  -- ersatt av en senare version (filed_at visar om den hann lämnas).
  status             text not null default 'draft' check (status in ('draft','filed','corrected')),
  schema_version     text not null,
  xml                text not null,
  sha256             text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  tax_ore            bigint not null,                -- 497
  contributions_ore  bigint not null,                -- 487
  totals             jsonb not null,                 -- agi_build().totals
  records            jsonb not null check (jsonb_typeof(records) = 'array'),  -- AgiRecord[] (agi.ts), för diffen
  run_ids            uuid[] not null default '{}',
  build_hash         text not null,
  filed_at           timestamptz,
  filed_by           uuid,
  filed_by_name      text,
  paid_at            timestamptz,                    -- skattekontot betalt (ägarens bock)
  paid_by            uuid,
  created_by         uuid default auth.uid(),
  created_at         timestamptz not null default now(),
  unique (org_id, period, version),
  unique (id, org_id),
  check ((status = 'filed') <= (filed_at is not null))
);
create index agi_declarations_org_idx on agi_declarations (org_id, period desc, version desc);

-- Filen och summorna ändras aldrig; bara status, lämnad och betald.
create or replace function public.agi_declarations_freeze() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'En arbetsgivardeklaration tas inte bort; gör en ny version.' using errcode = '0A000';
  end if;
  if (to_jsonb(new) - array['status','filed_at','filed_by','filed_by_name','paid_at','paid_by'])
     <> (to_jsonb(old) - array['status','filed_at','filed_by','filed_by_name','paid_at','paid_by']) then
    raise exception 'Arbetsgivardeklarationen är fryst; gör en ny version.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
create trigger agi_declarations_freeze before update or delete on agi_declarations
  for each row execute function agi_declarations_freeze();

create table agi_repayments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  employee_id   uuid not null,
  payslip_id    uuid not null,
  period        text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount_ore    bigint not null check (amount_ore > 0),
  reason        text not null check (length(btrim(reason)) between 3 and 500),
  repaid_on     date not null,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  foreign key (payslip_id, org_id) references payslips(id, org_id),
  foreign key (employee_id, org_id) references employees(id, org_id)
);
create index agi_repayments_period_idx on agi_repayments (org_id, period);
create trigger agi_repayments_immutable before update or delete on agi_repayments
  for each row execute function forbid_change();

-- Månadens summor ur de frysta lönebeskeden (agi.ts agiBuild, samma form).
create or replace function public.agi_build(p_org uuid, p_period text) returns jsonb
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
           coalesce(box.b013, 0) as b013, coalesce(box.b023, 0) as b023, coalesce(box.b131, 0) as c131,
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
                                       '023', f.b023 / 100 * 100, '131', f.b131),
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
    into v_boxes from unnest(array['001','011','012','013','023','131']) k;
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

-- Det som jämförs mellan versioner och med appens poster: rutorna och bockarna per person.
create or replace function public.agi_build_hash(p_build jsonb) returns text
  language sql immutable
as $$
  select md5(coalesce((select string_agg((p->>'employeeId') || (p->'boxes')::text || (p->'ticks')::text, ';' order by p->>'employeeId')
                         from jsonb_array_elements(p_build->'people') p), '') || '|' || (p_build->'totals'->>'contributionsOre'))
$$;

-- En ny version för månaden: filen och posterna från appen, summorna från
-- agi_build(). Vägras om posterna, specifikationsnumren eller filens
-- individuppgifter och 487/497 inte stämmer, om månaden har problem, eller
-- om ingenting har ändrats sedan förra versionen.
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
    foreach v_kr in array array['001','011','012','013','023','131'] loop
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

-- Lämnad i e-tjänsten (ägaren laddade upp och signerade). Bara den senaste
-- versionen; tidigare lämnade blir rättade.
create or replace function public.agi_mark_filed(p_id uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  d public.agi_declarations;
begin
  select * into d from public.agi_declarations where id = p_id for update;
  if d.id is null or not public.can_payroll_approve(d.org_id) then
    raise exception 'Bara ägare och administratörer markerar arbetsgivardeklarationen som lämnad.' using errcode = '42501';
  end if;
  if d.status <> 'draft' then
    raise exception 'Version % är redan %.', d.version, case d.status when 'filed' then 'lämnad' else 'ersatt' end using errcode = '0A000';
  end if;
  update public.agi_declarations set status = 'corrected' where org_id = d.org_id and period = d.period and status = 'filed';
  update public.agi_declarations set status = 'filed', filed_at = now(), filed_by = auth.uid(), filed_by_name = coalesce(auth.jwt()->>'email', '')
   where id = p_id;
  perform public.payroll_log(d.org_id, d.id, 'agi.filed', jsonb_build_object('period', d.period, 'version', d.version, 'sha256', d.sha256));
end;
$$;

-- Skattekontot betalt (eller inte) för versionens belopp.
create or replace function public.agi_mark_paid(p_id uuid, p_paid boolean) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  d public.agi_declarations;
begin
  select * into d from public.agi_declarations where id = p_id for update;
  if d.id is null or not public.can_payroll_approve(d.org_id) then
    raise exception 'Bara ägare och administratörer markerar skattekontot som betalt.' using errcode = '42501';
  end if;
  update public.agi_declarations set paid_at = case when p_paid then coalesce(paid_at, now()) end, paid_by = case when p_paid then auth.uid() end
   where id = p_id;
  perform public.payroll_log(d.org_id, d.id, case when p_paid then 'agi.paid' else 'agi.unpaid' end,
    jsonb_build_object('period', d.period, 'version', d.version, 'amountOre', d.tax_ore + d.contributions_ore));
end;
$$;

-- Vad en version ändrar mot versionen före, per person och ruta (agi.ts diffAgi).
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
    cross join (values ('001'), ('011'), ('012'), ('013'), ('023'), ('131'), ('050'), ('051')) f(k)
   where not coalesce((n.r->>'removed')::boolean, false)
     and case when f.k in ('050','051') then (n.r->'ticks'->f.k) is distinct from coalesce(o.r->'ticks'->f.k, 'false'::jsonb)
              else (n.r->'boxes'->f.k) is distinct from coalesce(o.r->'boxes'->f.k, case when o.r is null then '0'::jsonb end) end
  order by 2, 5;
end;
$$;

-- Filen med personnumren: bara owner/admin.
create or replace function public.agi_xml(p_id uuid) returns text
  language plpgsql stable security definer set search_path = public
as $$
declare
  d public.agi_declarations;
begin
  select * into d from public.agi_declarations where id = p_id;
  if d.id is null or not public.can_payroll_approve(d.org_id) then
    raise exception 'Bara ägare och administratörer hämtar AGI-filen (den har personnumren).' using errcode = '42501';
  end if;
  return d.xml;
end;
$$;

-- Återbetald lön (återkrav) för ett lönebesked i en stängd körning: sänker
-- 011 för den månad lönen betalades. Inte mer än lönebeskedets ruta 011.
create or replace function public.agi_repayment_add(p_payslip uuid, p_amount bigint, p_reason text, p_repaid_on date) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  p public.payslips;
  r public.pay_runs;
  v_cash bigint;
  v_done bigint;
  v_id uuid;
begin
  select * into p from public.payslips where id = p_payslip;
  if p.id is null or not public.can_payroll_approve(p.org_id) then
    raise exception 'Bara ägare och administratörer registrerar återbetald lön.' using errcode = '42501';
  end if;
  select * into r from public.pay_runs where id = p.run_id;
  if r.status <> 'closed' then
    raise exception 'Återbetalningen gäller ett lönebesked i en stängd körning.' using errcode = '0A000';
  end if;
  select coalesce(sum(amount_ore) filter (where agi_box = '011'), 0) into v_cash from public.payslip_lines where payslip_id = p.id;
  select coalesce(sum(amount_ore), 0) into v_done from public.agi_repayments where payslip_id = p.id;
  if p_amount is null or p_amount <= 0 or p_amount + v_done > v_cash then
    raise exception 'Återbetalningen ska vara mer än 0 och högst lönebeskedets kontanta lön (% kr kvar).', (v_cash - v_done) / 100.0
      using errcode = '22023';
  end if;
  if p_repaid_on is null or p_repaid_on < r.pay_date then
    raise exception 'Dagen för återbetalningen ska vara lönedagen eller senare.' using errcode = '22023';
  end if;
  insert into public.agi_repayments (org_id, employee_id, payslip_id, period, amount_ore, reason, repaid_on)
  values (p.org_id, p.employee_id, p.id, to_char(r.pay_date, 'YYYY-MM'), p_amount, btrim(coalesce(p_reason, '')), p_repaid_on)
  returning id into v_id;
  perform public.hr_log(p.org_id, p.employee_id, 'agi.repayment_added',
    jsonb_build_object('payslipId', p.id, 'number', p.number, 'period', to_char(r.pay_date, 'YYYY-MM'), 'amountOre', p_amount));
  return v_id;
end;
$$;

-- =====================================================================
-- 3. Fora (och Collectum)
-- =====================================================================

create table pension_reports (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  period        text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  scheme        text not null check (scheme in ('fora','collectum')),
  version       int not null check (version >= 1),
  status        text not null default 'draft' check (status in ('draft','filed','corrected')),
  format        text not null,
  file          text not null,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  lines         jsonb not null check (jsonb_typeof(lines) = 'array'),  -- [{employeeId, name, payslipIds, payOre}]
  total_ore     bigint not null,
  filed_at      timestamptz,
  filed_by      uuid,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  unique (org_id, period, scheme, version)
);
create or replace function public.pension_reports_freeze() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if tg_op = 'DELETE' or (to_jsonb(new) - array['status','filed_at','filed_by']) <> (to_jsonb(old) - array['status','filed_at','filed_by']) then
    raise exception 'Rapporten är fryst; gör en ny version.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
create trigger pension_reports_freeze before update or delete on pension_reports
  for each row execute function pension_reports_freeze();

-- Fora-lönen per person (fora.ts foraBasis): lönebesked i stängda körningar
-- med lönedag i månaden, för den vars lönebesked säger SAF-LO; raderna vars
-- löneart har en Fora-kategori; hela kronor per person.
create or replace function public.pension_basis(p_org uuid, p_period text, p_scheme text) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_payroll_read(p_org) then
    raise exception 'Bara lönebehöriga läser pensionsunderlaget.' using errcode = '42501';
  end if;
  if p_scheme <> 'fora' then
    raise exception 'Bara Fora finns ännu (Collectum kommer i fas 5).' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('employeeId', employee_id, 'name', name, 'payslipIds', ids, 'payOre', pay / 100 * 100)
                              order by name collate "C", employee_id), '[]'::jsonb)
      from (select p.employee_id, (array_agg(p.document->>'employeeName' order by p.document->>'payDate' desc))[1] as name,
                   jsonb_agg(distinct p.id) as ids,
                   coalesce(sum(l.amount_ore) filter (where i.fora_category is not null), 0)::bigint as pay
              from public.payslips p
              join public.pay_runs r on r.id = p.run_id and r.status = 'closed' and to_char(r.pay_date, 'YYYY-MM') = p_period
              left join public.payslip_lines l on l.payslip_id = p.id
              left join public.pay_items i on i.org_id = p.org_id and i.code = l.code and i.version = l.item_version
             where p.org_id = p_org and p.approved_at is not null and p.document->'context'->'pension'->>'scheme' = 'saf-lo'
             group by p.employee_id) x);
end;
$$;

create or replace function public.pension_report_store(p_org uuid, p_period text, p_scheme text, p_file text, p_lines jsonb) returns uuid
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_basis jsonb;
  v_prev public.pension_reports;
  v_total bigint;
  v_file_total numeric;
  v_id uuid;
begin
  if not public.can_payroll_approve(p_org) then
    raise exception 'Bara ägare och administratörer skapar rapporten.' using errcode = '42501';
  end if;
  v_basis := public.pension_basis(p_org, p_period, p_scheme);
  if (select string_agg(x, '|' order by x) from (select (b->>'employeeId') || ':' || (b->>'payOre') x from jsonb_array_elements(v_basis) b) s)
     is distinct from (select string_agg(x, '|' order by x) from (select (b->>'employeeId') || ':' || (b->>'payOre') x from jsonb_array_elements(p_lines) b) s) then
    raise exception 'Raderna stämmer inte med månadens lönebesked.' using errcode = '23514';
  end if;
  select coalesce(sum((b->>'payOre')::bigint), 0) into v_total from jsonb_array_elements(v_basis) b;
  -- Filen: sista kolumnen på varje rad efter rubriken, i kronor.
  select coalesce(sum(nullif(split_part(l, ';', 6), '')::numeric), 0) into v_file_total
    from unnest((string_to_array(replace(p_file, E'\r', ''), E'\n'))[2:]) l where btrim(l) <> '';
  if round(v_file_total * 100) <> v_total then
    raise exception 'Filens summa % kr är inte månadens % kr.', v_file_total, v_total / 100 using errcode = '23514';
  end if;
  select * into v_prev from public.pension_reports where org_id = p_org and period = p_period and scheme = p_scheme order by version desc limit 1 for update;
  if v_prev.id is not null and v_prev.lines = p_lines then
    raise exception 'Ingenting har ändrats sedan version %.', v_prev.version using errcode = '22023';
  end if;
  update public.pension_reports set status = 'corrected' where org_id = p_org and period = p_period and scheme = p_scheme and status = 'draft';
  insert into public.pension_reports (org_id, period, scheme, version, format, file, sha256, lines, total_ore)
  values (p_org, p_period, p_scheme, coalesce(v_prev.version, 0) + 1, 'fora-manuell-csv-1', p_file,
          encode(digest(convert_to(p_file, 'UTF8'), 'sha256'), 'hex'), p_lines, v_total)
  returning id into v_id;
  perform public.payroll_log(p_org, v_id, 'pension.report_created', jsonb_build_object('period', p_period, 'scheme', p_scheme, 'totalOre', v_total));
  return v_id;
end;
$$;

create or replace function public.pension_report_mark_filed(p_id uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  d public.pension_reports;
begin
  select * into d from public.pension_reports where id = p_id for update;
  if d.id is null or not public.can_payroll_approve(d.org_id) then
    raise exception 'Bara ägare och administratörer markerar rapporten som lämnad.' using errcode = '42501';
  end if;
  if d.status <> 'draft' then
    raise exception 'Rapporten är redan lämnad eller ersatt.' using errcode = '0A000';
  end if;
  update public.pension_reports set status = 'corrected' where org_id = d.org_id and period = d.period and scheme = d.scheme and status = 'filed';
  update public.pension_reports set status = 'filed', filed_at = now(), filed_by = auth.uid() where id = p_id;
  perform public.payroll_log(d.org_id, d.id, 'pension.report_filed', jsonb_build_object('period', d.period, 'scheme', d.scheme, 'version', d.version));
end;
$$;

create or replace function public.pension_report_file(p_id uuid) returns text
  language plpgsql stable security definer set search_path = public
as $$
declare
  d public.pension_reports;
begin
  select * into d from public.pension_reports where id = p_id;
  if d.id is null or not public.can_payroll_approve(d.org_id) then
    raise exception 'Bara ägare och administratörer hämtar filen (den har personnumren).' using errcode = '42501';
  end if;
  return d.file;
end;
$$;

-- =====================================================================
-- 4. Arbetsgivarintyg
-- =====================================================================

create table employer_certificates (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  employee_id   uuid not null,
  from_date     date not null,
  to_date       date not null,
  reason        text not null,
  content       jsonb not null,                -- CertificateContent (certificate.ts) utan personnummer
  storage_path  text not null,
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes    int not null check (size_bytes > 0),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  foreign key (employee_id, org_id) references employees(id, org_id),
  check (to_date >= from_date),
  check (storage_path = org_id || '/' || employee_id || '/' || id || '.pdf')
);
create index employer_certificates_employee_idx on employer_certificates (employee_id, created_at desc);
create trigger employer_certificates_immutable before update or delete on employer_certificates
  for each row execute function forbid_change();

create or replace function public.employer_certificates_events() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  perform public.hr_log(new.org_id, new.employee_id, 'employee.certificate_created',
    jsonb_build_object('certificateId', new.id, 'from', new.from_date, 'to', new.to_date, 'reason', new.reason, 'sha256', new.sha256));
  return new;
end;
$$;
revoke all on function public.employer_certificates_events() from public, anon, authenticated;
create trigger employer_certificates_events after insert on employer_certificates
  for each row execute function employer_certificates_events();

-- =====================================================================
-- 5. Växa-stöd
-- =====================================================================

create table vaxa_stod_claims (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null,
  period            text not null check (period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  employee_id       uuid not null,
  month_no          int not null check (month_no between 1 and 24),
  base_ore          bigint not null,
  capped_base_ore   bigint not null check (capped_base_ore >= 0),
  refund_ore        bigint not null check (refund_ore >= 0),
  status            text not null default 'applied' check (status = 'applied'),
  applied_at        timestamptz not null default now(),
  applied_by        uuid default auth.uid(),
  unique (org_id, period, employee_id),
  foreign key (employee_id, org_id) references employees(id, org_id)
);
create trigger vaxa_stod_claims_immutable before update or delete on vaxa_stod_claims
  for each row execute function forbid_change();

-- Avgiftsunderlaget per person i månadens stängda körningar (vaxa-stod.ts räknar rätten och taket).
create or replace function public.vaxa_stod_basis(p_org uuid, p_period text) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_payroll_read(p_org) then
    raise exception 'Bara lönebehöriga läser underlaget.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('employeeId', employee_id, 'contributionBaseOre', base, 'categories', cats) order by employee_id), '[]'::jsonb)
      from (select p.employee_id, sum((p.document->'contributions'->>'baseOre')::bigint)::bigint as base,
                   jsonb_agg(distinct p.document->'contributions'->>'category') as cats
              from public.payslips p
              join public.pay_runs r on r.id = p.run_id and r.status = 'closed' and to_char(r.pay_date, 'YYYY-MM') = p_period
             where p.org_id = p_org and p.approved_at is not null
             group by p.employee_id) x);
end;
$$;

-- Ansökt i e-tjänsten: raderna sparas. Månadens AGI ska vara lämnad först
-- (Skatteverket), underlaget ska vara månadens, taket och återbetalningen
-- räknas om här.
create or replace function public.vaxa_stod_claim_store(p_org uuid, p_period text, p_rows jsonb) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  a record := public.agi_rules();
  v_basis jsonb;
  x jsonb;
  v_n int := 0;
begin
  if not public.can_payroll_approve(p_org) then
    raise exception 'Bara ägare och administratörer registrerar ansökan om växa-stöd.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.agi_declarations where org_id = p_org and period = p_period and status = 'filed') then
    raise exception 'Lämna arbetsgivardeklarationen för % innan du ansöker om växa-stöd.', p_period using errcode = '0A000';
  end if;
  if (select count(*) from jsonb_array_elements(p_rows)) > 2 then
    raise exception 'Växa-stöd gäller högst två anställda.' using errcode = '22023';
  end if;
  v_basis := public.vaxa_stod_basis(p_org, p_period);
  for x in select * from jsonb_array_elements(p_rows) loop
    if not exists (select 1 from jsonb_array_elements(v_basis) b
                    where b->>'employeeId' = x->>'employeeId' and (b->>'contributionBaseOre')::bigint = (x->>'baseOre')::bigint
                      and b->'categories' = '["full"]'::jsonb)
       -- Taket: 35 000 kr, eller 25 000 kr för den som anställdes före maj 2024 (vaxa-stod.ts).
       or (x->>'cappedBaseOre')::bigint not in (least((x->>'baseOre')::bigint / 100 * 100, a.vaxa_cap_ore),
                                                 least((x->>'baseOre')::bigint / 100 * 100, 2500000))
       or (x->>'refundOre')::bigint <> trunc((x->>'cappedBaseOre')::bigint * a.vaxa_keep_bp / 1000000) * 100 then
      raise exception 'Raden för % stämmer inte med månadens underlag.', x->>'employeeId' using errcode = '23514';
    end if;
    insert into public.vaxa_stod_claims (org_id, period, employee_id, month_no, base_ore, capped_base_ore, refund_ore)
    values (p_org, p_period, (x->>'employeeId')::uuid, (x->>'monthNo')::int, (x->>'baseOre')::bigint, (x->>'cappedBaseOre')::bigint,
            (x->>'refundOre')::bigint);
    perform public.hr_log(p_org, (x->>'employeeId')::uuid, 'vaxa_stod.applied',
      jsonb_build_object('period', p_period, 'refundOre', (x->>'refundOre')::bigint, 'monthNo', (x->>'monthNo')::int));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- =====================================================================
-- 6. Årsskiftet
-- =====================================================================

alter table leave_balances
  add column saved_in_days numeric(5,2) not null default 0,
  add column expired_days  numeric(5,2) not null default 0,
  add column closed_at     timestamptz;

-- Ett stängt semesterår ändras inte.
create or replace function public.leave_balances_closed() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if old.closed_at is not null then
    raise exception 'Semesteråret från % är stängt vid årsskiftet och ändras inte.', old.vacation_year_start using errcode = '0A000';
  end if;
  return case tg_op when 'DELETE' then old else new end;
end;
$$;
create trigger leave_balances_closed before update or delete on leave_balances
  for each row execute function leave_balances_closed();

create table year_closings (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  year                 int not null check (year between 2000 and 2100),
  vacation_year_start  date not null,                 -- det stängda semesteråret
  semester             jsonb not null,                -- SemesterTransitionRow[] (year-end.ts)
  summary              jsonb not null,                -- year_summary()
  semester_closed_at   timestamptz not null default now(),
  summary_generated_at timestamptz not null default now(),
  closed_by            uuid default auth.uid(),
  unique (org_id, year)
);
create trigger year_closings_immutable before update or delete on year_closings
  for each row execute function forbid_change();

-- Årssammanställningen per person: godkända lönebesked i stängda körningar
-- med lönedag under året, och lön som betalats tillbaka för årets månader
-- (year-end.ts yearSummary).
create or replace function public.year_summary(p_org uuid, p_year int) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_payroll_read(p_org) then
    raise exception 'Bara lönebehöriga läser årssammanställningen.' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'employeeId', employee_id, 'name', name, 'payslips', n, 'cashGrossOre', gross, 'benefitOre', benefit,
             'taxFreeReimbursementOre', taxfree, 'taxOre', tax, 'netOre', net, 'employerContributionOre', contrib,
             'repaidOre', coalesce((select sum(a.amount_ore) from public.agi_repayments a
                                     where a.org_id = p_org and a.employee_id = x.employee_id and left(a.period, 4) = p_year::text), 0)::bigint,
             'firstPayDate', first_pay, 'lastPayDate', last_pay) order by name collate "C", employee_id), '[]'::jsonb)
      from (select p.employee_id, (array_agg(p.document->>'employeeName' order by r.pay_date desc))[1] as name, count(*) as n,
                   sum(p.gross_ore)::bigint as gross, sum((p.document->'totals'->>'benefitOre')::bigint)::bigint as benefit,
                   sum((p.document->'totals'->>'taxFreeReimbursementOre')::bigint)::bigint as taxfree, sum(p.tax_ore)::bigint as tax,
                   sum(p.net_ore)::bigint as net, sum(p.employer_contribution_ore)::bigint as contrib,
                   min(r.pay_date) as first_pay, max(r.pay_date) as last_pay
              from public.payslips p
              join public.pay_runs r on r.id = p.run_id and r.status = 'closed' and extract(year from r.pay_date) = p_year
             where p.org_id = p_org and p.approved_at is not null
             group by p.employee_id) x);
end;
$$;

-- Semesteråret som slutar under p_year (31 mars enligt lagen, 31 december
-- vid kalenderår) stängs med appens övergång: p_rows är
-- SemesterTransitionRow[] (year-end.ts). Sparade dagar högst intjänade − 20
-- och högst de ej uttagna, inga när sparade dagar tagits ut (18 §).
create or replace function public.year_close(p_org uuid, p_year int, p_rows jsonb) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_md text := case public.payroll_setting(p_org, array['vacationYear'], 'law') when 'calendar' then '01-01' else '04-01' end;
  v_close date;
  v_open date;
  v_save record := public.vacation_save_rules();
  x jsonb;
  v_earned numeric;
  v_taken numeric;
  v_saved numeric;
  v_id uuid;
begin
  if not public.can_payroll_approve(p_org) then
    raise exception 'Bara ägare och administratörer gör årsskiftet.' using errcode = '42501';
  end if;
  v_close := (p_year || '-' || v_md)::date - interval '1 day';
  if extract(year from v_close) <> p_year then v_close := ((p_year + 1) || '-' || v_md)::date - interval '1 day'; end if;
  v_open := v_close + 1;
  if current_date <= v_close then
    raise exception 'Semesteråret som slutar % har inte slutat ännu.', v_close using errcode = '0A000';
  end if;
  if exists (select 1 from public.year_closings where org_id = p_org and year = p_year) then
    raise exception 'Årsskiftet för % är redan gjort.', p_year using errcode = '23505';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Semesterövergången ska vara en lista.' using errcode = '22023';
  end if;
  for x in select * from jsonb_array_elements(p_rows) loop
    if not exists (select 1 from public.employees where id = (x->>'employeeId')::uuid and org_id = p_org) then
      raise exception 'Personen finns inte i organisationen.' using errcode = '22023';
    end if;
    if (x->'closing'->>'yearFrom')::date <> (v_open - interval '1 year')::date
       or (x->'opening' <> 'null'::jsonb and (x->'opening'->>'yearFrom')::date <> v_open) then
      raise exception '%: semesteråren stämmer inte med lönebesluten (% – %).', x->>'name', (v_open - interval '1 year')::date, v_close
        using errcode = '23514';
    end if;
    v_earned := (x->'closing'->>'earnedDays')::numeric;
    v_taken := (x->'closing'->>'takenDays')::numeric;
    v_saved := (x->'closing'->>'savedDays')::numeric;
    if v_saved < 0 or v_saved > greatest(v_earned - v_save.min_days_taken, 0)
       or (v_taken > v_earned and v_saved <> 0) or (v_taken <= v_earned and v_saved > v_earned - v_taken)
       or (x->>'expiredDays')::numeric < 0 then
      raise exception '%: % sparade dagar går inte med % intjänade och % uttagna (semesterlagen 18 §).', x->>'name', v_saved, v_earned, v_taken
        using errcode = '23514';
    end if;
    insert into public.leave_balances (org_id, employee_id, year_start_month_day, vacation_year_start, earned_days, paid_days, saved_days,
                                       saved_in_days, expired_days, closed_at)
    values (p_org, (x->>'employeeId')::uuid, v_md, (v_open - interval '1 year')::date, v_earned, v_taken, v_saved,
            coalesce((x->'closing'->>'savedInDays')::numeric, 0), (x->>'expiredDays')::numeric, now())
    on conflict (employee_id, vacation_year_start) do update
      set earned_days = excluded.earned_days, paid_days = excluded.paid_days, saved_days = excluded.saved_days,
          saved_in_days = excluded.saved_in_days, expired_days = excluded.expired_days, closed_at = excluded.closed_at;
    if x->'opening' <> 'null'::jsonb then
      insert into public.leave_balances (org_id, employee_id, year_start_month_day, vacation_year_start, earned_days, saved_in_days)
      values (p_org, (x->>'employeeId')::uuid, v_md, v_open, (x->'opening'->>'earnedDays')::numeric, (x->'opening'->>'savedInDays')::numeric)
      on conflict (employee_id, vacation_year_start) do update
        set earned_days = excluded.earned_days, saved_in_days = excluded.saved_in_days;
    end if;
    perform public.hr_log(p_org, (x->>'employeeId')::uuid, 'vacation.year_closed', jsonb_build_object(
      'year', p_year, 'vacationYearStart', (v_open - interval '1 year')::date, 'savedDays', v_saved, 'expiredDays', x->'expiredDays',
      'lapsedDays', x->'lapsedDays', 'openingEarnedDays', x->'opening'->'earnedDays'));
  end loop;
  insert into public.year_closings (org_id, year, vacation_year_start, semester, summary)
  values (p_org, p_year, (v_open - interval '1 year')::date, p_rows, public.year_summary(p_org, p_year))
  returning id into v_id;
  perform public.payroll_log(p_org, v_id, 'payroll.year_closed', jsonb_build_object('year', p_year, 'people', jsonb_array_length(p_rows)));
  return v_id;
end;
$$;

-- =====================================================================
-- 7. RLS och rättigheter
-- =====================================================================

alter table agi_declarations      enable row level security;
alter table agi_repayments        enable row level security;
alter table pension_reports       enable row level security;
alter table employer_certificates enable row level security;
alter table vaxa_stod_claims      enable row level security;
alter table year_closings         enable row level security;

create policy "agi_declarations_select" on agi_declarations
  for select to authenticated using (public.can_payroll_read(org_id));
create policy "agi_repayments_select" on agi_repayments
  for select to authenticated using (public.can_payroll_read(org_id));
create policy "pension_reports_select" on pension_reports
  for select to authenticated using (public.can_payroll_read(org_id));
-- Den anställde läser sina egna intyg (och PDF:en genom hinkens policy i 0035).
create policy "employer_certificates_select" on employer_certificates
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));
create policy "employer_certificates_insert" on employer_certificates
  for insert to authenticated with check (public.can_payroll_approve(org_id)
    and exists (select 1 from public.employees e where e.id = employee_id and e.org_id = employer_certificates.org_id));
create policy "vaxa_stod_claims_select" on vaxa_stod_claims
  for select to authenticated using (public.can_payroll_read(org_id));
create policy "year_closings_select" on year_closings
  for select to authenticated using (public.can_payroll_read(org_id));

revoke all on agi_declarations, agi_repayments, pension_reports, employer_certificates, vaxa_stod_claims, year_closings from anon, authenticated;
-- Filerna (med personnummer) läses bara genom agi_xml() och pension_report_file().
grant select (id, org_id, period, version, status, schema_version, sha256, tax_ore, contributions_ore, totals, records, run_ids, build_hash,
              filed_at, filed_by, filed_by_name, paid_at, paid_by, created_by, created_at) on agi_declarations to authenticated;
grant select (id, org_id, period, scheme, version, status, format, sha256, lines, total_ore, filed_at, filed_by, created_by, created_at)
  on pension_reports to authenticated;
grant select on agi_repayments, employer_certificates, vaxa_stod_claims, year_closings to authenticated;
grant insert (id, org_id, employee_id, from_date, to_date, reason, content, storage_path, sha256, size_bytes) on employer_certificates to authenticated;

revoke all on function public.agi_rules() from public, anon;
revoke all on function public.vacation_save_rules() from public, anon;
revoke all on function public.agi_build(uuid, text) from public, anon;
revoke all on function public.agi_build_hash(jsonb) from public, anon;
revoke all on function public.agi_store(uuid, text, text, jsonb) from public, anon;
revoke all on function public.agi_mark_filed(uuid) from public, anon;
revoke all on function public.agi_mark_paid(uuid, boolean) from public, anon;
revoke all on function public.agi_diff(uuid) from public, anon;
revoke all on function public.agi_xml(uuid) from public, anon;
revoke all on function public.agi_repayment_add(uuid, bigint, text, date) from public, anon;
revoke all on function public.pension_basis(uuid, text, text) from public, anon;
revoke all on function public.pension_report_store(uuid, text, text, text, jsonb) from public, anon;
revoke all on function public.pension_report_mark_filed(uuid) from public, anon;
revoke all on function public.pension_report_file(uuid) from public, anon;
revoke all on function public.vaxa_stod_basis(uuid, text) from public, anon;
revoke all on function public.vaxa_stod_claim_store(uuid, text, jsonb) from public, anon;
revoke all on function public.year_summary(uuid, int) from public, anon;
revoke all on function public.year_close(uuid, int, jsonb) from public, anon;
grant execute on function public.agi_rules() to authenticated;
grant execute on function public.vacation_save_rules() to authenticated;
grant execute on function public.agi_build(uuid, text) to authenticated;
grant execute on function public.agi_build_hash(jsonb) to authenticated;
grant execute on function public.agi_store(uuid, text, text, jsonb) to authenticated;
grant execute on function public.agi_mark_filed(uuid) to authenticated;
grant execute on function public.agi_mark_paid(uuid, boolean) to authenticated;
grant execute on function public.agi_diff(uuid) to authenticated;
grant execute on function public.agi_xml(uuid) to authenticated;
grant execute on function public.agi_repayment_add(uuid, bigint, text, date) to authenticated;
grant execute on function public.pension_basis(uuid, text, text) to authenticated;
grant execute on function public.pension_report_store(uuid, text, text, text, jsonb) to authenticated;
grant execute on function public.pension_report_mark_filed(uuid) to authenticated;
grant execute on function public.pension_report_file(uuid) to authenticated;
grant execute on function public.vaxa_stod_basis(uuid, text) to authenticated;
grant execute on function public.vaxa_stod_claim_store(uuid, text, jsonb) to authenticated;
grant execute on function public.year_summary(uuid, int) to authenticated;
grant execute on function public.year_close(uuid, int, jsonb) to authenticated;

commit;
