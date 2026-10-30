-- Tid, schema och frånvaro, fas 2 (docs/hr-lon.md, avsnitt 3, 10, 11 och 12).
-- Läggs på efter 0035 och 0036, som inte ändras.
--
-- 1. Projektledare: portal_projects.leader_user_id. can_approve_time(projekt)
--    är lönegodkännare (owner, admin) eller personal (staff) som leder
--    projektet. Bara owner/admin sätter projektledaren.
-- 2. Scheman: schedules + schedule_rules (ett pass per veckodag med start,
--    slut och rast), frysta när de skapats. employments.schedule_id får en
--    främmande nyckel; en version får sitt schema en gång (som avtalet), en
--    ny version ärver det förra schemat, och ett nytt schema är en ny
--    version (hr_set_schedule).
-- 3. Pass och inringning: shifts (planerade pass, med projekt) och
--    shift_offers (ett erbjudande per behovsanställd). Den som tackar ja
--    får en ny SÄVA-anställning för passets dag (shifts.sava_period_id), så
--    employment_clocks() räknar riktiga pass.
-- 4. Tidrader: time_entries, utkast → inskickad → godkänd → låst. En
--    godkänd rad ändras aldrig; en rättelse är en ny rad med negativa timmar
--    som pekar på den gamla (corrects_id), och oftast en ersättningsrad.
--    Triggrar håller det. Godkännandet skriver projektkostnaden
--    (project_costs.time_entry_id) i samma transaktion; beloppet räknas i
--    appen (lib/core/hr/project-cost.ts), här kontrolleras bara timmarna.
-- 5. time_locks: en låst period tar inte emot nya, ändrade eller godkända
--    tidrader eller frånvaro.
-- 6. Frånvaro: absences med delar av dagar (0,25), läkarintyg och
--    sjukperioden (sick_periods). Ett nytt sjukfall som börjar högst fem
--    kalenderdagar efter att det förra slutade fortsätter samma period
--    (återinsjuknande, sjuklönelagen 7 §); sick_rules() har dagarna och
--    lib/core/hr/absence-parity.test.ts håller dem lika med regelboken.
--    Sjuklönen, karensen och dag 8 räknas i appen med sickPay().
-- 7. RLS: den anställde läser och skriver bara sina egna utkast och
--    inskickade rader, sin frånvaro, sina pass och erbjudanden (is_self);
--    personal ser och godkänner tid på projekt de leder; lönebehöriga läser
--    allt; redovisningskonsulten godkänner inget.
-- 8. Loggboken: inskickad, godkänd, återskickad, rättad, låst, frånvaro,
--    inringning erbjuden, accepterad, avböjd, återkallad och nytt schema.
--    Personliga händelser har aggregate_type 'employee' (bara
--    lönebehöriga ser dem), låsningar och erbjudanden 'time'.

begin;

-- =====================================================================
-- 1. Projektledare
-- =====================================================================

alter table portal_projects add column leader_user_id uuid references auth.users(id) on delete set null;

-- Personal (eller högre) som leder projektet.
create or replace function public.is_project_leader(p_project uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.portal_projects p
                 where p.id = p_project and p.leader_user_id = auth.uid() and public.can_write_org(p.org_id))
$$;

-- Godkänner tid på projektet: lönegodkännare eller projektets ledare.
create or replace function public.can_approve_time(p_project uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.portal_projects p
                 where p.id = p_project
                   and (public.can_payroll_approve(p.org_id) or (p.leader_user_id = auth.uid() and public.can_write_org(p.org_id))))
$$;

-- Bara ägare och administratörer utser projektledaren, och bara bland
-- organisationens personal; annars kunde personal göra sig själv till
-- ledare och godkänna tid.
create or replace function public.portal_projects_leader_check() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.leader_user_id is distinct from (case when tg_op = 'UPDATE' then old.leader_user_id end) then
    if auth.uid() is not null and not public.can_admin_org(new.org_id) then
      raise exception 'Bara ägare och administratörer utser projektledare.' using errcode = '42501';
    end if;
    if new.leader_user_id is not null and not exists (
      select 1 from public.memberships m where m.org_id = new.org_id and m.user_id = new.leader_user_id and m.role in ('owner','admin','staff')) then
      raise exception 'Projektledaren ska vara personal i organisationen.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;
create trigger portal_projects_leader_check before insert or update of leader_user_id on portal_projects
  for each row execute function portal_projects_leader_check();

-- =====================================================================
-- 2. Scheman
-- =====================================================================

create table schedules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  employee_id   uuid not null,
  name          text not null default '' check (char_length(name) <= 80),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade,
  unique (id, org_id)
);
create index schedules_employee_idx on schedules (employee_id, created_at desc);

-- Ett pass per veckodag (1 = måndag). Slut före eller lika med start går
-- över midnatt. Timmarna är (slut − start) − rast.
create table schedule_rules (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  schedule_id    uuid not null,
  weekday        int not null check (weekday between 1 and 7),
  start_time     time not null,
  end_time       time not null,
  break_minutes  int not null default 0 check (break_minutes >= 0),
  foreign key (schedule_id, org_id) references schedules(id, org_id) on delete cascade,
  unique (schedule_id, weekday),
  check (break_minutes * 60 < extract(epoch from (case when end_time > start_time then end_time - start_time
                                                       else end_time - start_time + interval '24 hours' end)))
);

create trigger schedules_immutable before update or delete on schedules
  for each row execute function forbid_change();
create trigger schedule_rules_immutable before update or delete on schedule_rules
  for each row execute function forbid_change();

-- Ett schema som en anställning redan använder får inga nya rader.
create or replace function public.schedule_rules_frozen() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.employments where schedule_id = new.schedule_id) then
    raise exception 'Schemat används redan; skapa ett nytt.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
create trigger schedule_rules_frozen before insert on schedule_rules
  for each row execute function schedule_rules_frozen();

alter table employments add constraint employments_schedule_fk
  foreign key (schedule_id, org_id) references schedules(id, org_id);

-- Som 0035, och en ny version ärver den förra versionens schema om den
-- inte har ett eget.
create or replace function public.employments_version() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_prev public.employments%rowtype;
begin
  if new.contract_id is null or new.contract_id = new.id then
    new.contract_id := new.id;
    new.version := 1;
    return new;
  end if;
  select * into v_prev from public.employments where contract_id = new.contract_id and valid_to is null for update;
  if not found then
    raise exception 'Anställningen finns inte eller är avslutad.' using errcode = '22023';
  end if;
  if v_prev.employee_id <> new.employee_id or v_prev.org_id <> new.org_id then
    raise exception 'En ny version gäller samma person.' using errcode = '22023';
  end if;
  if new.valid_from < v_prev.valid_from then
    raise exception 'Den nya versionen kan gälla tidigast från %.', v_prev.valid_from using errcode = '22023';
  end if;
  new.version := v_prev.version + 1;
  if new.schedule_id is null then
    new.schedule_id := v_prev.schedule_id;
  end if;
  update public.employments set valid_to = new.valid_from - 1 where id = v_prev.id;
  return new;
end;
$$;

-- Som 0035, och schedule_id får sättas en gång (en version som saknade
-- schema, t.ex. registrerad före fas 2). Ett annat schema är en ny version.
create or replace function public.employments_freeze() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if (to_jsonb(new) - 'valid_to' - 'document_id' - 'schedule_id') is distinct from (to_jsonb(old) - 'valid_to' - 'document_id' - 'schedule_id') then
    raise exception 'En anställning ändras inte; lägg till en ny version.' using errcode = '0A000';
  end if;
  if old.valid_to is not null and new.valid_to is distinct from old.valid_to then
    raise exception 'Versionen är redan stängd.' using errcode = '0A000';
  end if;
  if old.schedule_id is not null and new.schedule_id is distinct from old.schedule_id then
    raise exception 'Versionen har redan ett schema; ett nytt schema är en ny version.' using errcode = '0A000';
  end if;
  return new;
end;
$$;

-- Schemat ska vara personens eget.
create or replace function public.employments_schedule_owner() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.schedule_id is not null
     and not exists (select 1 from public.schedules s where s.id = new.schedule_id and s.employee_id = new.employee_id) then
    raise exception 'Schemat hör till en annan person.' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger employments_schedule_owner before insert or update of schedule_id on employments
  for each row execute function employments_schedule_owner();

-- =====================================================================
-- 3. Pass och inringning
-- =====================================================================

create table shifts (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references organizations(id) on delete cascade,
  shift_date        date not null,
  start_time        time not null,
  end_time          time not null,
  break_minutes     int not null default 0 check (break_minutes >= 0),
  project_id        uuid references portal_projects(id) on delete set null,
  employee_id       uuid,
  -- null: ett planerat pass. offered: erbjudet poolen; accepted: någon tackade
  -- ja; declined: alla tackade nej; expired: ingen svarade i tid eller återkallat.
  offer_status      text check (offer_status in ('offered','accepted','declined','expired')),
  offer_expires_at  timestamptz,
  sava_period_id    uuid,
  note              text not null default '' check (char_length(note) <= 500),
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid(),
  unique (id, org_id),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade,
  foreign key (sava_period_id, org_id) references employments(id, org_id),
  check (offer_status is distinct from 'offered' or employee_id is null),
  check (offer_status is distinct from 'accepted' or (employee_id is not null and sava_period_id is not null)),
  check (sava_period_id is null or offer_status = 'accepted')
);
create index shifts_org_date_idx on shifts (org_id, shift_date);
create index shifts_employee_idx on shifts (employee_id, shift_date);

create table shift_offers (
  shift_id      uuid not null,
  org_id        uuid not null,
  employee_id   uuid not null,
  status        text not null default 'offered' check (status in ('offered','accepted','declined','expired')),
  offered_at    timestamptz not null default now(),
  answered_at   timestamptz,
  primary key (shift_id, employee_id),
  foreign key (shift_id, org_id) references shifts(id, org_id) on delete cascade,
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade
);
create index shift_offers_employee_idx on shift_offers (employee_id, status);

-- Ett accepterat pass är en anställning och ändras inte längre.
create or replace function public.shifts_freeze() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if old.offer_status = 'accepted' then
    raise exception 'Passet är accepterat och har blivit en anställning; det ändras inte.' using errcode = '0A000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
create trigger shifts_freeze before update or delete on shifts
  for each row execute function shifts_freeze();

-- =====================================================================
-- 4. Låsta perioder
-- =====================================================================

create table time_locks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  note          text not null default '' check (char_length(note) <= 200),
  locked_by     uuid default auth.uid(),
  locked_at     timestamptz not null default now(),
  check (period_end >= period_start)
);
create index time_locks_org_idx on time_locks (org_id, period_start);
create trigger time_locks_immutable before update or delete on time_locks
  for each row execute function forbid_change();

create or replace function public.time_locked(p_org uuid, p_date date) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.time_locks l where l.org_id = p_org and p_date between l.period_start and l.period_end)
$$;

-- =====================================================================
-- 5. Tidrader
-- =====================================================================

create table time_entries (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null,
  employee_id    uuid not null,
  work_date      date not null,
  start_time     time,
  end_time       time,
  break_minutes  int not null default 0 check (break_minutes >= 0),
  -- Med start och slut räknas timmarna här: (slut − start) − rast, slut före
  -- start går över midnatt. Utan tider skrivs timmarna in. Negativa bara i
  -- en rättelse som vänder en godkänd rad.
  hours          numeric(5,2) not null check (hours between -24 and 24),
  kind           text not null default 'work' check (kind in ('work','overtime','ob','travel','on_call')),
  project_id     uuid references portal_projects(id) on delete restrict,
  shift_id       uuid,
  note           text not null default '' check (char_length(note) <= 500),
  source         text not null default 'manual' check (source in ('clock','manual','imported')),
  status         text not null default 'draft' check (status in ('draft','submitted','approved','locked')),
  corrects_id    uuid references time_entries(id),
  submitted_at   timestamptz,
  approved_by    uuid,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_at     timestamptz not null default now(),
  unique (id, org_id),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade,
  foreign key (shift_id, org_id) references shifts(id, org_id),
  -- Start och slut hör ihop; en instämpling har start men inget slut ännu.
  check ((start_time is null) = (end_time is null) or (source = 'clock' and start_time is not null and end_time is null and status = 'draft')),
  check (hours <> 0 or (end_time is null and start_time is not null)),
  check (hours >= 0 or (corrects_id is not null and start_time is null)),
  check ((status in ('approved','locked')) = (approved_at is not null))
);
create index time_entries_org_date_idx on time_entries (org_id, work_date);
create index time_entries_employee_idx on time_entries (employee_id, work_date);
create index time_entries_project_idx on time_entries (project_id, work_date);
-- En rad rättas en gång: en vändning och högst en ersättning.
create unique index time_entries_reversal_idx on time_entries (corrects_id) where corrects_id is not null and hours < 0;
create unique index time_entries_replacement_idx on time_entries (corrects_id) where corrects_id is not null and hours >= 0;
-- En öppen instämpling per person.
create unique index time_entries_open_clock_idx on time_entries (employee_id) where start_time is not null and end_time is null;

-- Timmar mellan två klockslag med rast; slut före eller lika med start går över midnatt.
create or replace function public.time_block_hours(p_start time, p_end time, p_break int) returns numeric
  language sql immutable
as $$
  select round(((extract(epoch from (case when p_end > p_start then p_end - p_start else p_end - p_start + interval '24 hours' end)) / 60)
                - coalesce(p_break, 0)) / 60.0, 2)
$$;

-- Före varje skrivning: låsta perioder, frysta godkända rader, timmarna ur
-- tiderna, projektet i samma organisation, rättelsens regler.
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
create trigger time_entries_guard before insert or update or delete on time_entries
  for each row execute function time_entries_guard();

-- =====================================================================
-- 6. Projektkostnad ur godkänd tid
-- =====================================================================

alter table project_costs add column time_entry_id uuid unique references time_entries(id);
alter table project_costs drop constraint project_costs_hours_check;
-- Negativa timmar bara på raden som vänder en godkänd tidrads kostnad.
alter table project_costs add constraint project_costs_hours_check
  check (hours is null or hours >= 0 or time_entry_id is not null);

-- Kostnaden från godkänd tid ändras och tas bort bara genom en rättelse av tidraden.
create or replace function public.project_costs_time_frozen() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if old.time_entry_id is not null then
    raise exception 'Kostnaden kommer från godkänd tid; rätta tidraden i stället.' using errcode = '0A000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.time_entry_id is not null then
    raise exception 'Kostnader från tid skrivs bara när tiden godkänns.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
create trigger project_costs_time_frozen before update or delete on project_costs
  for each row execute function project_costs_time_frozen();

-- Bara godkännandet (time_approve, security definer) skriver kostnader med tidrad.
create or replace function public.project_costs_time_insert() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if new.time_entry_id is not null and current_setting('binaafy.time_approve', true) is distinct from 'on' then
    raise exception 'Kostnader från tid skrivs bara när tiden godkänns.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
create trigger project_costs_time_insert before insert on project_costs
  for each row execute function project_costs_time_insert();

-- =====================================================================
-- 7. Frånvaro och sjukperioder
-- =====================================================================

-- payrollRulesAt(...).sickPay (lib/core/rules/payroll.ts); ändras de där,
-- ändras de här i en ny migration (absence-parity.test.ts).
create or replace function public.sick_rules(out relapse_days int, out employer_days int, out certificate_from_day int)
  language sql immutable
as $$ select 5, 14, 8 $$;

create table sick_periods (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null,
  employee_id   uuid not null,
  first_day     date not null,
  last_day      date,                                -- null medan sjukdomen pågår
  created_at    timestamptz not null default now(),
  unique (id, org_id),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade
);
create index sick_periods_employee_idx on sick_periods (employee_id, first_day);

create table absences (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null,
  employee_id              uuid not null,
  kind                     text not null check (kind in ('sjuk','vab','semester','foraldraledig','tjanstledig','permission','kompledig')),
  from_date                date not null,
  to_date                  date,                     -- null: sjuk och ännu inte frisk
  -- Andel av varje dag: hel, tre fjärdedelar, halv, en fjärdedel.
  extent                   numeric(3,2) not null default 1 check (extent in (0.25, 0.5, 0.75, 1)),
  certificate_received_on  date,                     -- läkarintyg, krävs från dag 8
  sick_period_id           uuid,
  note                     text not null default '' check (char_length(note) <= 500),
  reported_by              uuid default auth.uid(),
  approved_by              uuid,
  approved_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (id, org_id),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade,
  foreign key (sick_period_id, org_id) references sick_periods(id, org_id),
  check (to_date is null or to_date >= from_date),
  check (to_date is not null or kind = 'sjuk'),
  check (kind = 'sjuk' or (sick_period_id is null and certificate_received_on is null)),
  check ((approved_at is null) = (approved_by is null))
);
create index absences_employee_idx on absences (employee_id, from_date);
create index absences_org_idx on absences (org_id, from_date);

-- Delarna av en frånvaro som ligger i låsta perioder: [från, till] per lås,
-- med sort och omfattning. Två rader med samma delar ändrar inget låst.
create or replace function public.absence_locked_parts(p_org uuid, p_kind text, p_extent numeric, p_from date, p_to date) returns text
  language sql stable security definer set search_path = public
as $$
  select coalesce(string_agg(format('%s:%s:%s:%s', l.id, p_kind, p_extent,
                    daterange(greatest(p_from, l.period_start), least(coalesce(p_to, l.period_end), l.period_end), '[]')), ',' order by l.period_start), '')
    from public.time_locks l
   where l.org_id = p_org and p_from <= l.period_end and coalesce(p_to, 'infinity'::date) >= l.period_start
$$;

-- Före varje skrivning: låsta perioder, inga överlappande sjukfall, och
-- bara lönegodkännare godkänner och tar emot läkarintyg.
create or replace function public.absences_guard() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_payroll boolean;
begin
  if tg_op = 'DELETE' then
    if public.absence_locked_parts(old.org_id, old.kind, old.extent, old.from_date, old.to_date) <> '' then
      raise exception 'Frånvaron ligger i en låst period och tas inte bort.' using errcode = '0A000';
    end if;
    return old;
  end if;
  v_payroll := auth.uid() is null or public.can_payroll_approve(new.org_id);
  if tg_op = 'UPDATE' then
    if new.employee_id <> old.employee_id or new.org_id <> old.org_id then
      raise exception 'Frånvaron flyttas inte till en annan person.' using errcode = '0A000';
    end if;
    if public.absence_locked_parts(old.org_id, old.kind, old.extent, old.from_date, old.to_date)
       is distinct from public.absence_locked_parts(new.org_id, new.kind, new.extent, new.from_date, new.to_date) then
      raise exception 'Frånvaron ligger i en låst period; den delen ändras inte.' using errcode = '0A000';
    end if;
    if not v_payroll and (new.certificate_received_on is distinct from old.certificate_received_on) then
      raise exception 'Bara ägare och administratörer registrerar läkarintyg.' using errcode = '42501';
    end if;
    if new.approved_at is distinct from old.approved_at then
      if not v_payroll then
        raise exception 'Bara ägare och administratörer godkänner frånvaro.' using errcode = '42501';
      end if;
      new.approved_by := case when new.approved_at is null then null else coalesce(auth.uid(), old.approved_by, new.approved_by) end;
    end if;
  else
    if public.absence_locked_parts(new.org_id, new.kind, new.extent, new.from_date, new.to_date) <> '' then
      raise exception 'Perioden är låst; frånvaro kan inte läggas in där.' using errcode = '0A000';
    end if;
    if not v_payroll and (new.approved_at is not null or new.certificate_received_on is not null) then
      raise exception 'Bara ägare och administratörer godkänner frånvaro och registrerar läkarintyg.' using errcode = '42501';
    end if;
    if new.approved_at is not null then
      new.approved_by := coalesce(auth.uid(), new.approved_by);
    end if;
  end if;
  if new.kind = 'sjuk' and exists (
    select 1 from public.absences a
     where a.employee_id = new.employee_id and a.kind = 'sjuk' and a.id <> new.id
       and daterange(a.from_date, coalesce(a.to_date, 'infinity'::date), '[]') && daterange(new.from_date, coalesce(new.to_date, 'infinity'::date), '[]')) then
    raise exception 'Sjukfallet överlappar ett annat; förläng det i stället.' using errcode = '23P01';
  end if;
  if new.kind <> 'sjuk' then
    new.sick_period_id := null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger absences_guard before insert or update or delete on absences
  for each row execute function absences_guard();

-- Lägger personens sjukfall i perioder igen: ett fall som börjar högst
-- relapse_days dagar efter att förra slutade (slutade den 10:e, sjuk igen
-- senast den 15:e) fortsätter perioden; annars börjar en ny. En period
-- behåller sitt id så länge dess första fall finns kvar.
create or replace function public.sick_relink(p_employee uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_relapse int := (public.sick_rules()).relapse_days;
  v_period uuid;
  v_first date;
  v_last date;
  v_open boolean;
  v_used uuid[] := '{}';
  v_org uuid;
begin
  select org_id into v_org from public.employees where id = p_employee;
  for r in select id, from_date, to_date, sick_period_id from public.absences
            where employee_id = p_employee and kind = 'sjuk' order by from_date, id loop
    if v_period is null or v_open or r.from_date - v_last > v_relapse then
      if v_period is not null then
        update public.sick_periods set first_day = v_first, last_day = case when v_open then null else v_last end where id = v_period;
      end if;
      if r.sick_period_id is not null and not (r.sick_period_id = any(v_used)) then
        v_period := r.sick_period_id;
      else
        insert into public.sick_periods (org_id, employee_id, first_day) values (v_org, p_employee, r.from_date) returning id into v_period;
      end if;
      v_used := v_used || v_period;
      v_first := r.from_date;
      v_last := r.from_date;
      v_open := false;
    end if;
    if r.sick_period_id is distinct from v_period then
      update public.absences set sick_period_id = v_period where id = r.id;
    end if;
    v_open := r.to_date is null;
    v_last := greatest(v_last, coalesce(r.to_date, r.from_date));
  end loop;
  if v_period is not null then
    update public.sick_periods set first_day = v_first, last_day = case when v_open then null else v_last end where id = v_period;
  end if;
  delete from public.sick_periods sp
   where sp.employee_id = p_employee and not (sp.id = any(v_used))
     and not exists (select 1 from public.absences a where a.sick_period_id = sp.id);
end;
$$;

create or replace function public.absences_relink() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.sick_relink(old.employee_id);
  else
    perform public.sick_relink(new.employee_id);
  end if;
  return null;
end;
$$;
-- Bara när sort eller datum ändras; sick_relink sätter bara sick_period_id och väcker inte triggern igen.
create trigger absences_relink after insert or delete or update of kind, from_date, to_date on absences
  for each row execute function absences_relink();

-- =====================================================================
-- 8. Loggboken
-- =====================================================================

-- En händelse om tid utan en person (lås, erbjudande till poolen).
create or replace function public.time_log(p_org uuid, p_id uuid, p_type text, p_data jsonb) returns void
  language sql volatile security definer set search_path = public
as $$
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
  values (p_org, 'time', p_id, p_type, coalesce(p_data, '{}'::jsonb), public.hr_actor())
$$;
revoke all on function public.time_log(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.absences_events() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_data jsonb;
begin
  if tg_op = 'DELETE' then
    perform public.hr_log(old.org_id, old.employee_id, 'absence.removed',
      jsonb_build_object('absenceId', old.id, 'kind', old.kind, 'from', old.from_date, 'to', old.to_date));
    return null;
  end if;
  v_data := jsonb_build_object('absenceId', new.id, 'kind', new.kind, 'from', new.from_date, 'to', new.to_date, 'extent', new.extent);
  if tg_op = 'INSERT' then
    perform public.hr_log(new.org_id, new.employee_id, 'absence.reported', v_data);
  else
    if new.approved_at is not null and old.approved_at is null then
      perform public.hr_log(new.org_id, new.employee_id, 'absence.approved', v_data);
    end if;
    if new.certificate_received_on is not null and old.certificate_received_on is null then
      perform public.hr_log(new.org_id, new.employee_id, 'absence.certificate_received', v_data || jsonb_build_object('receivedOn', new.certificate_received_on));
    end if;
    if (to_jsonb(new) - 'approved_at' - 'approved_by' - 'certificate_received_on' - 'sick_period_id' - 'updated_at')
       is distinct from (to_jsonb(old) - 'approved_at' - 'approved_by' - 'certificate_received_on' - 'sick_period_id' - 'updated_at') then
      perform public.hr_log(new.org_id, new.employee_id, 'absence.updated', v_data);
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.absences_events() from public, anon, authenticated, service_role;
create trigger absences_events after insert or update or delete on absences
  for each row execute function absences_events();

-- =====================================================================
-- 9. RLS och rättigheter
-- =====================================================================

alter table schedules      enable row level security;
alter table schedule_rules enable row level security;
alter table shifts         enable row level security;
alter table shift_offers   enable row level security;
alter table time_locks     enable row level security;
alter table time_entries   enable row level security;
alter table sick_periods   enable row level security;
alter table absences       enable row level security;

create policy "schedules_select" on schedules
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));
create policy "schedules_insert" on schedules
  for insert to authenticated with check (public.can_payroll_approve(org_id));
create policy "schedule_rules_select" on schedule_rules
  for select to authenticated using (exists (select 1 from public.schedules s where s.id = schedule_id
                                             and (public.can_payroll_read(s.org_id) or public.is_self(s.employee_id))));
create policy "schedule_rules_insert" on schedule_rules
  for insert to authenticated with check (public.can_payroll_approve(org_id));

-- Uppslagen mellan pass och erbjudanden går genom security definer, så att
-- de två tabellernas policies inte frågar varandra i en slinga.
create or replace function public.shift_offered_to_me(p_shift uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.shift_offers o where o.shift_id = p_shift and public.is_self(o.employee_id)) $$;
create or replace function public.shift_led_by_me(p_shift uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.shifts s where s.id = p_shift and s.project_id is not null and public.is_project_leader(s.project_id)) $$;
revoke all on function public.shift_offered_to_me(uuid) from public, anon;
revoke all on function public.shift_led_by_me(uuid) from public, anon;
grant execute on function public.shift_offered_to_me(uuid) to authenticated;
grant execute on function public.shift_led_by_me(uuid) to authenticated;

-- Pass: lönebehöriga, projektets ledare, och personen själv. Skrivs av
-- lönegodkännare och ledaren för passets projekt; erbjudanden och svar går
-- genom funktionerna nedan.
create policy "shifts_select" on shifts
  for select to authenticated using (
    public.can_payroll_read(org_id)
    or (project_id is not null and public.is_project_leader(project_id))
    or (employee_id is not null and public.is_self(employee_id))
    or public.shift_offered_to_me(id));
create policy "shifts_write" on shifts
  for all to authenticated
  using (public.can_payroll_approve(org_id) or (project_id is not null and public.can_approve_time(project_id)))
  with check ((public.can_payroll_approve(org_id) or (project_id is not null and public.can_approve_time(project_id)))
              and offer_status is distinct from 'accepted');
create policy "shift_offers_select" on shift_offers
  for select to authenticated using (
    public.can_payroll_read(org_id) or public.is_self(employee_id) or public.shift_led_by_me(shift_id));

create policy "time_locks_select" on time_locks
  for select to authenticated using (exists (select 1 from public.memberships m where m.org_id = time_locks.org_id and m.user_id = auth.uid()));

-- Tidrader: lönebehöriga läser allt, ledaren sitt projekt, personen sig
-- själv. Personen och lönegodkännare skriver utkast och inskickade rader;
-- godkännande, rättelser och lås går genom funktionerna.
create policy "time_entries_select" on time_entries
  for select to authenticated using (
    public.can_payroll_read(org_id) or public.is_self(employee_id)
    or (project_id is not null and public.is_project_leader(project_id)));
create policy "time_entries_insert" on time_entries
  for insert to authenticated with check (
    (public.is_self(employee_id) or public.can_payroll_approve(org_id))
    and status in ('draft','submitted') and corrects_id is null);
create policy "time_entries_update" on time_entries
  for update to authenticated
  using ((public.is_self(employee_id) or public.can_payroll_approve(org_id)) and status in ('draft','submitted'))
  with check ((public.is_self(employee_id) or public.can_payroll_approve(org_id)) and status in ('draft','submitted'));
create policy "time_entries_delete" on time_entries
  for delete to authenticated using (
    (public.is_self(employee_id) and status = 'draft')
    or (public.can_payroll_approve(org_id) and status in ('draft','submitted')));

create policy "sick_periods_select" on sick_periods
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));

-- Frånvaro: lönebehöriga läser, personen läser sin egen. Personen anmäler
-- och ändrar sin egen tills den är godkänd; lönegodkännare allt.
create policy "absences_select" on absences
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));
create policy "absences_insert" on absences
  for insert to authenticated with check (public.can_payroll_approve(org_id) or (public.is_self(employee_id) and approved_at is null));
create policy "absences_update" on absences
  for update to authenticated
  using (public.can_payroll_approve(org_id) or (public.is_self(employee_id) and approved_at is null))
  with check (public.can_payroll_approve(org_id) or (public.is_self(employee_id) and approved_at is null));
create policy "absences_delete" on absences
  for delete to authenticated using (public.can_payroll_approve(org_id) or (public.is_self(employee_id) and approved_at is null));

revoke all on schedules, schedule_rules, shifts, shift_offers, time_locks, time_entries, sick_periods, absences from anon, authenticated;
grant select, insert on schedules, schedule_rules to authenticated;
grant select, insert, update, delete on shifts to authenticated;
grant select on shift_offers, time_locks, sick_periods to authenticated;
grant select, insert, update, delete on time_entries, absences to authenticated;

-- =====================================================================
-- 10. Funktionerna
-- =====================================================================

-- Ett nytt veckoschema för en anställningsversion. Saknar versionen schema
-- får den detta; annars blir det en ny version från p_valid_from med det
-- nya schemat (arbetstiden är en del av avtalet, LAS 6 c §).
-- p_rules: [{"weekday":1,"start":"07:00","end":"16:00","breakMinutes":60}, ...]
create or replace function public.hr_set_schedule(p_employment uuid, p_rules jsonb, p_valid_from date default null, p_name text default '')
returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_emp public.employments%rowtype;
  v_schedule uuid;
  r jsonb;
begin
  select * into v_emp from public.employments where id = p_employment;
  if not found or not public.can_payroll_approve(v_emp.org_id) then
    raise exception 'Bara ägare och administratörer lägger in scheman.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rules) <> 'array' or jsonb_array_length(p_rules) = 0 then
    raise exception 'Schemat behöver minst en arbetsdag.' using errcode = '22023';
  end if;
  insert into public.schedules (org_id, employee_id, name) values (v_emp.org_id, v_emp.employee_id, left(coalesce(p_name, ''), 80))
  returning id into v_schedule;
  for r in select * from jsonb_array_elements(p_rules) loop
    insert into public.schedule_rules (org_id, schedule_id, weekday, start_time, end_time, break_minutes)
    values (v_emp.org_id, v_schedule, (r->>'weekday')::int, (r->>'start')::time, (r->>'end')::time, coalesce((r->>'breakMinutes')::int, 0));
  end loop;
  perform public.hr_log(v_emp.org_id, v_emp.employee_id, 'schedule.created',
    jsonb_build_object('scheduleId', v_schedule, 'employmentId', v_emp.id, 'days', jsonb_array_length(p_rules), 'validFrom', coalesce(p_valid_from, v_emp.valid_from)));
  if v_emp.schedule_id is null and (p_valid_from is null or p_valid_from <= v_emp.valid_from) then
    update public.employments set schedule_id = v_schedule where id = v_emp.id;
    return v_schedule;
  end if;
  if v_emp.valid_to is not null then
    raise exception 'Versionen är stängd; lägg schemat på den gällande versionen.' using errcode = '22023';
  end if;
  insert into public.employments (org_id, employee_id, contract_id, form, pay_form, monthly_salary_ore, hourly_rate_ore, fee_ore, fee_period,
                                  decision_reference, title, workplace, working_time_percent, weekly_hours, schedule_id, substitute_for,
                                  substitute_for_employee_id, probation_ends_on, starts_on, ends_on, notice_days, pay_day, vacation_rule,
                                  vacation_days, vacation_percent, atf_hours_per_year, pension_scheme, terms, change_reason, valid_from)
  select org_id, employee_id, contract_id, form, pay_form, monthly_salary_ore, hourly_rate_ore, fee_ore, fee_period,
         decision_reference, title, workplace, working_time_percent, weekly_hours, v_schedule, substitute_for,
         substitute_for_employee_id, probation_ends_on, starts_on, ends_on, notice_days, pay_day, vacation_rule,
         vacation_days, vacation_percent, atf_hours_per_year, pension_scheme, terms, 'Nytt schema', coalesce(p_valid_from, current_date)
    from public.employments where id = v_emp.id;
  return v_schedule;
end;
$$;

-- Poolen av behovsanställda: personer som inte slutat och vars senast
-- påbörjade avtal är en SÄVA med timlön (ramavtalet "vid behov").
create or replace function public.shift_pool(p_org uuid) returns table (employee_id uuid, name text)
  language sql stable security definer set search_path = public
as $$
  select e.id, e.name
    from public.employees e
    join lateral (select x.form, x.pay_form from public.employments x where x.employee_id = e.id
                   order by x.starts_on desc, x.version desc limit 1) last on true
   where e.org_id = p_org and e.ended_at is null and last.form = 'sava' and last.pay_form = 'hourly'
     and (public.can_payroll_read(p_org) or public.has_org_role(p_org, array['staff']))
   order by e.name
$$;

-- Erbjuder ett pass till poolen (eller till de angivna personerna i den).
create or replace function public.shift_offer(p_org uuid, p_shift jsonb, p_employees uuid[] default null) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
  v_project uuid := nullif(p_shift->>'projectId', '')::uuid;
  v_date date := (p_shift->>'date')::date;
  v_n int;
begin
  if not (public.can_payroll_approve(p_org)
          or (v_project is not null and public.can_approve_time(v_project)
              and exists (select 1 from public.portal_projects p where p.id = v_project and p.org_id = p_org))) then
    raise exception 'Bara ägare, administratörer och projektets ledare erbjuder pass.' using errcode = '42501';
  end if;
  if v_date < current_date then
    raise exception 'Passet ligger bakåt i tiden.' using errcode = '22023';
  end if;
  insert into public.shifts (org_id, shift_date, start_time, end_time, break_minutes, project_id, offer_status, offer_expires_at, note)
  values (p_org, v_date, (p_shift->>'start')::time, (p_shift->>'end')::time, coalesce((p_shift->>'breakMinutes')::int, 0), v_project,
          'offered', nullif(p_shift->>'expiresAt', '')::timestamptz, coalesce(p_shift->>'note', ''))
  returning id into v_id;
  insert into public.shift_offers (shift_id, org_id, employee_id)
  select v_id, p_org, p.employee_id from public.shift_pool(p_org) p
   where p_employees is null or p.employee_id = any(p_employees);
  get diagnostics v_n = row_count;
  if v_n = 0 then
    raise exception 'Ingen i poolen av behovsanställda att erbjuda passet (SÄVA med timlön).' using errcode = '22023';
  end if;
  perform public.time_log(p_org, v_id, 'shift.offered', jsonb_build_object('shiftId', v_id, 'date', v_date, 'offeredTo', v_n, 'projectId', v_project));
  return v_id;
end;
$$;

-- Den anställde svarar på ett erbjudande. Ja: passet blir personens, och en
-- ny SÄVA för dagen läggs in med villkoren från personens senaste
-- timlöneavtal, så att LAS-klockan räknar passet. De andra erbjudandena går ut.
create or replace function public.shift_answer(p_shift uuid, p_accept boolean) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
  v_employee uuid;
  v_template public.employments%rowtype;
  v_employment uuid;
  v_project text;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if not found then
    raise exception 'Passet finns inte.' using errcode = '22023';
  end if;
  select o.employee_id into v_employee
    from public.shift_offers o
   where o.shift_id = p_shift and public.is_self(o.employee_id);
  if v_employee is null then
    raise exception 'Passet är inte erbjudet dig.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.shift_offers where shift_id = p_shift and employee_id = v_employee and status = 'offered') then
    raise exception 'Du har redan svarat på erbjudandet.' using errcode = '22023';
  end if;

  if not p_accept then
    update public.shift_offers set status = 'declined', answered_at = now() where shift_id = p_shift and employee_id = v_employee;
    if v_shift.offer_status = 'offered' and not exists (select 1 from public.shift_offers where shift_id = p_shift and status = 'offered') then
      update public.shifts set offer_status = 'declined' where id = p_shift;
    end if;
    perform public.hr_log(v_shift.org_id, v_employee, 'shift.declined', jsonb_build_object('shiftId', p_shift, 'date', v_shift.shift_date));
    return null;
  end if;

  if v_shift.offer_status <> 'offered' then
    raise exception 'Passet är redan tillsatt eller återkallat.' using errcode = '22023';
  end if;
  if v_shift.offer_expires_at is not null and v_shift.offer_expires_at < now() then
    raise exception 'Erbjudandet har gått ut.' using errcode = '22023';
  end if;
  if v_shift.shift_date < current_date then
    raise exception 'Passet har redan varit.' using errcode = '22023';
  end if;
  select * into v_template from public.employments
   where employee_id = v_employee and pay_form = 'hourly'
   order by starts_on desc, version desc limit 1;
  if not found then
    raise exception 'Det finns inget avtal med timlön att utgå från; kontakta arbetsgivaren.' using errcode = '22023';
  end if;
  select title into v_project from public.portal_projects where id = v_shift.project_id;
  insert into public.employments (org_id, employee_id, form, pay_form, hourly_rate_ore, title, workplace, working_time_percent,
                                  starts_on, ends_on, pay_day, vacation_rule, vacation_days, vacation_percent, atf_hours_per_year,
                                  pension_scheme, terms, change_reason, valid_from)
  values (v_shift.org_id, v_employee, 'sava', 'hourly', v_template.hourly_rate_ore, v_template.title,
          coalesce(v_project, v_template.workplace), 100, v_shift.shift_date, v_shift.shift_date, v_template.pay_day,
          v_template.vacation_rule, v_template.vacation_days, v_template.vacation_percent, v_template.atf_hours_per_year,
          v_template.pension_scheme,
          format('Pass %s kl. %s–%s.', v_shift.shift_date, to_char(v_shift.start_time, 'HH24:MI'), to_char(v_shift.end_time, 'HH24:MI')),
          'Inringt pass', v_shift.shift_date)
  returning id into v_employment;
  update public.shifts set offer_status = 'accepted', employee_id = v_employee, sava_period_id = v_employment where id = p_shift;
  update public.shift_offers set status = 'accepted', answered_at = now() where shift_id = p_shift and employee_id = v_employee;
  update public.shift_offers set status = 'expired' where shift_id = p_shift and status = 'offered';
  perform public.hr_log(v_shift.org_id, v_employee, 'shift.accepted',
    jsonb_build_object('shiftId', p_shift, 'date', v_shift.shift_date, 'employmentId', v_employment));
  return v_employment;
end;
$$;

-- Återkallar ett erbjudande som ingen har tackat ja till.
create or replace function public.shift_withdraw(p_shift uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_shift public.shifts%rowtype;
begin
  select * into v_shift from public.shifts where id = p_shift for update;
  if not found or not (public.can_payroll_approve(v_shift.org_id) or (v_shift.project_id is not null and public.can_approve_time(v_shift.project_id))) then
    raise exception 'Bara ägare, administratörer och projektets ledare återkallar pass.' using errcode = '42501';
  end if;
  if v_shift.offer_status is distinct from 'offered' and v_shift.offer_status is distinct from 'declined' then
    raise exception 'Passet är inte ett öppet erbjudande.' using errcode = '22023';
  end if;
  update public.shifts set offer_status = 'expired' where id = p_shift;
  update public.shift_offers set status = 'expired' where shift_id = p_shift and status = 'offered';
  perform public.time_log(v_shift.org_id, p_shift, 'shift.withdrawn', jsonb_build_object('shiftId', p_shift, 'date', v_shift.shift_date));
end;
$$;

-- Händelserna för en grupp tidrader: en per person, med antal, timmar och datum.
create or replace function public.time_log_batch(p_ids uuid[], p_type text, p_extra jsonb default '{}') returns void
  language sql volatile security definer set search_path = public
as $$
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
  select t.org_id, 'employee', t.employee_id, p_type,
         jsonb_build_object('entries', count(*), 'hours', sum(t.hours), 'from', min(t.work_date), 'to', max(t.work_date),
                            'entryIds', jsonb_agg(t.id order by t.work_date)) || coalesce(p_extra, '{}'::jsonb),
         public.hr_actor()
    from public.time_entries t where t.id = any(p_ids)
   group by t.org_id, t.employee_id
$$;
revoke all on function public.time_log_batch(uuid[], text, jsonb) from public, anon, authenticated, service_role;

-- Skickar in utkast för godkännande (personen själv eller en lönegodkännare).
create or replace function public.time_submit(p_entries uuid[]) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  t public.time_entries%rowtype;
  v_ids uuid[] := '{}';
begin
  for t in select * from public.time_entries where id = any(p_entries) order by work_date for update loop
    if not (public.is_self(t.employee_id) or public.can_payroll_approve(t.org_id)) then
      raise exception 'Du kan bara skicka in din egen tid.' using errcode = '42501';
    end if;
    if t.status <> 'draft' then
      continue;
    end if;
    if t.start_time is not null and t.end_time is null then
      raise exception 'Stämpla ut innan du skickar in %.', t.work_date using errcode = '22023';
    end if;
    update public.time_entries set status = 'submitted', submitted_at = now() where id = t.id;
    v_ids := v_ids || t.id;
  end loop;
  if cardinality(v_ids) > 0 then
    perform public.time_log_batch(v_ids, 'time.submitted');
  end if;
  return cardinality(v_ids);
end;
$$;

-- Godkänner den som får: utan projekt lönegodkännare, med projekt också
-- projektets ledare. Ingen ledare (staff) godkänner sin egen tid.
create or replace function public.time_entry_approvable(t public.time_entries) returns boolean
  language sql stable security definer set search_path = public
as $$
  select case when t.project_id is null then public.can_payroll_approve(t.org_id)
              else public.can_approve_time(t.project_id) end
         and (public.can_payroll_approve(t.org_id) or not public.is_self(t.employee_id))
$$;

-- Det appen behöver för att räkna projektkostnaden (lib/core/hr/project-cost.ts)
-- för rader den som frågar får godkänna: personens födelseår och
-- anställningsversionen som gällde dagen, och för en vändning den
-- vända radens kostnad.
create or replace function public.time_cost_basis(p_entries uuid[])
returns table (entry_id uuid, employee_id uuid, employee_name text, birth_date date, work_date date, hours numeric, kind text,
               project_id uuid, corrects_id uuid, pay_form text, monthly_salary_ore bigint, hourly_rate_ore bigint,
               weekly_hours numeric, working_time_percent numeric, corrected_hourly_rate_ore bigint)
  language sql stable security definer set search_path = public
as $$
  select t.id, t.employee_id, e.name, e.birth_date, t.work_date, t.hours, t.kind, t.project_id, t.corrects_id,
         v.pay_form, v.monthly_salary_ore, v.hourly_rate_ore, v.weekly_hours, v.working_time_percent,
         (select c.hourly_rate_ore from public.project_costs c where c.time_entry_id = t.corrects_id)
    from public.time_entries t
    join public.employees e on e.id = t.employee_id
    left join lateral (select x.* from public.employments x
                        where x.employee_id = t.employee_id and x.pay_form in ('monthly','hourly')
                          and x.valid_from <= t.work_date and (x.valid_to is null or x.valid_to >= t.work_date)
                          and x.starts_on <= t.work_date and (x.ends_on is null or x.ends_on >= t.work_date)
                        order by x.starts_on desc, x.version desc limit 1) v on true
   where t.id = any(p_entries) and public.time_entry_approvable(t)
$$;

-- Godkänner inskickade rader och skriver deras projektkostnad i samma
-- transaktion. p_costs: [{"entryId", "hours", "hourlyRateOre", "amountOre", "description"}],
-- en per rad med projekt och sort work, overtime, ob eller travel (beredskap
-- kostar inte på projektet här). Beloppen räknas i appen; här kontrolleras
-- att timmarna och projektet är radens.
create or replace function public.time_approve(p_entries uuid[], p_costs jsonb default '[]') returns int
  language plpgsql security definer set search_path = public
as $$
declare
  t public.time_entries%rowtype;
  c jsonb;
  v_ids uuid[] := '{}';
  v_actor text := coalesce(auth.jwt()->>'email', 'system');
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
    c := null;
    select x into c from jsonb_array_elements(coalesce(p_costs, '[]'::jsonb)) x where x->>'entryId' = t.id::text limit 1;
    if t.project_id is not null and t.kind in ('work','overtime','ob','travel') then
      if c is null then
        raise exception 'Projektkostnaden saknas för raden %.', t.id using errcode = '22023';
      end if;
      if (c->>'hours')::numeric <> t.hours or (c->>'amountOre')::bigint <> round((c->>'hours')::numeric * (c->>'hourlyRateOre')::bigint) then
        raise exception 'Projektkostnaden för % stämmer inte med raden.', t.work_date using errcode = '22023';
      end if;
      insert into public.project_costs (org_id, project_id, kind, description, amount_ore, cost_date, hours, hourly_rate_ore, created_by, time_entry_id)
      values (t.org_id, t.project_id, 'hours', left(coalesce(c->>'description', ''), 400), (c->>'amountOre')::bigint, t.work_date,
              t.hours, (c->>'hourlyRateOre')::bigint, v_actor, t.id);
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

-- Skickar tillbaka inskickade rader till utkast, med en kommentar.
create or replace function public.time_return(p_entries uuid[], p_note text default '') returns int
  language plpgsql security definer set search_path = public
as $$
declare
  t public.time_entries%rowtype;
  v_ids uuid[] := '{}';
begin
  for t in select * from public.time_entries where id = any(p_entries) and status = 'submitted' for update loop
    if not public.time_entry_approvable(t) then
      raise exception 'Du får inte hantera tiden för %.', t.work_date using errcode = '42501';
    end if;
    update public.time_entries set status = 'draft',
           note = left(case when coalesce(p_note, '') = '' then note else btrim(note || ' · Återskickad: ' || p_note) end, 500)
     where id = t.id;
    v_ids := v_ids || t.id;
  end loop;
  if cardinality(v_ids) > 0 then
    perform public.time_log_batch(v_ids, 'time.returned', jsonb_build_object('note', left(coalesce(p_note, ''), 200)));
  end if;
  return cardinality(v_ids);
end;
$$;

-- Rättar en godkänd rad: en vändning (samma dag, sort och projekt, negativa
-- timmar) och, om p_replacement ges, en ny rad med rätt värden. Båda skickas
-- in och godkänns som vanligt; godkänd vändning vänder projektkostnaden.
-- Personen själv, projektets ledare eller en lönegodkännare. Låsta rader
-- rättas i nästa lön.
-- p_replacement: {"start","end","breakMinutes","hours","kind","projectId","note"}
create or replace function public.time_correct(p_entry uuid, p_replacement jsonb default null, p_note text default '') returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  t public.time_entries%rowtype;
  v_reversal uuid;
  v_new uuid;
begin
  select * into t from public.time_entries where id = p_entry for update;
  if not found or not (public.is_self(t.employee_id) or public.time_entry_approvable(t) or public.can_payroll_approve(t.org_id)) then
    raise exception 'Du får inte rätta den raden.' using errcode = '42501';
  end if;
  insert into public.time_entries (org_id, employee_id, work_date, hours, kind, project_id, note, source, status, submitted_at, corrects_id)
  values (t.org_id, t.employee_id, t.work_date, -t.hours, t.kind, t.project_id,
          left('Rättelse' || case when coalesce(p_note, '') = '' then '' else ': ' || p_note end, 500), 'manual', 'submitted', now(), t.id)
  returning id into v_reversal;
  if p_replacement is not null then
    insert into public.time_entries (org_id, employee_id, work_date, start_time, end_time, break_minutes, hours, kind, project_id, note,
                                     source, status, submitted_at, corrects_id)
    values (t.org_id, t.employee_id, t.work_date, nullif(p_replacement->>'start', '')::time, nullif(p_replacement->>'end', '')::time,
            coalesce((p_replacement->>'breakMinutes')::int, 0), coalesce((p_replacement->>'hours')::numeric, 0),
            coalesce(p_replacement->>'kind', t.kind),
            case when p_replacement ? 'projectId' then nullif(p_replacement->>'projectId', '')::uuid else t.project_id end,
            left(coalesce(p_replacement->>'note', ''), 500), 'manual', 'submitted', now(), t.id)
    returning id into v_new;
  end if;
  perform public.hr_log(t.org_id, t.employee_id, 'time.corrected',
    jsonb_build_object('entryId', t.id, 'reversalId', v_reversal, 'replacementId', v_new, 'date', t.work_date, 'hours', t.hours,
                       'note', left(coalesce(p_note, ''), 200)));
  return v_reversal;
end;
$$;

-- Låser en period: inga utkast eller inskickade rader får finnas kvar i
-- den, de godkända blir låsta, och därefter tar perioden inte emot tid
-- eller frånvaro. Ett lås tas inte bort.
create or replace function public.time_lock_period(p_org uuid, p_start date, p_end date, p_note text default '') returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_open int;
  v_id uuid;
  v_n int;
begin
  if not public.can_payroll_approve(p_org) then
    raise exception 'Bara ägare och administratörer låser perioder.' using errcode = '42501';
  end if;
  if p_start is null or p_end is null or p_end < p_start then
    raise exception 'Perioden behöver ett start- och slutdatum.' using errcode = '22023';
  end if;
  select count(*) into v_open from public.time_entries
   where org_id = p_org and work_date between p_start and p_end and status in ('draft','submitted');
  if v_open > 0 then
    raise exception '% tidrader i perioden är inte godkända; godkänn, skicka tillbaka eller ta bort dem först.', v_open using errcode = '22023';
  end if;
  update public.time_entries set status = 'locked'
   where org_id = p_org and work_date between p_start and p_end and status = 'approved';
  get diagnostics v_n = row_count;
  insert into public.time_locks (org_id, period_start, period_end, note) values (p_org, p_start, p_end, left(coalesce(p_note, ''), 200))
  returning id into v_id;
  perform public.time_log(p_org, v_id, 'time.locked', jsonb_build_object('from', p_start, 'to', p_end, 'entries', v_n));
  return v_id;
end;
$$;

-- Namnen på personalen för tidsidorna: lönebehöriga alla, personal (som
-- leder projekt och erbjuder pass) bara namn och id, utan personuppgifter.
create or replace function public.time_people(p_org uuid) returns table (id uuid, name text, user_id uuid, ended_at date)
  language sql stable security definer set search_path = public
as $$
  select e.id, e.name, e.user_id, e.ended_at from public.employees e
   where e.org_id = p_org and (public.can_payroll_read(p_org) or public.can_write_org(p_org))
   order by e.name
$$;

-- Projekten en anställd kan stämpla på: organisationens pågående projekt,
-- bara id och namn (den anställde ser inte projekten annars).
create or replace function public.time_projects(p_org uuid) returns table (id uuid, title text, leader_user_id uuid, status text)
  language sql stable security definer set search_path = public
as $$
  select p.id, p.title, p.leader_user_id, p.status from public.portal_projects p
   where p.org_id = p_org and exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid())
   order by p.status = 'active' desc, p.title
$$;

revoke all on function public.is_project_leader(uuid) from public, anon;
revoke all on function public.can_approve_time(uuid) from public, anon;
revoke all on function public.time_locked(uuid, date) from public, anon;
revoke all on function public.time_block_hours(time, time, int) from public, anon;
revoke all on function public.sick_rules() from public, anon;
revoke all on function public.absence_locked_parts(uuid, text, numeric, date, date) from public, anon, authenticated;
revoke all on function public.sick_relink(uuid) from public, anon, authenticated;
revoke all on function public.hr_set_schedule(uuid, jsonb, date, text) from public, anon;
revoke all on function public.shift_pool(uuid) from public, anon;
revoke all on function public.shift_offer(uuid, jsonb, uuid[]) from public, anon;
revoke all on function public.shift_answer(uuid, boolean) from public, anon;
revoke all on function public.shift_withdraw(uuid) from public, anon;
revoke all on function public.time_submit(uuid[]) from public, anon;
revoke all on function public.time_entry_approvable(public.time_entries) from public, anon;
revoke all on function public.time_cost_basis(uuid[]) from public, anon;
revoke all on function public.time_approve(uuid[], jsonb) from public, anon;
revoke all on function public.time_return(uuid[], text) from public, anon;
revoke all on function public.time_correct(uuid, jsonb, text) from public, anon;
revoke all on function public.time_lock_period(uuid, date, date, text) from public, anon;
revoke all on function public.time_people(uuid) from public, anon;
revoke all on function public.time_projects(uuid) from public, anon;
grant execute on function public.is_project_leader(uuid) to authenticated;
grant execute on function public.can_approve_time(uuid) to authenticated;
grant execute on function public.time_locked(uuid, date) to authenticated;
grant execute on function public.time_block_hours(time, time, int) to authenticated;
grant execute on function public.sick_rules() to authenticated;
grant execute on function public.hr_set_schedule(uuid, jsonb, date, text) to authenticated;
grant execute on function public.shift_pool(uuid) to authenticated;
grant execute on function public.shift_offer(uuid, jsonb, uuid[]) to authenticated;
grant execute on function public.shift_answer(uuid, boolean) to authenticated;
grant execute on function public.shift_withdraw(uuid) to authenticated;
grant execute on function public.time_submit(uuid[]) to authenticated;
grant execute on function public.time_entry_approvable(public.time_entries) to authenticated;
grant execute on function public.time_cost_basis(uuid[]) to authenticated;
grant execute on function public.time_approve(uuid[], jsonb) to authenticated;
grant execute on function public.time_return(uuid[], text) to authenticated;
grant execute on function public.time_correct(uuid, jsonb, text) to authenticated;
grant execute on function public.time_lock_period(uuid, date, date, text) to authenticated;
grant execute on function public.time_people(uuid) to authenticated;
grant execute on function public.time_projects(uuid) to authenticated;

commit;
