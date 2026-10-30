-- Lagning av 0039: lyfter en databas där 0039_payroll.sql lades på i
-- versionen före granskningen (e66a1d6) till den granskade versionen
-- (a76fe6f). Läggs på efter 0041_authorities_fixes.sql. Där den granskade
-- 0039 redan är lagd (alla nya databaser) ändrar filen ingenting: varje
-- funktion är create or replace med samma text som i 0039, och varje
-- kolumn, villkor, trigger och policy läggs bara till eller byts om den
-- har den gamla formen. Ingenting med data tas bort.
--
-- 1. tax_table_imports: row_count och tables får standardvärden, row_count
--    får vara 0 och golden_passed null medan importen pågår, completed_at
--    är ny (befintliga importer, som alla kontrollerades i ett anrop, får
--    completed_at = imported_at), och de två nya villkoren. forbid_change
--    på tax_table_imports och tax_tables byts mot tax_table_imports_freeze()
--    och tax_tables_freeze().
-- 2. Importen i tre steg: tax_tables_import_begin/_rows/_finish, och
--    tax_tables_import() som anropar dem.
-- 3. pay_runs.inputs_hash och payroll_inputs_hash().
-- 4. payroll_run_store_result() sparar avtrycket och kräver en klar import,
--    payroll_run_approve() vägrar ett ändrat underlag och låser
--    tidsperioden, payroll_run_book() låser inte längre, payroll_run_close()
--    sparar avstämningen i totals.reconciliation.
-- 5. RLS: bara klara importer och deras rader syns.

begin;

-- =====================================================================
-- 1. tax_table_imports
-- =====================================================================

alter table tax_table_imports alter column row_count set default 0;
alter table tax_table_imports alter column tables set default '{}';
alter table tax_table_imports alter column golden_passed drop not null;
alter table tax_table_imports add column if not exists completed_at timestamptz;

drop trigger if exists tax_table_imports_immutable on tax_table_imports;
drop trigger if exists tax_tables_immutable on tax_tables;

-- Importerna före granskningen kontrollerades och lades in i ett anrop;
-- de är klara.
update tax_table_imports set completed_at = imported_at
 where completed_at is null and golden_passed and row_count > 0;

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.tax_table_imports'::regclass
              and conname = 'tax_table_imports_row_count_check'
              and pg_get_constraintdef(oid) = 'CHECK ((row_count > 0))') then
    alter table public.tax_table_imports drop constraint tax_table_imports_row_count_check;
    alter table public.tax_table_imports add constraint tax_table_imports_row_count_check check (row_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.tax_table_imports'::regclass
                  and contype = 'c' and pg_get_constraintdef(oid) = 'CHECK (((completed_at IS NULL) = (golden_passed IS NULL)))') then
    alter table public.tax_table_imports add constraint tax_table_imports_check check ((completed_at is null) = (golden_passed is null));
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.tax_table_imports'::regclass
                  and contype = 'c' and pg_get_constraintdef(oid) = 'CHECK (((completed_at IS NULL) OR (row_count > 0)))') then
    alter table public.tax_table_imports add constraint tax_table_imports_check1 check (completed_at is null or row_count > 0);
  end if;
end;
$$;

-- En klar import ändras aldrig; en oklar får bli klar en gång eller tas bort.
create or replace function public.tax_table_imports_freeze() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if old.completed_at is not null then
    raise exception 'En klar import av skattetabeller ändras inte.' using errcode = '0A000';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if (to_jsonb(new) - array['completed_at','golden_passed','row_count','tables'])
     <> (to_jsonb(old) - array['completed_at','golden_passed','row_count','tables']) then
    raise exception 'Importens uppgifter ändras inte.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
drop trigger if exists tax_table_imports_freeze on tax_table_imports;
create trigger tax_table_imports_freeze before update or delete on tax_table_imports
  for each row execute function tax_table_imports_freeze();

create or replace function public.tax_tables_freeze() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' or exists (select 1 from public.tax_table_imports i where i.id = old.import_id and i.completed_at is not null) then
    raise exception 'Raderna i en klar import ändras inte.' using errcode = '0A000';
  end if;
  return old;
end;
$$;
revoke all on function public.tax_tables_freeze() from public, anon, authenticated;
drop trigger if exists tax_tables_freeze on tax_tables;
create trigger tax_tables_freeze before update or delete on tax_tables
  for each row execute function tax_tables_freeze();

-- =====================================================================
-- 2. Importen i tre steg
-- =====================================================================

-- 1. Posten som `--out` skriver (utan raderna). Vägrar färre än tio
-- vektorer eller en vektor som inte stämde när filen lästes. En tidigare
-- avbruten import av samma fil tas bort.
create or replace function public.tax_tables_import_begin(p_record jsonb) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_old uuid;
begin
  if jsonb_typeof(p_record->'golden') <> 'array' or jsonb_array_length(p_record->'golden') < 10 then
    raise exception 'Minst tio kontrollvektorer krävs.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_record->'golden') g where coalesce((g->>'ok')::boolean, false) is not true) then
    raise exception 'Importen stoppad: en kontrollvektor stämde inte när filen lästes.' using errcode = '22023';
  end if;
  select id into v_old from public.tax_table_imports
   where year = (p_record->>'year')::int and sha256 = p_record->>'sha256' and completed_at is null;
  if v_old is not null then
    delete from public.tax_tables where import_id = v_old;
    delete from public.tax_table_imports where id = v_old;
  end if;
  insert into public.tax_table_imports (year, sha256, file_row_count, golden)
  values ((p_record->>'year')::int, p_record->>'sha256', (p_record->>'fileRowCount')::int, p_record->'golden')
  returning id into v_id;
  return v_id;
end;
$$;

-- 2. Rader (TaxTableRow i öre), i delar om några tusen.
create or replace function public.tax_tables_import_rows(p_import uuid, p_rows jsonb) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  i public.tax_table_imports;
  v_n int;
begin
  select * into i from public.tax_table_imports where id = p_import for update;
  if i.id is null or i.completed_at is not null then
    raise exception 'Importen finns inte eller är redan klar.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Delen har inga rader.' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r where (r->>'year')::int is distinct from i.year) then
    raise exception 'Raderna gäller ett annat år än importen.' using errcode = '22023';
  end if;
  insert into public.tax_tables (import_id, year, table_no, column_no, income_from_kr, income_to_kr, tax_kr, percent)
  select p_import, i.year, (r->>'tableNo')::int, (r->>'column')::int,
         ((r->>'incomeFromOre')::bigint / 100)::int,
         case when r->>'incomeToOre' is null then null else ((r->>'incomeToOre')::bigint / 100)::int end,
         case when r->>'taxOre' is null then null else ((r->>'taxOre')::bigint / 100)::int end,
         (r->>'percent')::numeric
    from jsonb_array_elements(p_rows) r;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- 3. Vektorerna mot de lagrade raderna. Stämmer alla blir importen klar;
-- annars tas den bort med sina rader och svaret säger varför (ett fel här
-- skulle rulla tillbaka borttagningen, så det är ett svar, inte ett fel).
create or replace function public.tax_tables_import_finish(p_import uuid) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  i public.tax_table_imports;
  v_vec jsonb;
  v_got int;
  v_problems text[] := '{}';
  v_n int;
begin
  select * into i from public.tax_table_imports where id = p_import for update;
  if i.id is null or i.completed_at is not null then
    raise exception 'Importen finns inte eller är redan klar.' using errcode = '22023';
  end if;
  select count(*) into v_n from public.tax_tables where import_id = p_import;
  if v_n = 0 then v_problems := v_problems || 'importen har inga rader'::text; end if;
  for v_vec in select g->'vector' from jsonb_array_elements(i.golden) g loop
    v_got := public.tax_table_lookup(p_import, (v_vec->>'table')::int, (v_vec->>'column')::int, (v_vec->>'monthlyPayKr')::int);
    if v_got is distinct from (v_vec->>'taxKr')::int then
      v_problems := v_problems || format('tabell %s kolumn %s %s kr ger %s kr, väntade %s kr', v_vec->>'table', v_vec->>'column',
                                         v_vec->>'monthlyPayKr', coalesce(v_got::text, 'inget'), v_vec->>'taxKr');
    end if;
  end loop;
  if cardinality(v_problems) > 0 then
    delete from public.tax_tables where import_id = p_import;
    delete from public.tax_table_imports where id = p_import;
    return jsonb_build_object('ok', false, 'problems', to_jsonb(v_problems));
  end if;
  update public.tax_table_imports set row_count = v_n, golden_passed = true, completed_at = now(),
         tables = array(select distinct table_no from public.tax_tables where import_id = p_import order by 1)
   where id = p_import;
  return jsonb_build_object('ok', true, 'id', p_import, 'rows', v_n);
end;
$$;

-- Allt i ett anrop (små filer och proven): fel om en vektor inte stämmer.
create or replace function public.tax_tables_import(p_record jsonb, p_rows jsonb) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid := public.tax_tables_import_begin(p_record);
  v_res jsonb;
begin
  perform public.tax_tables_import_rows(v_id, p_rows);
  v_res := public.tax_tables_import_finish(v_id);
  if not (v_res->>'ok')::boolean then
    raise exception 'Importen stoppad: %.', (select string_agg(x, '; ') from jsonb_array_elements_text(v_res->'problems') x) using errcode = '22023';
  end if;
  return v_id;
end;
$$;
revoke all on function public.tax_tables_import_begin(jsonb) from public, anon, authenticated;
revoke all on function public.tax_tables_import_rows(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tax_tables_import_finish(uuid) from public, anon, authenticated;
revoke all on function public.tax_tables_import(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.tax_tables_import_begin(jsonb) to service_role;
grant execute on function public.tax_tables_import_rows(uuid, jsonb) to service_role;
grant execute on function public.tax_tables_import_finish(uuid) to service_role;
grant execute on function public.tax_tables_import(jsonb, jsonb) to service_role;

-- =====================================================================
-- 3. Underlagets fingeravtryck
-- =====================================================================

alter table pay_runs add column if not exists inputs_hash text;

-- Fingeravtrycket av det en körning räknas från: tidraderna i tidsperioden
-- (låst räknas som godkänd), frånvaro det senaste året fram till periodens
-- slut, alla anställningsversioner och skatterader, personernas
-- födelsedatum, avtal och slutdatum, väntande rättelser och semesterår.
-- Ändras något av det mellan beräkning och godkännande, eller tas något
-- bort, ändras avtrycket.
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
    (select s.data->>'vacationYear' from public.payroll_settings s where s.org_id = r.org_id)))
  from public.pay_runs r where r.id = p_run
$$;
revoke all on function public.payroll_inputs_hash(uuid) from public, anon, authenticated;

-- =====================================================================
-- 4. Körningens steg (som i 0039; rättigheterna står kvar)
-- =====================================================================

-- Appen har räknat; här lagras resultatet och körningen blir "calculated".
-- p_result: {checks, ruleSetValidFrom, taxTableImportId, payslips: [{employeeId,
-- document, vacationLiabilityOre, pensionPremiumOre, correctionIds}]}.
-- Kontrollerna är summor och identiteter, ingen lönematematik.
create or replace function public.payroll_run_store_result(p_run uuid, p_result jsonb) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  r public.pay_runs;
  v_open text;
  v_ps jsonb;
  v_doc jsonb;
  v_t jsonb;
  v_emp uuid;
  v_id uuid;
  v_sum bigint;
  v_import uuid := nullif(p_result->>'taxTableImportId', '')::uuid;
  v_n int := 0;
begin
  select * into r from public.pay_runs where id = p_run for update;
  if r.id is null or not public.can_payroll_read(r.org_id) then
    raise exception 'Körningen finns inte.' using errcode = '42501';
  end if;
  if r.status not in ('draft','calculated') then
    raise exception 'Körningen är redan godkänd; rätta i nästa körning.' using errcode = '0A000';
  end if;
  -- Regel 3: bara godkänd tid.
  v_open := public.payroll_unapproved_time(p_run);
  if v_open is not null then
    raise exception 'Tid i perioden % – % är inte godkänd: %.', r.time_period_start, r.time_period_end, v_open using errcode = '22023';
  end if;
  -- Regel 4: en blockerande punkt på kontrollistan stoppar.
  if exists (select 1 from jsonb_array_elements(coalesce(p_result->'checks', '[]')) c where c->>'level' = 'block') then
    raise exception 'Kontrollistan har punkter som stoppar körningen: %.',
      (select string_agg(c->>'text', '; ') from jsonb_array_elements(p_result->'checks') c where c->>'level' = 'block')
      using errcode = '22023';
  end if;
  if jsonb_typeof(p_result->'payslips') <> 'array' or jsonb_array_length(p_result->'payslips') = 0 then
    raise exception 'Körningen har inga lönebesked.' using errcode = '22023';
  end if;

  delete from public.payslips where run_id = p_run;
  update public.payroll_corrections set target_run_id = null where target_run_id = p_run;

  for v_ps in select * from jsonb_array_elements(p_result->'payslips') loop
    v_doc := v_ps->'document';
    v_t := v_doc->'totals';
    v_emp := (v_ps->>'employeeId')::uuid;
    if (v_doc->>'employeeId')::uuid is distinct from v_emp
       or not exists (select 1 from public.employees where id = v_emp and org_id = r.org_id) then
      raise exception 'Lönebeskedet gäller en person som inte finns i organisationen.' using errcode = '22023';
    end if;
    if v_doc->>'periodStart' <> r.period_start::text or v_doc->>'payDate' <> r.pay_date::text then
      raise exception 'Lönebeskedet för % gäller en annan period eller lönedag.', v_doc->>'employeeName' using errcode = '22023';
    end if;
    if (v_t->>'netOre')::bigint <> (v_t->>'cashGrossOre')::bigint + (v_t->>'taxFreeReimbursementOre')::bigint
                                    - (v_t->>'taxOre')::bigint + (v_t->>'netAdjustmentOre')::bigint then
      raise exception 'Nettolönen för % stämmer inte med brutto och skatt.', v_doc->>'employeeName' using errcode = '23514';
    end if;
    select coalesce(sum((l->>'amountOre')::bigint), 0) into v_sum from jsonb_array_elements(v_doc->'lines') l;
    if v_sum <> (v_t->>'cashGrossOre')::bigint + (v_t->>'taxFreeReimbursementOre')::bigint
                 + (v_t->>'benefitOre')::bigint + (v_t->>'netAdjustmentOre')::bigint then
      raise exception 'Raderna för % summerar inte till lönebeskedets belopp.', v_doc->>'employeeName' using errcode = '23514';
    end if;
    if v_doc->>'taxTableVersion' is not null and not exists (
         select 1 from public.tax_table_imports i where i.id = v_import and i.sha256 = v_doc->>'taxTableVersion' and i.completed_at is not null) then
      raise exception 'Skattetabellen för % är inte den importerade tabellen körningen anger.', v_doc->>'employeeName' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_doc->'lines') l
                where not exists (select 1 from public.pay_items p where p.org_id = r.org_id and p.code = l->>'code'
                                    and p.version = (l->'item'->>'version')::int)) then
      raise exception 'Lönebeskedet för % har en löneart som inte finns i registret.', v_doc->>'employeeName' using errcode = '22023';
    end if;

    insert into public.payslips (org_id, run_id, employee_id, document, gross_ore, tax_ore, net_ore, employer_contribution_ore,
                                 contribution_rate, vacation_liability_ore, pension_premium_ore)
    values (r.org_id, p_run, v_emp, v_doc, (v_t->>'cashGrossOre')::bigint, (v_t->>'taxOre')::bigint, (v_t->>'netOre')::bigint,
            (v_t->>'employerContributionOre')::bigint, coalesce((v_doc->'contributions'->>'ratePercent')::numeric, 0),
            coalesce((v_ps->>'vacationLiabilityOre')::bigint, 0), coalesce((v_ps->>'pensionPremiumOre')::bigint, 0))
    returning id into v_id;

    insert into public.payslip_lines (org_id, payslip_id, run_id, employee_id, line_no, code, name, kind, item_version, text,
                                      quantity, unit, unit_price_ore, basis_ore, rate_percent, amount_ore, account, counter_account,
                                      agi_box, from_date, to_date)
    select r.org_id, v_id, p_run, v_emp, n, l->>'code', l->'item'->>'name', l->'item'->>'kind', (l->'item'->>'version')::int,
           coalesce(l->>'text', ''), (l->>'quantity')::numeric, l->>'unit', (l->>'unitPriceOre')::bigint, (l->>'basisOre')::bigint,
           (l->>'ratePercent')::numeric, (l->>'amountOre')::bigint, l->'item'->'flags'->>'account',
           l->'item'->'flags'->>'counterAccount', l->'item'->'flags'->>'agiBox', (l->>'from')::date, (l->>'to')::date
      from jsonb_array_elements(v_doc->'lines') with ordinality as x(l, n);

    update public.payroll_corrections set target_run_id = p_run
     where org_id = r.org_id and employee_id = v_emp and target_run_id is null
       and id in (select (c #>> '{}')::uuid from jsonb_array_elements(coalesce(v_ps->'correctionIds', '[]')) c);
    v_n := v_n + 1;
  end loop;

  update public.pay_runs set
    status = 'calculated',
    checks = coalesce(p_result->'checks', checks),
    checks_at = now(),
    rule_set_valid_from = (p_result->>'ruleSetValidFrom')::date,
    tax_table_import_id = v_import,
    computed_by = auth.uid(),
    computed_by_name = coalesce(auth.jwt()->>'email', ''),
    computed_at = now(),
    inputs_hash = public.payroll_inputs_hash(p_run),
    totals = (select jsonb_build_object(
                'payslips', count(*), 'grossOre', sum(gross_ore), 'taxOre', sum(tax_ore), 'netOre', sum(net_ore),
                'employerContributionOre', sum(employer_contribution_ore), 'vacationLiabilityOre', sum(vacation_liability_ore),
                'pensionPremiumOre', sum(pension_premium_ore))
                from public.payslips where run_id = p_run)
  where id = p_run;
  perform public.payroll_log(r.org_id, p_run, 'payroll.run_calculated', jsonb_build_object('payslips', v_n));
  return v_n;
end;
$$;

-- Fyra ögon: owner eller admin, inte den som räknade, och bland
-- godkännarna om lönebesluten har en lista. Fryser och numrerar i serien L.
create or replace function public.payroll_run_approve(p_run uuid) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  r public.pay_runs;
  v_open text;
  v_approvers jsonb;
  v_ps record;
  v_n int := 0;
begin
  select * into r from public.pay_runs where id = p_run for update;
  if r.id is null or not public.can_payroll_read(r.org_id) then
    raise exception 'Körningen finns inte.' using errcode = '42501';
  end if;
  if not public.can_payroll_approve(r.org_id) then
    raise exception 'Bara ägare och administratörer godkänner löner.' using errcode = '42501';
  end if;
  if r.status <> 'calculated' then
    raise exception 'Bara en beräknad körning kan godkännas (den är %).', r.status using errcode = '0A000';
  end if;
  if r.computed_by is not distinct from auth.uid() then
    raise exception 'Den som räknade lönen kan inte godkänna den; en annan ägare eller administratör godkänner.' using errcode = '42501';
  end if;
  select data->'approvers' into v_approvers from public.payroll_settings where org_id = r.org_id;
  if jsonb_typeof(v_approvers) = 'array' and jsonb_array_length(v_approvers) > 0
     and not v_approvers ? auth.uid()::text then
    raise exception 'Du är inte en av godkännarna i lönebesluten.' using errcode = '42501';
  end if;
  v_open := public.payroll_unapproved_time(p_run);
  if v_open is not null then
    raise exception 'Tid i perioden är inte godkänd: %. Räkna om körningen.', v_open using errcode = '22023';
  end if;
  if exists (select 1 from public.payslips where run_id = p_run and net_ore < 0) then
    raise exception 'Ett lönebesked har negativ nettolön; lägg avdraget som en fordran i stället.' using errcode = '22023';
  end if;
  -- Det frysta ska vara räknat på det som gäller nu: tid, frånvaro, avtal,
  -- skatt och rättelser får inte ha ändrats efter beräkningen.
  if r.inputs_hash is distinct from public.payroll_inputs_hash(p_run) then
    raise exception 'Underlaget har ändrats efter beräkningen; räkna om.' using errcode = '22023';
  end if;
  -- Tidsperioden låses nu, så att de frysta lönebeskeden och den låsta
  -- tiden är samma sak (en period som redan är låst lämnas).
  if not exists (select 1 from public.time_locks l where l.org_id = r.org_id
                  and l.period_start <= r.time_period_start and l.period_end >= r.time_period_end) then
    perform public.time_lock_period(r.org_id, r.time_period_start, r.time_period_end, 'Lönekörning ' || to_char(r.period_start, 'YYYY-MM'));
  end if;

  for v_ps in select p.id, p.employee_id, p.net_ore from public.payslips p join public.employees e on e.id = p.employee_id
               where p.run_id = p_run order by e.name, p.id loop
    update public.payslips set number = public.next_document_number(r.org_id, 'L'), approved_at = now() where id = v_ps.id;
    perform public.hr_log(r.org_id, v_ps.employee_id, 'payslip.approved',
      jsonb_build_object('payslipId', v_ps.id, 'runId', p_run, 'number', (select number from public.payslips where id = v_ps.id),
                         'period', to_char(r.period_start, 'YYYY-MM'), 'netOre', v_ps.net_ore));
    v_n := v_n + 1;
  end loop;
  update public.pay_runs set status = 'approved', approved_by = auth.uid(), approved_by_name = coalesce(auth.jwt()->>'email', ''),
         approved_at = now()
   where id = p_run;
  perform public.payroll_log(r.org_id, p_run, 'payroll.run_approved', jsonb_build_object('payslips', v_n, 'computedBy', r.computed_by_name));
  return v_n;
end;
$$;

-- En verifikation i serien V på lönedagen: lönearternas konton ur raderna,
-- förmånernas motkonto, skatt, netto och arbetsgivaravgifter ur
-- lönebeskeden (kontona ur payroll_settings.data.accounts), och appens
-- periodiseringar (semesterlöneskuld, tjänstepension) som balanserar för
-- sig. Låsta perioder vägras av journal_entries_check_lock. (Tidsperioden
-- låstes vid godkännandet.)
create or replace function public.payroll_run_book(p_run uuid, p_accruals jsonb default '[]') returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  r public.pay_runs;
  v_tax text;
  v_net text;
  v_cc text;
  v_cl text;
  v_fy int;
  v_no int;
  v_entry uuid;
  v_debit bigint;
  v_credit bigint;
begin
  select * into r from public.pay_runs where id = p_run for update;
  if r.id is null or not public.can_payroll_approve(r.org_id) then
    raise exception 'Bara ägare och administratörer bokför löner.' using errcode = '42501';
  end if;
  if r.status <> 'paid' then
    raise exception 'Körningen bokförs efter bankfilen (den är %).', r.status using errcode = '0A000';
  end if;
  v_tax := public.payroll_setting(r.org_id, array['accounts','tax'], '2710');
  v_net := public.payroll_setting(r.org_id, array['accounts','net'], '2820');
  v_cc := public.payroll_setting(r.org_id, array['accounts','contributionCost'], '7510');
  v_cl := public.payroll_setting(r.org_id, array['accounts','contributionLiability'], '2731');
  p_accruals := coalesce(p_accruals, '[]');
  if jsonb_typeof(p_accruals) <> 'array' then
    raise exception 'Periodiseringarna ska vara en lista.' using errcode = '22023';
  end if;
  select coalesce(sum((a->>'debitOre')::bigint), 0), coalesce(sum((a->>'creditOre')::bigint), 0) into v_debit, v_credit
    from jsonb_array_elements(p_accruals) a;
  if v_debit <> v_credit
     or exists (select 1 from jsonb_array_elements(p_accruals) a
                 where a->>'account' in (v_tax, v_net, v_cl) or (a->>'debitOre')::bigint < 0 or (a->>'creditOre')::bigint < 0) then
    raise exception 'Periodiseringarna balanserar inte eller rör skatt, netto eller avgiftsskulden.' using errcode = '23514';
  end if;

  v_fy := public.fiscal_year_of(r.org_id, r.pay_date);
  v_no := public.next_document_number(r.org_id, 'V', v_fy);
  insert into public.journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type, source_id, created_by)
  values (r.org_id, 'V', v_fy, v_no, r.pay_date, 'Lön ' || to_char(r.period_start, 'YYYY-MM'), 'payroll', p_run,
          coalesce(auth.jwt()->>'email', 'system'))
  returning id into v_entry;

  insert into public.journal_lines (org_id, entry_id, account, debit_ore, credit_ore, text)
  select r.org_id, v_entry, account, greatest(amount, 0), greatest(-amount, 0), text
    from (
      select account, sum(amount) amount, min(text) text from (
        select l.account, l.amount_ore amount, 'Lön' text from public.payslip_lines l where l.run_id = p_run
        union all
        select l.counter_account, -l.amount_ore, 'Motkonto förmåner' from public.payslip_lines l where l.run_id = p_run and l.kind = 'benefit'
        union all
        select v_tax, -sum(p.tax_ore), 'Personalskatt' from public.payslips p where p.run_id = p_run
        union all
        select v_net, -sum(p.net_ore), 'Nettolön' from public.payslips p where p.run_id = p_run
        union all
        select v_cc, sum(p.employer_contribution_ore), 'Arbetsgivaravgifter' from public.payslips p where p.run_id = p_run
        union all
        select v_cl, -sum(p.employer_contribution_ore), 'Arbetsgivaravgifter' from public.payslips p where p.run_id = p_run
      ) x group by account
    ) y
   where amount <> 0;

  insert into public.journal_lines (org_id, entry_id, account, debit_ore, credit_ore, text)
  select r.org_id, v_entry, a->>'account', (a->>'debitOre')::bigint, (a->>'creditOre')::bigint, coalesce(a->>'text', 'Periodisering')
    from jsonb_array_elements(p_accruals) a
   where (a->>'debitOre')::bigint <> 0 or (a->>'creditOre')::bigint <> 0;

  select coalesce(sum(debit_ore), 0), coalesce(sum(credit_ore), 0) into v_debit, v_credit from public.journal_lines where entry_id = v_entry;
  if v_debit <> v_credit then
    raise exception 'Lönens verifikation balanserar inte: debet % öre, kredit % öre.', v_debit, v_credit using errcode = '23514';
  end if;

  update public.pay_runs set status = 'booked', journal_entry_id = v_entry, booked_at = now(),
         totals = totals || jsonb_build_object('accrualsOre', (select coalesce(sum((a->>'debitOre')::bigint), 0) from jsonb_array_elements(p_accruals) a))
   where id = p_run;
  perform public.payroll_log(r.org_id, p_run, 'payroll.run_booked', jsonb_build_object('journalEntryId', v_entry, 'entry', v_fy || '-' || v_no));
  return v_entry;
end;
$$;

create or replace function public.payroll_run_close(p_run uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  r public.pay_runs;
  c record;
begin
  select * into r from public.pay_runs where id = p_run for update;
  if r.id is null or not public.can_payroll_approve(r.org_id) then
    raise exception 'Bara ägare och administratörer stänger en körning.' using errcode = '42501';
  end if;
  if r.status <> 'booked' then
    raise exception 'Körningen stängs efter bokföringen (den är %).', r.status using errcode = '0A000';
  end if;
  select * into c from public.payroll_reconciliation(p_run);
  if not c.ok then
    raise exception 'Avstämningen går inte ihop: lönebesked %, rader %, verifikation %, bankfil % (öre); skatt % mot %, avgifter % mot %.',
      c.payslips_ore, c.lines_ore, c.journal_ore, c.bank_ore, c.tax_ore, c.journal_tax_ore, c.contributions_ore, c.journal_contributions_ore
      using errcode = '23514';
  end if;
  -- Summorna sparas på körningen, så att rapporterna läser dem utan att räkna om.
  update public.pay_runs set status = 'closed', closed_at = now(),
         totals = totals || jsonb_build_object('reconciliation', jsonb_build_object(
           'payslipsOre', c.payslips_ore, 'linesOre', c.lines_ore, 'journalOre', c.journal_ore, 'bankOre', c.bank_ore,
           'taxOre', c.tax_ore, 'journalTaxOre', c.journal_tax_ore, 'contributionsOre', c.contributions_ore,
           'journalContributionsOre', c.journal_contributions_ore, 'ok', c.ok))
   where id = p_run;
  perform public.payroll_log(r.org_id, p_run, 'payroll.run_closed', jsonb_build_object('netOre', c.payslips_ore));
end;
$$;

-- =====================================================================
-- 5. RLS
-- =====================================================================

-- Bara klara importer syns; en halvfärdig används aldrig.
drop policy if exists "tax_table_imports_select" on tax_table_imports;
create policy "tax_table_imports_select" on tax_table_imports
  for select to authenticated using (completed_at is not null);
drop policy if exists "tax_tables_select" on tax_tables;
create policy "tax_tables_select" on tax_tables
  for select to authenticated using (exists (select 1 from public.tax_table_imports i where i.id = import_id and i.completed_at is not null));

commit;
