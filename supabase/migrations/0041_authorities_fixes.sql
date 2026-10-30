-- Granskningen av fas 4 (docs/hr-lon.md, Läge fas 4). Läggs på efter
-- 0040, som redan är körd och inte ändras.
--
-- 1. agi_build(): en körning med lönedag i månaden som är godkänd men inte
--    stängd (approved, paid, booked) är ett problem, så att AGI inte kan
--    skapas utan den. 0040:s funktion heter nu agi_build_sums() och
--    anropas av den nya; agi_store() läser problemen som förut.
-- 2. vaxa_stod_claim_store(): taket och månaden räknas ur personens
--    anställning (vaxa_employment_start(), som employmentStart() i
--    vaxa-stod.ts), inte ur det appen skickar.
-- 3. agi_mark_paid(): bara en lämnad version kan markeras betald.
-- 4. payroll_corrections.agi_refile används inte (en rättelse redovisas den
--    månad den betalas); standardvärdet blir false.

begin;

-- =====================================================================
-- 1. Öppna körningar stoppar AGI
-- =====================================================================

alter function public.agi_build(uuid, text) rename to agi_build_sums;
revoke all on function public.agi_build_sums(uuid, text) from public, anon, authenticated;

create or replace function public.agi_build(p_org uuid, p_period text) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
declare
  v_build jsonb := public.agi_build_sums(p_org, p_period);
  v_open jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(
           'Körningen för ' || (array['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'])[extract(month from r.period_start)::int]
           || ' ' || extract(year from r.period_start)::int || ' (lönedag ' || r.pay_date
           || ') är inte stängd; stäng den innan arbetsgivardeklarationen skapas.') order by r.pay_date, r.period_start), '[]'::jsonb)
    into v_open
    from public.pay_runs r
   where r.org_id = p_org and to_char(r.pay_date, 'YYYY-MM') = p_period and r.status in ('approved','paid','booked');
  return jsonb_set(v_build, '{problems}', (v_build->'problems') || v_open);
end;
$$;
revoke all on function public.agi_build(uuid, text) from public, anon;
grant execute on function public.agi_build(uuid, text) to authenticated;

-- =====================================================================
-- 2. Växa-stöd: taket och månaden ur anställningen
-- =====================================================================

-- Taket för anställning efter 2024-04-30, taket för tidigare, återbetalningen
-- i baspunkter (full avgift − ålderspensionsavgift) och antalet månader
-- (regelboken vaxaStod; prov i authorities-parity.test.ts).
create or replace function public.vaxa_rules(out cap_ore bigint, out cap_earlier_ore bigint, out earlier_until date, out keep_bp int, out months int)
  language sql immutable
as $$ select 3500000::bigint, 2500000::bigint, date '2024-04-30', 2121, 24 $$;
revoke all on function public.vaxa_rules() from public, anon;
grant execute on function public.vaxa_rules() to authenticated;

-- Början på den anställning som pågår fram till p_to: tidigaste start i en
-- följd av avtal som möts eller överlappar (inte arvode), som
-- employmentStart() i vaxa-stod.ts.
create or replace function public.vaxa_employment_start(p_employee uuid, p_to date) returns date
  language plpgsql stable security definer set search_path = public
as $$
declare
  s record;
  v_start date;
  v_end date;
  v_open boolean := false;
begin
  for s in select e.starts_on, e.ends_on from public.employments e
            where e.employee_id = p_employee and e.pay_form <> 'fee' and e.starts_on <= p_to
            order by e.starts_on loop
    if v_start is null or (not v_open and v_end is not null and s.starts_on > v_end + 1) then
      v_start := s.starts_on;
      v_end := s.ends_on;
    elsif s.ends_on is null or (v_end is not null and s.ends_on > v_end) then
      v_end := s.ends_on;
    end if;
    v_open := v_end is null;
  end loop;
  return v_start;
end;
$$;
revoke all on function public.vaxa_employment_start(uuid, date) from public, anon, authenticated;

-- Som 0040, men taket (35 000 eller 25 000 kr) och månaden (1–24) räknas
-- här ur anställningens början; appens värden måste vara dessa.
create or replace function public.vaxa_stod_claim_store(p_org uuid, p_period text, p_rows jsonb) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  v record := public.vaxa_rules();
  v_first date := (p_period || '-01')::date;
  v_last date := ((p_period || '-01')::date + interval '1 month' - interval '1 day')::date;
  v_basis jsonb;
  x jsonb;
  v_start date;
  v_cap bigint;
  v_month int;
  v_capped bigint;
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
    if not exists (select 1 from public.employees where id = (x->>'employeeId')::uuid and org_id = p_org) then
      raise exception 'Personen finns inte i organisationen.' using errcode = '22023';
    end if;
    v_start := public.vaxa_employment_start((x->>'employeeId')::uuid, v_last);
    if v_start is null then
      raise exception 'Personen har ingen anställning i %.', p_period using errcode = '23514';
    end if;
    v_cap := case when v_start > v.earlier_until then v.cap_ore else v.cap_earlier_ore end;
    v_month := (extract(year from v_first)::int * 12 + extract(month from v_first)::int) - (extract(year from v_start)::int * 12 + extract(month from v_start)::int) + 1;
    v_capped := least((x->>'baseOre')::bigint / 100 * 100, v_cap);
    if (x->>'cappedBaseOre')::bigint <> v_capped then
      raise exception 'Taket är % kr (anställd från %); underlaget inom taket är % kr.', v_cap / 100, v_start, v_capped / 100 using errcode = '23514';
    end if;
    if (x->>'monthNo')::int is distinct from v_month or v_month > v.months then
      raise exception 'Månad % av anställningen (från %); stödet gäller % månader.', v_month, v_start, v.months using errcode = '23514';
    end if;
    if not exists (select 1 from jsonb_array_elements(v_basis) b
                    where b->>'employeeId' = x->>'employeeId' and (b->>'contributionBaseOre')::bigint = (x->>'baseOre')::bigint
                      and b->'categories' = '["full"]'::jsonb)
       or (x->>'refundOre')::bigint <> trunc(v_capped * v.keep_bp / 1000000) * 100 then
      raise exception 'Raden för % stämmer inte med månadens underlag.', x->>'employeeId' using errcode = '23514';
    end if;
    insert into public.vaxa_stod_claims (org_id, period, employee_id, month_no, base_ore, capped_base_ore, refund_ore)
    values (p_org, p_period, (x->>'employeeId')::uuid, v_month, (x->>'baseOre')::bigint, v_capped, (x->>'refundOre')::bigint);
    perform public.hr_log(p_org, (x->>'employeeId')::uuid, 'vaxa_stod.applied',
      jsonb_build_object('period', p_period, 'refundOre', (x->>'refundOre')::bigint, 'monthNo', v_month));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- =====================================================================
-- 3. Betalt bara för en lämnad version
-- =====================================================================

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
  if p_paid and d.status <> 'filed' then
    raise exception 'Version % är inte lämnad; markera den som lämnad innan skattekontot markeras betalt.', d.version using errcode = '0A000';
  end if;
  update public.agi_declarations set paid_at = case when p_paid then coalesce(paid_at, now()) end, paid_by = case when p_paid then auth.uid() end
   where id = p_id;
  perform public.payroll_log(d.org_id, d.id, case when p_paid then 'agi.paid' else 'agi.unpaid' end,
    jsonb_build_object('period', d.period, 'version', d.version, 'amountOre', d.tax_ore + d.contributions_ore));
end;
$$;

-- =====================================================================
-- 4. agi_refile används inte
-- =====================================================================

alter table payroll_corrections alter column agi_refile set default false;
comment on column payroll_corrections.agi_refile is
  'Används inte (0041): en rättelse i en senare körning redovisas i AGI för den månad den betalas. Återbetald lön som rättar originalmånaden är agi_repayments (0040).';

commit;
