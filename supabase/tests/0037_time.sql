-- RLS- och funktionsprov för 0037 (tid, schema och frånvaro, docs/hr-lon.md
-- fas 2). Körs i Supabase SQL-editor efter 0037, eller lokalt med
-- supabase/tests/local/run.sh. Allt sker i en transaktion som rullas
-- tillbaka; "Prov 0037: alla gick igenom" betyder att allt höll.
--
--   A1  owner i A             A2  redovisningskonsult i A
--   A3  personal (staff) i A, leder projektet P1
--   A4  anställd, är Erik (månadslön, schema)
--   A5  anställd, är Fatima (behovsanställd: SÄVA med timlön)
--   B1  owner i B
--
-- Gustav är också behovsanställd men har ingen inloggning.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000037a1', 'a-agare@prov37.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000037a2', 'a-konsult@prov37.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000037a3', 'a-ledare@prov37.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000037a4', 'erik@prov37.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000037a5', 'fatima@prov37.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000037b1', 'b-agare@prov37.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a1","role":"authenticated","email":"a-agare@prov37.se"}';
insert into prov values ('a', create_organization('Prov A AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037b1","role":"authenticated","email":"b-agare@prov37.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));

reset role;
insert into memberships (org_id, user_id, role) values
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000037a2', 'accountant'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000037a3', 'staff');

-- ---------------------------------------------------------------- A1: personal, avtal, projekt, schema

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a1","role":"authenticated","email":"a-agare@prov37.se"}';

insert into prov values
  ('erik',   hr_create_employee((select v from prov where k = 'a'), '{"name":"Erik Eriksson","email":"erik@prov37.se"}', '199206301234')),
  ('fatima', hr_create_employee((select v from prov where k = 'a'), '{"name":"Fatima Falk","email":"fatima@prov37.se"}', null)),
  ('gustav', hr_create_employee((select v from prov where k = 'a'), '{"name":"Gustav Gran"}', null));

insert into employments (org_id, employee_id, form, pay_form, monthly_salary_ore, weekly_hours, starts_on, valid_from, vacation_rule) values
  ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'tillsvidare', 'monthly', 3200000, 40, '2025-01-01', '2025-01-01', 'sammalon');
insert into prov select 'erik_e', id from employments where employee_id = (select v from prov where k = 'erik');
-- Ramavtalen "vid behov": ett tidigare pass var, SÄVA med timlön.
insert into employments (org_id, employee_id, form, pay_form, hourly_rate_ore, starts_on, ends_on, valid_from, vacation_rule, vacation_percent, pension_scheme) values
  ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), 'sava', 'hourly', 18000, '2026-09-01', '2026-09-01', '2026-09-01', 'procent', 12, 'saf-lo'),
  ((select v from prov where k = 'a'), (select v from prov where k = 'gustav'), 'sava', 'hourly', 17500, '2026-08-15', '2026-08-15', '2026-08-15', 'procent', 12, 'none');

insert into portal_projects (org_id, title, leader_user_id) values
  ((select v from prov where k = 'a'), 'P1 Köket', '00000000-0000-4000-8000-0000000037a3'),
  ((select v from prov where k = 'a'), 'P2 Badrummet', null);
insert into prov select 'p1', id from portal_projects where title = 'P1 Köket' and org_id = (select v from prov where k = 'a');
insert into prov select 'p2', id from portal_projects where title = 'P2 Badrummet' and org_id = (select v from prov where k = 'a');

insert into prov values ('erik_s1', hr_set_schedule((select v from prov where k = 'erik_e'),
  '[{"weekday":1,"start":"07:00","end":"16:00","breakMinutes":60},{"weekday":2,"start":"07:00","end":"16:00","breakMinutes":60},
    {"weekday":3,"start":"07:00","end":"16:00","breakMinutes":60},{"weekday":4,"start":"07:00","end":"16:00","breakMinutes":60},
    {"weekday":5,"start":"07:00","end":"16:00","breakMinutes":60}]'));

do $$
declare
  n int;
  v_s2 uuid;
begin
  if (select schedule_id from employments where id = (select v from prov where k = 'erik_e')) is distinct from (select v from prov where k = 'erik_s1') then
    raise exception 'Eriks version fick inte schemat';
  end if;
  -- Ett nytt schema är en ny version; den förra behåller sitt.
  v_s2 := hr_set_schedule((select v from prov where k = 'erik_e'), '[{"weekday":1,"start":"06:00","end":"15:00","breakMinutes":60}]', '2026-12-01');
  select count(*) into n from employments where contract_id = (select v from prov where k = 'erik_e');
  if n <> 2 then raise exception 'Nytt schema gav % versioner, väntade 2.', n; end if;
  if (select schedule_id from employments where contract_id = (select v from prov where k = 'erik_e') and version = 2) <> v_s2
     or (select schedule_id from employments where id = (select v from prov where k = 'erik_e')) <> (select v from prov where k = 'erik_s1') then
    raise exception 'Schemaversionerna stämmer inte';
  end if;
  -- Ett använt schema får inga nya rader, och versionens schema byts inte.
  begin
    insert into schedule_rules (org_id, schedule_id, weekday, start_time, end_time) values ((select v from prov where k = 'a'), v_s2, 2, '06:00', '15:00');
    raise exception 'Ett använt schema fick en ny rad';
  exception when feature_not_supported then null;
  end;
  begin
    update employments set schedule_id = v_s2 where id = (select v from prov where k = 'erik_e');
    raise exception 'Versionens schema kunde bytas';
  exception when insufficient_privilege or feature_not_supported then null;
  end;
  begin
    perform hr_set_schedule((select v from prov where k = 'erik_e'), '[{"weekday":1,"start":"07:00","end":"08:00","breakMinutes":90}]', '2027-01-01');
    raise exception 'Rasten längre än passet gick in';
  exception when check_violation then null;
  end;
end $$;

-- De anställda bjuds in och kopplas via e-postadressen.
reset role;
insert into memberships (org_id, user_id, role) values
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000037a4', 'employee'),
  ((select v from prov where k = 'a'), '00000000-0000-4000-8000-0000000037a5', 'employee');

-- ---------------------------------------------------------------- Erik rapporterar en vecka

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a4","role":"authenticated","email":"erik@prov37.se"}';

with x as (
  insert into time_entries (org_id, employee_id, work_date, start_time, end_time, break_minutes, hours, project_id)
  select (select v from prov where k = 'a'), (select v from prov where k = 'erik'), d::date, '07:00', '16:00', 60, 0,
         case when extract(isodow from d) = 5 then (select v from prov where k = 'p2') else (select v from prov where k = 'p1') end
    from generate_series('2026-10-19'::date, '2026-10-23'::date, interval '1 day') d
  returning id, work_date
)
insert into prov select 'erik_' || to_char(work_date, 'DD'), id from x;
with x as (
  insert into time_entries (org_id, employee_id, work_date, hours, kind, project_id, note)
  values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), '2026-10-21', 1.5, 'travel', (select v from prov where k = 'p1'), 'Till grossisten')
  returning id
)
insert into prov select 'erik_travel', id from x;

do $$
declare
  n int;
begin
  if (select hours from time_entries where id = (select v from prov where k = 'erik_19')) <> 8 then
    raise exception 'Timmarna räknades inte ur tiderna: %', (select hours from time_entries where id = (select v from prov where k = 'erik_19'));
  end if;
  n := time_submit(array(select v from prov where k like 'erik\_%' and k not in ('erik_e', 'erik_s1')));
  if n <> 6 then raise exception 'Erik skickade in % rader, väntade 6.', n; end if;
  -- Erik godkänner inte sin egen tid, varken med funktionen eller direkt.
  begin
    perform time_approve(array[(select v from prov where k = 'erik_19')]);
    raise exception 'Erik kunde godkänna sin tid';
  exception when insufficient_privilege then null;
  end;
  begin
    update time_entries set status = 'approved', approved_at = now() where id = (select v from prov where k = 'erik_19');
    raise exception 'Erik kunde sätta sin rad som godkänd';
  exception when insufficient_privilege then null;
  end;
  -- Ingen tid åt någon annan.
  begin
    insert into time_entries (org_id, employee_id, work_date, hours) values ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), '2026-10-20', 8);
    raise exception 'Erik kunde rapportera tid åt Fatima';
  exception when insufficient_privilege then null;
  end;
  -- Stämpla in och ut: en öppen instämpling åt gången, timmarna vid utstämplingen.
  insert into time_entries (org_id, employee_id, work_date, start_time, hours, source)
  values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), '2026-10-26', '07:00', 0, 'clock');
  begin
    insert into time_entries (org_id, employee_id, work_date, start_time, hours, source)
    values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), '2026-10-26', '12:00', 0, 'clock');
    raise exception 'Två öppna instämplingar gick in';
  exception when unique_violation then null;
  end;
  begin
    perform time_submit(array(select id from time_entries where work_date = '2026-10-26'));
    raise exception 'En öppen instämpling kunde skickas in';
  exception when invalid_parameter_value then null;
  end;
  update time_entries set end_time = '15:30' where work_date = '2026-10-26' and end_time is null;
  if (select hours from time_entries where work_date = '2026-10-26') <> 8.5 then raise exception 'Utstämplingen gav fel timmar'; end if;

  -- Sjuk: tre fall. Det andra börjar fem dagar efter att det första slutade
  -- (fortsätter perioden), det tredje sex dagar efter det andra (ny period).
  insert into absences (org_id, employee_id, kind, from_date, to_date) values
    ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'sjuk', '2026-09-01', '2026-09-02'),
    ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'sjuk', '2026-09-07', '2026-09-08'),
    ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'sjuk', '2026-09-14', '2026-09-15');
  insert into absences (org_id, employee_id, kind, from_date, to_date, extent) values
    ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'vab', '2026-10-02', '2026-10-02', 0.5);
  begin
    insert into absences (org_id, employee_id, kind, from_date, to_date, extent) values
      ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'vab', '2026-10-05', '2026-10-05', 0.3);
    raise exception 'Omfattningen 0,3 gick in';
  exception when check_violation then null;
  end;
  begin
    insert into absences (org_id, employee_id, kind, from_date, to_date) values
      ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'sjuk', '2026-09-15', '2026-09-16');
    raise exception 'Överlappande sjukfall gick in';
  exception when exclusion_violation then null;
  end;
  begin
    update absences set certificate_received_on = '2026-09-10' where from_date = '2026-09-07';
    raise exception 'Erik kunde registrera sitt läkarintyg';
  exception when insufficient_privilege then null;
  end;
  begin
    update absences set approved_at = now(), approved_by = auth.uid() where from_date = '2026-09-07';
    raise exception 'Erik kunde godkänna sin frånvaro';
  exception when insufficient_privilege then null;
  end;
  select count(*) into n from sick_periods;
  if n <> 2 then raise exception 'Erik ser % sjukperioder, väntade 2.', n; end if;
end $$;

-- ---------------------------------------------------------------- Fatima ser bara sitt

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a5","role":"authenticated","email":"fatima@prov37.se"}';
insert into time_entries (org_id, employee_id, work_date, hours, project_id)
values ((select v from prov where k = 'a'), (select v from prov where k = 'fatima'), '2026-10-20', 4, (select v from prov where k = 'p1'));
do $$
declare n int;
begin
  select count(*) into n from time_entries;
  if n <> 1 then raise exception 'Fatima ser % tidrader, väntade sin egen.', n; end if;
  select count(*) into n from absences;
  if n <> 0 then raise exception 'Fatima ser Eriks frånvaro'; end if;
  select count(*) into n from schedules;
  if n <> 0 then raise exception 'Fatima ser Eriks schema'; end if;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a4","role":"authenticated","email":"erik@prov37.se"}';
do $$
declare n int;
begin
  select count(*) into n from time_entries;
  if n <> 7 then raise exception 'Erik ser % tidrader, väntade sina 7.', n; end if;
  select count(*) into n from schedules;
  if n <> 2 then raise exception 'Erik ser % scheman, väntade sina 2.', n; end if;
  select count(*) into n from events;
  if n <> 0 then raise exception 'Erik ser loggboken'; end if;
end $$;

-- ---------------------------------------------------------------- konsulten läser, godkänner inget

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a2","role":"authenticated","email":"a-konsult@prov37.se"}';
do $$
declare n int;
begin
  select count(*) into n from time_entries;
  if n <> 8 then raise exception 'Konsulten ser % tidrader, väntade 8.', n; end if;
  select count(*) into n from absences;
  if n <> 4 then raise exception 'Konsulten ser % frånvarorader.', n; end if;
  begin
    perform time_approve(array[(select v from prov where k = 'erik_23')]);
    raise exception 'Konsulten kunde godkänna tid';
  exception when insufficient_privilege then null;
  end;
  begin
    perform time_lock_period((select v from prov where k = 'a'), '2026-10-19', '2026-10-25');
    raise exception 'Konsulten kunde låsa en period';
  exception when insufficient_privilege then null;
  end;
  begin
    perform shift_offer((select v from prov where k = 'a'), jsonb_build_object('date', current_date + 7, 'start', '07:00', 'end', '16:00'));
    raise exception 'Konsulten kunde erbjuda ett pass';
  exception when insufficient_privilege then null;
  end;
  begin
    update absences set approved_at = now() where kind = 'vab';
    if exists (select 1 from absences where approved_at is not null) then raise exception 'Konsulten kunde godkänna frånvaro'; end if;
  end;
end $$;

-- ---------------------------------------------------------------- projektledaren godkänner sitt projekt

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a3","role":"authenticated","email":"a-ledare@prov37.se"}';
do $$
declare
  n int;
  v_costs jsonb;
  v_ids uuid[];
begin
  -- Ledaren ser P1:s rader (Eriks fyra dagar och resan, Fatimas utkast), inte P2, ingen frånvaro.
  select count(*) into n from time_entries;
  if n <> 6 then raise exception 'Ledaren ser % tidrader, väntade 6.', n; end if;
  select count(*) into n from time_entries where project_id = (select v from prov where k = 'p2');
  if n <> 0 then raise exception 'Ledaren ser P2'; end if;
  select count(*) into n from absences;
  if n <> 0 then raise exception 'Ledaren ser frånvaro'; end if;
  select count(*) into n from employees;
  if n <> 0 then raise exception 'Ledaren ser personalregistret'; end if;
  select count(*) into n from time_people((select v from prov where k = 'a'));
  if n <> 3 then raise exception 'Ledaren får % namn ur time_people.', n; end if;

  v_ids := array(select id from time_entries where employee_id = (select v from prov where k = 'erik') and project_id = (select v from prov where k = 'p1'));
  select count(*) into n from time_cost_basis(v_ids) where pay_form = 'monthly' and monthly_salary_ore = 3200000;
  if n <> 5 then raise exception 'Kostnadsunderlaget gav % rader.', n; end if;
  -- Utan projektkostnaden godkänns inget.
  begin
    perform time_approve(v_ids);
    raise exception 'Godkännande utan projektkostnad gick igenom';
  exception when invalid_parameter_value then null;
  end;
  -- Kostnaden räknas i appen; här 300 kr/h.
  select jsonb_agg(jsonb_build_object('entryId', id, 'hours', hours, 'hourlyRateOre', 30000, 'amountOre', round(hours * 30000), 'description', 'Erik ' || work_date))
    into v_costs from time_entries where id = any(v_ids);
  n := time_approve(v_ids, v_costs);
  if n <> 5 then raise exception 'Ledaren godkände % rader, väntade 5.', n; end if;
  select count(*) into n from project_costs where time_entry_id = any(v_ids) and kind = 'hours';
  if n <> 5 then raise exception 'Godkännandet skrev % projektkostnader.', n; end if;
  if (select sum(amount_ore) from project_costs where time_entry_id = any(v_ids)) <> (4 * 8 + 1.5) * 30000 then
    raise exception 'Projektkostnaden blev %', (select sum(amount_ore) from project_costs where time_entry_id = any(v_ids));
  end if;
  -- P2 är inte ledarens; Fatimas utkast är inte inskickat.
  begin
    perform time_approve(array[(select v from prov where k = 'erik_23')], '[]');
    raise exception 'Ledaren kunde godkänna P2';
  exception when insufficient_privilege then null;
  end;
  begin
    perform time_approve(array(select id from time_entries where employee_id = (select v from prov where k = 'fatima')),
                         '[]');
    raise exception 'Ett utkast kunde godkännas';
  exception when invalid_parameter_value then null;
  end;
  -- Ledaren utser inte sig själv till ledare för P2, och kostnaden från tid tas inte bort.
  begin
    update portal_projects set leader_user_id = auth.uid() where id = (select v from prov where k = 'p2');
    raise exception 'Personal kunde göra sig till projektledare';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from project_costs where time_entry_id = (select v from prov where k = 'erik_19');
    raise exception 'Kostnaden från tid kunde tas bort';
  exception when feature_not_supported then null;
  end;
  begin
    insert into project_costs (org_id, project_id, kind, amount_ore, hours, hourly_rate_ore, time_entry_id)
    values ((select v from prov where k = 'a'), (select v from prov where k = 'p1'), 'hours', 1, 1, 1, (select v from prov where k = 'erik_23'));
    raise exception 'En kostnad med tidrad kunde skrivas utan godkännande';
  exception when feature_not_supported then null;
  end;

  -- Rättelse: måndagen var 7 timmar, inte 8. Vändningen och ersättningen
  -- skickas in, godkänns och vänder kostnaden.
  perform time_correct((select v from prov where k = 'erik_19'), '{"start":"07:00","end":"15:00","breakMinutes":60}', 'Gick tidigare');
  v_ids := array(select id from time_entries where corrects_id = (select v from prov where k = 'erik_19'));
  if cardinality(v_ids) <> 2 then raise exception 'Rättelsen gav % rader.', cardinality(v_ids); end if;
  select jsonb_agg(jsonb_build_object('entryId', id, 'hours', hours, 'hourlyRateOre', 30000, 'amountOre', round(hours * 30000), 'description', 'Rättelse'))
    into v_costs from time_entries where id = any(v_ids);
  perform time_approve(v_ids, v_costs);
  if (select sum(hours) from time_entries where work_date = '2026-10-19' and employee_id = (select v from prov where k = 'erik') and status = 'approved') <> 7 then
    raise exception 'Måndagen blev inte 7 timmar efter rättelsen';
  end if;
  if (select sum(amount_ore) from project_costs where cost_date = '2026-10-19' and project_id = (select v from prov where k = 'p1')) <> 7 * 30000 then
    raise exception 'Projektkostnaden vändes inte';
  end if;
  begin
    perform time_correct((select v from prov where k = 'erik_19'));
    raise exception 'Samma rad kunde rättas två gånger';
  exception when unique_violation then null;
  end;
end $$;

-- ---------------------------------------------------------------- en godkänd rad ändras inte

reset role;
do $$
begin
  begin
    update time_entries set hours = 9, start_time = null, end_time = null where id = (select v from prov where k = 'erik_20');
    raise exception 'En godkänd rad kunde ändras';
  exception when feature_not_supported then null;
  end;
  begin
    delete from time_entries where id = (select v from prov where k = 'erik_20');
    raise exception 'En godkänd rad kunde tas bort';
  exception when feature_not_supported then null;
  end;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a1","role":"authenticated","email":"a-agare@prov37.se"}';
do $$
declare
  n int;
begin
  -- Ägaren (RLS): den godkända raden är inte skrivbar alls.
  update time_entries set note = 'ändrad' where id = (select v from prov where k = 'erik_20');
  if (select note from time_entries where id = (select v from prov where k = 'erik_20')) <> '' then raise exception 'Ägaren ändrade en godkänd rad'; end if;

  -- Låset vägrar så länge något är oattesterat.
  begin
    perform time_lock_period((select v from prov where k = 'a'), '2026-10-19', '2026-10-25');
    raise exception 'Perioden låstes med oattesterade rader';
  exception when invalid_parameter_value then null;
  end;
  perform time_approve(array[(select v from prov where k = 'erik_23')],
    jsonb_build_array(jsonb_build_object('entryId', (select v from prov where k = 'erik_23'), 'hours', 8, 'hourlyRateOre', 30000, 'amountOre', 240000)));
  delete from time_entries where employee_id = (select v from prov where k = 'fatima');
  perform time_lock_period((select v from prov where k = 'a'), '2026-10-19', '2026-10-25', 'Oktober v. 43');
  select count(*) into n from time_entries where work_date between '2026-10-19' and '2026-10-25' and status = 'locked';
  if n <> 8 then raise exception '% rader låstes, väntade 8.', n; end if;
  begin
    perform time_correct((select v from prov where k = 'erik_20'));
    raise exception 'En låst rad kunde rättas';
  exception when feature_not_supported then null;
  end;
  begin
    insert into absences (org_id, employee_id, kind, from_date, to_date) values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'semester', '2026-10-22', '2026-10-22');
    raise exception 'Frånvaro i en låst period gick in';
  exception when feature_not_supported then null;
  end;

  -- Sjukperioderna som ägaren ser: de två första fallen delar period, det tredje har en egen.
  if (select count(distinct sick_period_id) from absences where kind = 'sjuk') <> 2
     or (select sick_period_id from absences where from_date = '2026-09-01') <> (select sick_period_id from absences where from_date = '2026-09-07')
     or (select sick_period_id from absences where from_date = '2026-09-07') = (select sick_period_id from absences where from_date = '2026-09-14') then
    raise exception 'Sjukperioderna länkades fel';
  end if;
  if (select first_day from sick_periods where id = (select sick_period_id from absences where from_date = '2026-09-07')) <> '2026-09-01'
     or (select last_day from sick_periods where id = (select sick_period_id from absences where from_date = '2026-09-07')) <> '2026-09-08' then
    raise exception 'Sjukperiodens första eller sista dag är fel';
  end if;
  -- Flyttas det andra fallet en dag (sex dagars lucka) blir det en egen period.
  update absences set from_date = '2026-09-08' where from_date = '2026-09-07';
  if (select count(distinct sick_period_id) from absences where kind = 'sjuk') <> 3 then raise exception 'Sex dagars lucka gav ingen ny period'; end if;
  update absences set from_date = '2026-09-07' where from_date = '2026-09-08';
  if (select count(*) from sick_periods) <> 2 then raise exception 'Perioderna slogs inte ihop igen (% kvar).', (select count(*) from sick_periods); end if;
  -- Läkarintyget och godkännandet registreras av ägaren.
  update absences set certificate_received_on = '2026-09-09', approved_at = now() where from_date = '2026-09-07';
  if (select approved_by from absences where from_date = '2026-09-07') <> auth.uid() then raise exception 'Godkännaren sparades inte'; end if;
end $$;

-- ---------------------------------------------------------------- inringning

do $$
declare
  n int;
  v_shift uuid;
begin
  v_shift := shift_offer((select v from prov where k = 'a'),
    jsonb_build_object('date', current_date + 7, 'start', '07:00', 'end', '16:00', 'breakMinutes', 60, 'projectId', (select v from prov where k = 'p1')));
  insert into prov values ('shift1', v_shift);
  select count(*) into n from shift_offers where shift_id = v_shift;
  if n <> 2 then raise exception 'Passet erbjöds % personer, väntade Fatima och Gustav.', n; end if;
  insert into prov values ('shift2', shift_offer((select v from prov where k = 'a'),
    jsonb_build_object('date', current_date + 8, 'start', '07:00', 'end', '12:00'), array[(select v from prov where k = 'fatima')]));
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a4","role":"authenticated","email":"erik@prov37.se"}';
do $$
begin
  if (select count(*) from shifts) <> 0 then raise exception 'Erik ser pass som inte är hans'; end if;
  begin
    perform shift_answer((select v from prov where k = 'shift1'), true);
    raise exception 'Erik kunde ta ett pass han inte erbjudits';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a5","role":"authenticated","email":"fatima@prov37.se"}';
do $$
declare
  n int;
  r record;
  v_emp uuid;
begin
  select count(*) into n from shifts;
  if n <> 2 then raise exception 'Fatima ser % pass, väntade sina två erbjudanden.', n; end if;
  select count(*) into n from shift_offers;
  if n <> 2 then raise exception 'Fatima ser % erbjudanden.', n; end if;
  select * into r from employment_clocks((select v from prov where k = 'a'), current_date + 30) where employee_id = (select v from prov where k = 'fatima');
  if r.sava_days <> 1 then raise exception 'Fatimas SÄVA-dagar före passet: %', r.sava_days; end if;

  v_emp := shift_answer((select v from prov where k = 'shift1'), true);
  select * into r from employments where id = v_emp;
  if r.form <> 'sava' or r.pay_form <> 'hourly' or r.hourly_rate_ore <> 18000 or r.starts_on <> current_date + 7 or r.ends_on <> current_date + 7 then
    raise exception 'Passet blev fel anställning: % % % %–%', r.form, r.pay_form, r.hourly_rate_ore, r.starts_on, r.ends_on;
  end if;
  select * into r from shifts where id = (select v from prov where k = 'shift1');
  if r.offer_status <> 'accepted' or r.employee_id <> (select v from prov where k = 'fatima') or r.sava_period_id <> v_emp then
    raise exception 'Passet tillsattes inte';
  end if;
  select * into r from employment_clocks((select v from prov where k = 'a'), current_date + 30) where employee_id = (select v from prov where k = 'fatima');
  if r.sava_days <> 2 then raise exception 'Klockan räknade inte passet: % SÄVA-dagar', r.sava_days; end if;
  begin
    perform shift_answer((select v from prov where k = 'shift1'), true);
    raise exception 'Samma pass kunde tas två gånger';
  exception when invalid_parameter_value then null;
  end;
  -- Ett accepterat pass ändras inte.
  begin
    update shifts set note = 'x' where id = (select v from prov where k = 'shift1');
    if (select note from shifts where id = (select v from prov where k = 'shift1')) <> '' then raise exception 'Fatima ändrade passet'; end if;
  end;
  perform shift_answer((select v from prov where k = 'shift2'), false);
  if (select offer_status from shifts where id = (select v from prov where k = 'shift2')) <> 'declined' then raise exception 'Nej-svaret syntes inte på passet'; end if;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a1","role":"authenticated","email":"a-agare@prov37.se"}';
do $$
declare
  n int;
begin
  if (select status from shift_offers where shift_id = (select v from prov where k = 'shift1') and employee_id = (select v from prov where k = 'gustav')) <> 'expired' then
    raise exception 'Gustavs erbjudande gick inte ut';
  end if;
  begin
    update shifts set note = 'x' where id = (select v from prov where k = 'shift1');
    raise exception 'Ägaren ändrade ett accepterat pass';
  exception when feature_not_supported then null;
  end;
  perform shift_withdraw((select v from prov where k = 'shift2'));
  -- Loggboken.
  for n in select 1 from (values ('time.submitted'), ('time.approved'), ('time.corrected'), ('time.locked'), ('absence.reported'),
                                 ('absence.approved'), ('absence.certificate_received'), ('shift.offered'), ('shift.accepted'),
                                 ('shift.declined'), ('shift.withdrawn'), ('schedule.created')) t(type)
           where not exists (select 1 from events e where e.type = t.type and e.org_id = (select v from prov where k = 'a')) loop
    raise exception 'En händelsetyp saknas i loggboken';
  end loop;
  select count(*) into n from events where type = 'time.approved' and aggregate_id = (select v from prov where k = 'erik');
  if n <> 3 then raise exception 'time.approved: % händelser för Erik, väntade 3 (vecka, rättelse, P2).', n; end if;
end $$;

-- Personal som inte är lönebehörig ser inte personhändelserna, men lås och erbjudanden.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037a3","role":"authenticated","email":"a-ledare@prov37.se"}';
do $$
begin
  if exists (select 1 from events where aggregate_type = 'employee') then raise exception 'Ledaren ser personhändelser'; end if;
  if not exists (select 1 from events where type = 'time.locked') then raise exception 'Ledaren ser inte låset'; end if;
  if (select count(*) from shifts) <> 1 then raise exception 'Ledaren ser % pass, väntade P1:s.', (select count(*) from shifts); end if;
end $$;

-- ---------------------------------------------------------------- B ser inget av A

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000037b1","role":"authenticated","email":"b-agare@prov37.se"}';
do $$
declare n int;
begin
  select (select count(*) from time_entries) + (select count(*) from absences) + (select count(*) from sick_periods)
       + (select count(*) from schedules) + (select count(*) from schedule_rules) + (select count(*) from shifts)
       + (select count(*) from shift_offers) + (select count(*) from time_locks) into n;
  if n <> 0 then raise exception 'B ser % rader av A:s tid och frånvaro.', n; end if;
  select count(*) into n from time_people((select v from prov where k = 'a'));
  if n <> 0 then raise exception 'B får A:s namn'; end if;
  select count(*) into n from time_projects((select v from prov where k = 'a'));
  if n <> 0 then raise exception 'B får A:s projekt'; end if;
  select count(*) into n from time_cost_basis(array(select v from prov where k like 'erik\_%'));
  if n <> 0 then raise exception 'B får A:s kostnadsunderlag'; end if;
  begin
    perform time_approve(array[(select v from prov where k = 'erik_21')]);
    raise exception 'B kunde godkänna A:s tid';
  exception when insufficient_privilege then null;
  end;
  begin
    perform hr_set_schedule((select v from prov where k = 'erik_e'), '[{"weekday":1,"start":"07:00","end":"16:00"}]');
    raise exception 'B kunde lägga schema i A';
  exception when insufficient_privilege then null;
  end;
  begin
    perform time_lock_period((select v from prov where k = 'a'), '2026-11-01', '2026-11-30');
    raise exception 'B kunde låsa A:s period';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into absences (org_id, employee_id, kind, from_date, to_date) values ((select v from prov where k = 'a'), (select v from prov where k = 'erik'), 'sjuk', '2026-11-02', '2026-11-02');
    raise exception 'B kunde lägga frånvaro i A';
  exception when insufficient_privilege then null;
  end;
end $$;

do $$ begin raise notice 'Prov 0037: alla gick igenom'; end $$;

rollback;
