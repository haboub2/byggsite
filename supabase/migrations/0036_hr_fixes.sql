-- Rättelser till 0035 (personal och anställningar) efter granskningen av fas 1.
-- Läggs på efter 0035_hr.sql; 0035 ändras inte eftersom den redan körts.
--
-- 1. employment_periods(): på varandra följande versioner av samma avtal och
--    form slås bara ihop när de möts (nästa börjar senast dagen efter att
--    den förra slutar). En förlängning som registreras efter slutdagen
--    räknade annars luckan som SÄVA- eller vikariatstid.
-- 2. employee_tax: flera rader får gälla från samma datum. Den senast
--    inlagda vinner, så en felskriven tabell kan rättas för samma period.
-- 3. hr_sign_document(): ett avtal får markeras som signerat från
--    anställningens startdag (pappersavtal från före registret), aldrig i
--    framtiden.
-- 4. employment_clocks() får ett valfritt person-filter, så att en enda
--    persons klocka (avtalet) inte räknar hela organisationen.
-- 5. hr_find_employee_by_pnr() tas bort; appen använder den inte
--    (hr_create_employee() stoppar dubbletter själv).

begin;

-- ---------------------------------------------------------------- 1. perioder

-- En persons perioder ur anställningsversionerna (lib/core/hr/clocks.ts,
-- employmentPeriods): varje version gäller från max(starts_on, valid_from)
-- till min(ends_on, valid_to) (en provanställning också högst till
-- probation_ends_on). En version börjar en ny period när formen byts eller
-- när den inte möter den förra versionen (lucka mellan dem).
create or replace function public.employment_periods(p_employee uuid) returns public.las_period[]
  language sql stable set search_path = public
as $$
  with v as (
    select contract_id, version, form,
           greatest(starts_on, valid_from) as f,
           least(ends_on, valid_to, case when form = 'provanstallning' then probation_ends_on end) as t
      from public.employments
     where employee_id = p_employee
  ), live as (
    select * from v where t is null or t >= f
  ), flagged as (
    select *,
           case when lag(form) over w is distinct from form then 1
                when lag(t) over w is not null and f > lag(t) over w + 1 then 1
                else 0 end as starts_period
      from live
    window w as (partition by contract_id order by version)
  ), islands as (
    select *, sum(starts_period) over (partition by contract_id order by version) as island from flagged
  ), merged as (
    select contract_id, island, min(form) as form, min(f) as f,
           case when bool_or(t is null) then null else max(t) end as t
      from islands group by contract_id, island
  )
  select coalesce(array_agg((form, f, t)::public.las_period order by f, contract_id, island), '{}') from merged
$$;

-- ---------------------------------------------------------------- 2. skatterader

alter table employee_tax drop constraint employee_tax_employee_id_valid_from_key;
drop index if exists employee_tax_employee_idx;
create index employee_tax_employee_idx on employee_tax (employee_id, valid_from desc, created_at desc);

-- ---------------------------------------------------------------- 3. signering

create or replace function public.hr_sign_document(p_document uuid, p_signed_on date) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_doc public.employment_documents%rowtype;
  v_start date;
begin
  select * into v_doc from public.employment_documents where id = p_document;
  if not found or not public.can_payroll_approve(v_doc.org_id) then
    raise exception 'Bara ägare och administratörer markerar avtal som signerade.' using errcode = '42501';
  end if;
  -- Avtalets första startdag, över alla versioner.
  select min(e.starts_on) into v_start
    from public.employments e
   where e.contract_id = (select contract_id from public.employments where id = v_doc.employment_id);
  -- En dags marginal framåt: databasens datum är UTC, Sverige kan ligga före.
  if p_signed_on is null or p_signed_on > current_date + 1 or p_signed_on < v_start then
    raise exception 'Signeringsdatumet ska vara mellan anställningens start (%) och i dag.', v_start using errcode = '22023';
  end if;
  update public.employment_documents
     set signed_at = p_signed_on, signed_marked_by = auth.uid(), signed_marked_at = now()
   where id = p_document;
  update public.employments set document_id = p_document where id = v_doc.employment_id;
end;
$$;

-- ---------------------------------------------------------------- 4. klockor per person

-- Två argument fungerar som förut (hela organisationen); p_employee ger en
-- person. Personer utan SÄVA, vikariat eller provanställning får nollor
-- utan att räknas.
drop function public.employment_clocks(uuid, date);
create function public.employment_clocks(p_org uuid, p_as_of date default current_date, p_employee uuid default null)
returns table (
  employee_id uuid,
  sava_days int, sava_limit int, sava_days_left int, sava_converted boolean, sava_converts_on date,
  vikariat_days int, vikariat_limit int, vikariat_days_left int, vikariat_converted boolean, vikariat_converts_on date,
  probation_starts_on date, probation_ends_on date, probation_notice_by date, probation_days_left int, probation_converts_on date
)
  language sql stable set search_path = public
as $$
  select e.id, c.*
    from public.employees e
    cross join lateral public.las_clocks(
      case when exists (select 1 from public.employments x
                         where x.employee_id = e.id and x.form in ('sava', 'vikariat', 'provanstallning'))
           then public.employment_periods(e.id)
           else '{}'::public.las_period[] end,
      p_as_of) c
   where e.org_id = p_org
     and (p_employee is null or e.id = p_employee)
   order by e.name
$$;
revoke all on function public.employment_clocks(uuid, date, uuid) from public, anon;
grant execute on function public.employment_clocks(uuid, date, uuid) to authenticated;

-- ---------------------------------------------------------------- 5. oanvänd funktion

drop function public.hr_find_employee_by_pnr(uuid, text);

commit;
