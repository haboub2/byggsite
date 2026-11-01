-- Arbetstidslagen i tidrapporteringen (docs/juridisk-granskning-2026-10-31.md,
-- Tid H2 och H3; ATL 6, 8, 8 a, 9, 10, 10 a §§).
--
-- * Två nya sorter: mertid (deltidsanställdas timmar utöver avtalet upp till
--   heltid, 10 §) och jour (jourtid på arbetsstället, 6 §; beredskap i hemmet
--   är on_call). Mertid är arbetad tid och kostar på projektet som arbete.
-- * overtime_kind på övertidsrader: allmän (8 §), extra (8 a §) eller nödfall
--   (9 §, utanför 8 §-taken). Null på andra sorter; saknas på gamla rader,
--   vilket läses som allmän.
-- * time_approve och time_cost_description tar med mertid i projektkostnaden.

begin;

alter table time_entries drop constraint if exists time_entries_kind_check;
alter table time_entries add constraint time_entries_kind_check
  check (kind in ('work','overtime','mertid','jour','ob','travel','on_call'));

alter table time_entries add column if not exists overtime_kind text
  check (overtime_kind is null or overtime_kind in ('allman','extra','nodfall'));
alter table time_entries drop constraint if exists time_entries_overtime_kind_only_on_overtime;
alter table time_entries add constraint time_entries_overtime_kind_only_on_overtime
  check (kind = 'overtime' or overtime_kind is null);

create or replace function public.time_cost_description(p_name text, p_date date, p_hours numeric, p_kind text) returns text
  language sql immutable
as $$
  select case when p_hours < 0 then 'Rättelse: ' else '' end
      || format('%s %s, %s%s h %s', p_name, p_date, case when p_hours < 0 then '−' else '' end,
                replace(rtrim(rtrim(abs(p_hours)::text, '0'), '.'), '.', ','),
                case p_kind when 'work' then 'arbete' when 'overtime' then 'övertid' when 'ob' then 'obekväm tid' when 'mertid' then 'mertid' when 'travel' then 'restid' else p_kind end)
$$;

create or replace function public.time_approve(p_entries uuid[]) returns int
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
    if t.project_id is not null and t.kind in ('work','overtime','mertid','ob','travel') then
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

commit;
