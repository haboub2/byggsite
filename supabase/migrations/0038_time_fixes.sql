-- Rättelser till 0037 (tid, schema och frånvaro) efter granskningen av fas 2.
-- Läggs på efter 0037_time.sql; 0037 ändras inte eftersom den redan körts.
--
-- 1. Projektkostnaden räknas i databasen. time_approve() tar inte längre
--    emot belopp från appen: timkostnaden är timlönen, eller månadslönen
--    × 12 / (52 × veckotimmar), plus arbetsgivaravgiften för personens
--    födelseår (employer_contribution_rules(), samma värden som
--    payrollRulesAt(...).employerContributions; contribution-parity.test.ts
--    håller dem lika). En vändning tar den vända radens timkostnad.
--    time_cost_basis() tas bort: den lät en projektledare (staff) läsa
--    kollegors lön och födelsedag.
-- 2. En inskickad rad som personen själv ändrar blir ett utkast igen, så att
--    godkännaren aldrig godkänner något annat än det hen såg.
-- 3. Ett projekt med godkänd tid tas inte bort (tydligt meddelande); utkast
--    och inskickade rader på ett projekt som tas bort blir utan projekt.

begin;

-- ---------------------------------------------------------------- 1. kostnaden

-- payrollRulesAt(...).employerContributions (lib/core/rules/payroll.ts):
-- full avgift, äldre (bara ålderspensionsavgift) efter födelseår, ingen
-- avgift för födda till och med exempt_born_up_to, och ungdomsnedsättningen
-- med sin giltighetstid. Ändras de där, ändras de här i en ny migration.
create or replace function public.employer_contribution_rules(
  out full_percent numeric, out older_percent numeric, out older_born_from int, out older_born_to int, out exempt_born_up_to int,
  out young_percent numeric, out young_born_from int, out young_born_to int, out young_from date, out young_to date)
  language sql immutable
as $$ select 31.42, 10.21, 1938, 1958, 1937, 20.81, 2003, 2007, date '2026-04-01', date '2027-09-30' $$;

-- Avgiften i procent för någon född p_birth, för arbete dag p_on
-- (contributionPercent i lib/core/hr/project-cost.ts). Okänd födelsedag: full avgift.
create or replace function public.employer_contribution_percent(p_birth date, p_on date) returns numeric
  language plpgsql immutable set search_path = public
as $$
declare
  r record := public.employer_contribution_rules();
  y int := extract(year from p_birth);
begin
  if p_birth is null then return r.full_percent; end if;
  if y <= r.exempt_born_up_to then return 0; end if;
  if y between r.older_born_from and r.older_born_to then return r.older_percent; end if;
  if y between r.young_born_from and r.young_born_to and p_on between r.young_from and r.young_to then return r.young_percent; end if;
  return r.full_percent;
end;
$$;

-- Intern kostnad per timme i öre (internalHourlyCost i project-cost.ts):
-- timlönen, eller månadslönen × 12 / (52 × veckotimmar) avrundad till öre,
-- där veckotimmarna är avtalets eller 40 × omfattningen; plus avgiften,
-- avrundad till öre. Null utan lön.
create or replace function public.time_hourly_cost_ore(p_pay_form text, p_monthly bigint, p_hourly bigint, p_weekly numeric,
                                                       p_time_percent numeric, p_birth date, p_on date) returns bigint
  language plpgsql immutable set search_path = public
as $$
declare
  v_pay bigint;
  v_bp numeric := round(public.employer_contribution_percent(p_birth, p_on) * 100);
begin
  if p_pay_form = 'hourly' and p_hourly is not null then
    v_pay := p_hourly;
  elsif p_pay_form = 'monthly' and p_monthly is not null then
    v_pay := round(p_monthly * 1200 / round(5200 * coalesce(p_weekly, 40 * coalesce(p_time_percent, 100) / 100)));
  else
    return null;
  end if;
  return v_pay + round(v_pay * v_bp / 10000.0);
end;
$$;

-- "8 h arbete", "10,5 h restid": timmarna utan onödiga nollor, med komma.
create or replace function public.time_cost_description(p_name text, p_date date, p_hours numeric, p_kind text) returns text
  language sql immutable
as $$
  select case when p_hours < 0 then 'Rättelse: ' else '' end
      || format('%s %s, %s%s h %s', p_name, p_date, case when p_hours < 0 then '−' else '' end,
                replace(rtrim(rtrim(abs(p_hours)::text, '0'), '.'), '.', ','),
                case p_kind when 'work' then 'arbete' when 'overtime' then 'övertid' when 'ob' then 'obekväm tid' when 'travel' then 'restid' else p_kind end)
$$;

drop function public.time_cost_basis(uuid[]);
drop function public.time_approve(uuid[], jsonb);

-- Godkänner inskickade rader och skriver projektkostnaden för rader med
-- projekt och sort arbete, övertid, OB eller restid, i samma transaktion.
create function public.time_approve(p_entries uuid[]) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  t public.time_entries%rowtype;
  v_ids uuid[] := '{}';
  v_actor text := coalesce(auth.jwt()->>'email', 'system');
  v_rate bigint;
  v_name text;
begin
  perform set_config('binaafy.time_approve', 'on', true);
  for t in select * from public.time_entries where id = any(p_entries) order by work_date for update loop
    if not public.time_entry_approvable(t) then
      raise exception 'Du får inte godkänna tiden för % (fel projekt, eller din egen tid).', t.work_date using errcode = '42501';
    end if;
    if t.status in ('approved','locked') then
      continue;
    end if;
    if t.status <> 'submitted' then
      raise exception 'Raden för % är inte inskickad.', t.work_date using errcode = '22023';
    end if;
    update public.time_entries set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = t.id;
    if t.project_id is not null and t.kind in ('work','overtime','ob','travel') then
      select name into v_name from public.employees where id = t.employee_id;
      v_rate := null;
      if t.hours < 0 then
        select c.hourly_rate_ore into v_rate from public.project_costs c where c.time_entry_id = t.corrects_id;
      end if;
      if v_rate is null then
        select public.time_hourly_cost_ore(v.pay_form, v.monthly_salary_ore, v.hourly_rate_ore, v.weekly_hours, v.working_time_percent, e.birth_date, t.work_date)
          into v_rate
          from public.employees e
          left join lateral (select x.* from public.employments x
                              where x.employee_id = t.employee_id and x.pay_form in ('monthly','hourly')
                                and x.valid_from <= t.work_date and (x.valid_to is null or x.valid_to >= t.work_date)
                                and x.starts_on <= t.work_date and (x.ends_on is null or x.ends_on >= t.work_date)
                              order by x.starts_on desc, x.version desc limit 1) v on true
         where e.id = t.employee_id;
      end if;
      if v_rate is null then
        raise exception '% har ingen anställning med lön den %; registrera avtalet innan tiden godkänns.', v_name, t.work_date using errcode = '22023';
      end if;
      insert into public.project_costs (org_id, project_id, kind, description, amount_ore, cost_date, hours, hourly_rate_ore, created_by, time_entry_id)
      values (t.org_id, t.project_id, 'hours', public.time_cost_description(v_name, t.work_date, t.hours, t.kind),
              round(t.hours * v_rate), t.work_date, t.hours, v_rate, v_actor, t.id);
    end if;
    v_ids := v_ids || t.id;
  end loop;
  perform set_config('binaafy.time_approve', 'off', true);
  if cardinality(v_ids) > 0 then
    perform public.time_log_batch(v_ids, 'time.approved');
  end if;
  return cardinality(v_ids);
end;
$$;

revoke all on function public.employer_contribution_rules() from public, anon;
revoke all on function public.employer_contribution_percent(date, date) from public, anon;
revoke all on function public.time_hourly_cost_ore(text, bigint, bigint, numeric, numeric, date, date) from public, anon;
revoke all on function public.time_cost_description(text, date, numeric, text) from public, anon;
revoke all on function public.time_approve(uuid[]) from public, anon;
grant execute on function public.employer_contribution_rules() to authenticated;
grant execute on function public.employer_contribution_percent(date, date) to authenticated;
grant execute on function public.time_hourly_cost_ore(text, bigint, bigint, numeric, numeric, date, date) to authenticated;
grant execute on function public.time_cost_description(text, date, numeric, text) to authenticated;
grant execute on function public.time_approve(uuid[]) to authenticated;

-- ---------------------------------------------------------------- 2. ändrad inskickad rad

-- Som 0037, och: ändrar personen (inte en lönegodkännare) något annat än
-- statusen på en inskickad rad blir den ett utkast igen och skickas in på nytt.
create or replace function public.time_entries_guard() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_old public.time_entries%rowtype;
begin
  if tg_op = 'DELETE' then
    if old.status in ('approved','locked') then
      raise exception 'En godkänd tidrad tas inte bort; gör en rättelse.' using errcode = '0A000';
    end if;
    if public.time_locked(old.org_id, old.work_date) then
      raise exception 'Perioden för % är låst.', old.work_date using errcode = '0A000';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status in ('approved','locked') then
      -- Det enda som får hända en godkänd rad: låsningen.
      if old.status = 'approved' and new.status = 'locked'
         and (to_jsonb(new) - 'status' - 'updated_at') = (to_jsonb(old) - 'status' - 'updated_at') then
        new.updated_at := now();
        return new;
      end if;
      raise exception 'En godkänd tidrad ändras inte; gör en rättelse.' using errcode = '0A000';
    end if;
    if new.corrects_id is distinct from old.corrects_id or new.employee_id <> old.employee_id or new.org_id <> old.org_id then
      raise exception 'Tidradens person och rättelse ändras inte.' using errcode = '0A000';
    end if;
    if public.time_locked(old.org_id, old.work_date) then
      raise exception 'Perioden för % är låst.', old.work_date using errcode = '0A000';
    end if;
    if old.status = 'submitted' and new.status = 'submitted'
       and (new.work_date, new.start_time, new.end_time, new.break_minutes, new.hours, new.kind, new.project_id, new.shift_id, new.note)
           is distinct from (old.work_date, old.start_time, old.end_time, old.break_minutes, old.hours, old.kind, old.project_id, old.shift_id, old.note)
       and auth.uid() is not null and not public.can_payroll_approve(new.org_id) then
      new.status := 'draft';
    end if;
  end if;

  if public.time_locked(new.org_id, new.work_date) then
    raise exception 'Perioden för % är låst; tid kan inte rapporteras, ändras eller godkännas där.', new.work_date using errcode = '0A000';
  end if;
  if new.status = 'locked' then
    raise exception 'Bara låsningen av en period låser tidrader.' using errcode = '0A000';
  end if;
  if new.project_id is not null and not exists (select 1 from public.portal_projects p where p.id = new.project_id and p.org_id = new.org_id) then
    raise exception 'Projektet finns inte i organisationen.' using errcode = '22023';
  end if;
  if new.start_time is not null and new.end_time is not null then
    -- Lika tider vore ett dygn; ett pass på 24 timmar skrivs som timmar.
    if new.start_time = new.end_time then
      raise exception 'Start och slut är samma klockslag.' using errcode = '22023';
    end if;
    new.hours := public.time_block_hours(new.start_time, new.end_time, new.break_minutes);
    if new.hours <= 0 then
      raise exception 'Rasten är längre än passet.' using errcode = '22023';
    end if;
  elsif new.start_time is not null then
    new.hours := 0;
  end if;
  if new.status in ('draft','submitted') then
    new.approved_by := null;
    new.approved_at := null;
  end if;
  if new.status = 'draft' then
    new.submitted_at := null;
  end if;

  if tg_op = 'INSERT' and new.corrects_id is not null then
    select * into v_old from public.time_entries where id = new.corrects_id;
    if not found or v_old.org_id <> new.org_id or v_old.employee_id <> new.employee_id then
      raise exception 'Rättelsen pekar på en rad som inte finns för personen.' using errcode = '22023';
    end if;
    if v_old.status = 'locked' then
      raise exception 'Raden är låst av lönekörningen; rättelsen görs i nästa lön.' using errcode = '0A000';
    end if;
    if v_old.status <> 'approved' then
      raise exception 'Bara godkända rader rättas; ändra utkastet i stället.' using errcode = '22023';
    end if;
    if v_old.hours < 0 then
      raise exception 'En vändning rättas inte; rätta ersättningsraden.' using errcode = '22023';
    end if;
    if new.hours < 0 and (new.hours <> -v_old.hours or new.kind <> v_old.kind or new.work_date <> v_old.work_date
                          or new.project_id is distinct from v_old.project_id) then
      raise exception 'Vändningen ska ha samma dag, sort, projekt och timmar (negativa) som raden den vänder.' using errcode = '22023';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------- 3. borttaget projekt

-- Godkänd tid är projektets kostnad och lönens underlag: projektet tas inte
-- bort (avsluta det i stället). Utkast och inskickade rader blir utan projekt.
create or replace function public.portal_projects_time_on_delete() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.time_entries where project_id = old.id and status in ('approved','locked')) then
    raise exception 'Projektet har godkänd tid och kan inte tas bort; markera det som avslutat i stället.' using errcode = '0A000';
  end if;
  update public.time_entries set project_id = null where project_id = old.id;
  return old;
end;
$$;
revoke all on function public.portal_projects_time_on_delete() from public, anon, authenticated;
create trigger portal_projects_time_on_delete before delete on portal_projects
  for each row execute function portal_projects_time_on_delete();

commit;
