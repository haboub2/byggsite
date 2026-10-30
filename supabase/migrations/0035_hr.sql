-- Personal och anställningar, fas 1 (docs/hr-lon.md, avsnitt 2, 3, 10 och 12).
--
-- Bara fas 1: personer, skatteuppgifter, anställningar (versionerade),
-- avtalsdokument och semesterårsmodellen. Tid, lön och AGI kommer i senare
-- faser med egna migrationer.
--
-- 1. Rollen employee. En anställd som loggar in är medlem med rollen
--    employee och ser bara sina egna rader. is_org_member() betyder från och
--    med nu "medlem som får läsa organisationen" och släpper inte in employee,
--    så alla befintliga policies (fakturor, kunder, loggboken, exports) håller
--    den anställde ute utan att skrivas om. Medlemmen ser sin egen
--    medlemsrad och sin organisations namn.
-- 2. Behörighet: can_payroll_read (owner, admin, accountant),
--    can_payroll_approve (owner, admin; skriver också personal och avtal),
--    is_self (raden gäller den inloggade).
-- 3. Tabellerna employees, employee_tax, employments, employment_documents,
--    leave_balances. Personnummer och kontonummer krypteras som i 0023 (en
--    Vault-nyckel per hemlighet, härledd per organisation, pgp_sym_encrypt).
--    Ett nycklat HMAC (pnr_hash) hittar en person utan att dekryptera.
--    birth_date står i klartext så att avgiftens åldersgrupp aldrig behöver
--    personnumret. Kryptotexterna går inte att välja för någon roll; de
--    läses bara genom hr_employee_pnr() och hr_employee_bank_account(), för
--    owner/admin, och varje läsning skrivs i loggboken.
-- 4. Versioner: en anställning ändras aldrig. En ny version (lönehöjning,
--    ny form, förlängning) är en ny rad med valid_from; triggern stänger den
--    förra (valid_to = dagen före) i samma sats. Skatteraderna är rader med
--    valid_from; den senaste som börjat gäller.
-- 5. Loggboken: varje ny person, version, skatterad, avtal och signering
--    blir en händelse (aggregate_type 'employee'), som bara de med
--    lönebehörighet ser.
-- 6. Bucketen hr (privat) för avtalen: {org}/{person}/{dokument}.pdf,
--    skrivs en gång av owner/admin och ändras aldrig.
-- 7. LAS-klockorna i databasen: las_clocks() räknar exakt som
--    lib/core/payroll/employment-clocks.ts (referensen) och
--    employment_clocks(org) ger dem per person. Regelvärdena i las_rules()
--    är payrollRulesAt(...).las; lib/core/hr/clock-parity.test.ts håller
--    dem lika.
--
-- Nycklarna hr_pnr_key, hr_pnr_hash_key och hr_bank_key skapas i Vault om de
-- saknas (slumpade, 32 byte); de lämnar aldrig databasen.

begin;

-- =====================================================================
-- 1. Rollen employee
-- =====================================================================

alter table memberships drop constraint memberships_role_check;
alter table memberships add constraint memberships_role_check
  check (role in ('owner','admin','staff','accountant','readonly','employee'));
alter table invitations drop constraint invitations_role_check;
alter table invitations add constraint invitations_role_check
  check (role in ('owner','admin','staff','accountant','readonly','employee'));

-- Medlem som får läsa organisationens data: alla roller utom employee.
create or replace function public.is_org_member(org uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.memberships where org_id = org and user_id = auth.uid() and role <> 'employee')
$$;

-- Den anställde ser sin egen medlemsrad och organisationens namn (proxyn
-- läser dem för att veta vart den inloggade hör).
create policy "memberships_self_select" on memberships
  for select to authenticated using (user_id = auth.uid());
create policy "organizations_self_select" on organizations
  for select to authenticated using (exists(select 1 from public.memberships m where m.org_id = organizations.id and m.user_id = auth.uid()));

-- Exportarkiven (0030) kollade medlemskap direkt; employee ska inte in.
drop policy "exports_member_read" on storage.objects;
create policy "exports_member_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'exports'
    and (storage.foldername(name))[1] in (select m.org_id::text from public.memberships m where m.user_id = auth.uid() and m.role <> 'employee')
  );

-- =====================================================================
-- 2. Behörighet
-- =====================================================================

-- Läser personal, avtal, skatt, löner: owner, admin, accountant.
create or replace function public.can_payroll_read(org uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select public.has_org_role(org, array['owner','admin','accountant']) $$;

-- Godkänner löner och skriver personal, avtal och skatt: owner, admin.
create or replace function public.can_payroll_approve(org uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select public.has_org_role(org, array['owner','admin']) $$;

-- =====================================================================
-- 3. Nycklar och kryptering
-- =====================================================================

do $$
declare
  v_name text;
begin
  foreach v_name in array array['hr_pnr_key', 'hr_pnr_hash_key', 'hr_bank_key'] loop
    if not exists (select 1 from vault.decrypted_secrets where name = v_name) then
      perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), v_name, 'Personal och lön (0035)');
    end if;
  end loop;
end $$;

-- Vault-nyckeln för p_name, härledd per organisation som rot_pnr_key().
create or replace function public.hr_key(p_name text, p_org uuid) returns text
  language plpgsql stable security definer set search_path = public, extensions, vault
as $$
declare
  v_key text;
begin
  if p_name not in ('hr_pnr_key', 'hr_pnr_hash_key', 'hr_bank_key') then
    raise exception 'Okänd nyckel %.', p_name;
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = p_name limit 1;
  if v_key is null or length(v_key) < 32 then
    raise exception 'Nyckeln % saknas i Supabase Vault, se 0035_hr.sql.', p_name;
  end if;
  return v_key || ':' || p_org::text;
end;
$$;

create or replace function public.hr_encrypt(p_name text, p_org uuid, p_plain text) returns bytea
  language sql volatile security definer set search_path = public, extensions, vault
as $$ select pgp_sym_encrypt(p_plain, public.hr_key(p_name, p_org), 'cipher-algo=aes256') $$;

create or replace function public.hr_decrypt(p_name text, p_org uuid, p_enc bytea) returns text
  language sql stable security definer set search_path = public, extensions, vault
as $$ select pgp_sym_decrypt(p_enc, public.hr_key(p_name, p_org)) $$;

-- Nycklat HMAC av det tolvsiffriga personnumret: samma person, samma värde
-- i organisationen; går inte att räkna fram utan nyckeln.
create or replace function public.hr_pnr_hash(p_org uuid, p_pnr12 text) returns text
  language sql stable security definer set search_path = public, extensions, vault
as $$ select encode(hmac(p_pnr12, public.hr_key('hr_pnr_hash_key', p_org), 'sha256'), 'hex') $$;

-- Födelsedagen ur ett tolvsiffrigt personnummer; samordningsnummer har
-- dagen + 60. Fel om datumet inte finns.
create or replace function public.hr_pnr_birth_date(p_pnr12 text) returns date
  language plpgsql immutable set search_path = public
as $$
declare
  v_day int;
begin
  if p_pnr12 !~ '^\d{12}$' then
    raise exception 'Personnummer skrivs med tolv siffror.' using errcode = '22023';
  end if;
  v_day := substr(p_pnr12, 7, 2)::int;
  if v_day > 60 then v_day := v_day - 60; end if;
  return make_date(substr(p_pnr12, 1, 4)::int, substr(p_pnr12, 5, 2)::int, v_day);
exception when datetime_field_overflow or invalid_datetime_format then
  raise exception 'Personnumret har inget giltigt födelsedatum.' using errcode = '22023';
end;
$$;

-- Vem som gör något, för loggboken.
create or replace function public.hr_actor() returns jsonb
  language sql stable set search_path = public
as $$
  select case
    when auth.uid() is null then '{"kind":"system","name":"system"}'::jsonb
    else jsonb_build_object('kind', 'user', 'id', auth.uid(), 'name', coalesce(auth.jwt()->>'email', ''))
  end
$$;

revoke all on function public.hr_key(text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.hr_encrypt(text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_decrypt(text, uuid, bytea) from public, anon, authenticated, service_role;
revoke all on function public.hr_pnr_hash(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.hr_pnr_birth_date(text) from public, anon;
revoke all on function public.hr_actor() from public, anon;

-- =====================================================================
-- 4. Personer
-- =====================================================================

create table employees (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  name                  text not null check (length(btrim(name)) between 1 and 120),
  email                 text not null default '',
  phone                 text not null default '',
  street                text not null default '',
  postal_code           text not null default '',
  city                  text not null default '',
  pnr_enc               bytea,
  pnr_hash              text,
  pnr_masked            text not null default '',            -- ÅÅÅÅMMDD-XXXX
  birth_date            date,                                -- avgiftens åldersgrupp, utan dekryptering
  bank_clearing         text not null default '',
  bank_account_enc      bytea,
  bank_account_masked   text not null default '',            -- ••••1234
  user_id               uuid references auth.users(id) on delete set null,
  is_owner              boolean not null default false,
  is_board_member       boolean not null default false,
  agreement             text not null default 'none' check (agreement in ('byggavtalet','tjanstemannaavtalet','none')),
  emergency_contact     text not null default '',
  notes                 text not null default '',
  ended_at              date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, pnr_hash),
  unique (org_id, user_id),
  check ((pnr_enc is null) = (pnr_hash is null))
);
create index employees_org_idx on employees (org_id, name);
create trigger employees_set_updated_at before update on employees
  for each row execute function set_updated_at();
create trigger employees_no_delete before delete on employees
  for each row execute function forbid_change();

-- Raden gäller den inloggade, som fortfarande är medlem i organisationen.
create or replace function public.is_self(p_employee uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.employees e
    join public.memberships m on m.org_id = e.org_id and m.user_id = e.user_id
    where e.id = p_employee and e.user_id = auth.uid()
  )
$$;

-- =====================================================================
-- 5. Skatteuppgifter (versionerade)
-- =====================================================================

-- kind 'table': A-skattsedel (tabell och kolumn), eller 30 % som sidoinkomst
-- när vi inte är huvudarbetsgivare. 'none': Skatteverket har beslutat att
-- inget skatteavdrag görs här. Ett procentbeslut är en jämkning med sitt
-- slutdatum, inte en egen sort (docs/hr-lon.md, Läge fas 0). En
-- huvudarbetsgivare utan tabell är ett fel, aldrig tyst 30 %.
create table employee_tax (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null,
  employee_id                 uuid not null,
  kind                        text not null check (kind in ('table','none')),
  table_no                    int check (table_no between 20 and 50),
  column_no                   int check (column_no between 1 and 6),
  adjustment_percent          numeric(5,2) check (adjustment_percent between 0 and 100),
  adjustment_monthly_change_ore bigint,
  adjustment_valid_to         date,
  main_employer               boolean not null default true,
  source                      text not null check (source in ('a-skattsedel','skatteverket-api','manual')),
  valid_from                  date not null,
  note                        text not null default '',
  created_at                  timestamptz not null default now(),
  created_by                  uuid default auth.uid(),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade,
  unique (employee_id, valid_from),
  check (kind = 'table' or (table_no is null and column_no is null and adjustment_valid_to is null)),
  check (not (kind = 'table' and main_employer) or (table_no is not null and column_no is not null)),
  check ((table_no is null) = (column_no is null)),
  check (adjustment_percent is null or adjustment_monthly_change_ore is null),
  check ((adjustment_valid_to is null) = (adjustment_percent is null and adjustment_monthly_change_ore is null))
);
create index employee_tax_employee_idx on employee_tax (employee_id, valid_from desc);
create trigger employee_tax_immutable before update or delete on employee_tax
  for each row execute function forbid_change();

-- =====================================================================
-- 6. Anställningar (versionerade) och avtal
-- =====================================================================

create table employments (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  employee_id           uuid not null,
  contract_id           uuid not null,                       -- första versionens id; samma för alla versioner
  version               int not null,
  form                  text not null check (form in ('tillsvidare','provanstallning','vikariat','sava','sasong','vd','uppdrag')),
  pay_form              text not null check (pay_form in ('monthly','hourly','fee')),
  monthly_salary_ore    bigint check (monthly_salary_ore >= 0),
  hourly_rate_ore       bigint check (hourly_rate_ore >= 0),
  fee_ore               bigint check (fee_ore >= 0),          -- arvode per fee_period, beslutat av stämman
  fee_period            text check (fee_period in ('month','quarter','year')),
  decision_reference    text not null default '',            -- stämmans beslut (uppdrag)
  title                 text not null default '',            -- befattning
  workplace             text not null default '',            -- arbetsplats
  working_time_percent  numeric(5,2) not null default 100 check (working_time_percent > 0 and working_time_percent <= 100),
  weekly_hours          numeric(4,1) check (weekly_hours > 0 and weekly_hours <= 60),
  schedule_id           uuid,                                -- schema, fas 2
  substitute_for        text not null default '',            -- vikariat: vem eller vilken tjänst
  substitute_for_employee_id uuid,
  probation_ends_on     date,
  starts_on             date not null,
  ends_on               date,
  notice_days           int check (notice_days >= 0),
  pay_day               int check (pay_day between 1 and 31),
  vacation_rule         text not null check (vacation_rule in ('procent','sammalon','none')),
  vacation_days         int not null default 25 check (vacation_days >= 0),
  vacation_percent      numeric(4,2) check (vacation_percent >= 0),
  atf_hours_per_year    numeric(5,1) not null default 0 check (atf_hours_per_year >= 0),
  pension_scheme        text not null default 'none' check (pension_scheme in ('saf-lo','itp1','none')),
  terms                 text not null default '',            -- övriga villkor, skrivs i avtalet
  change_reason         text not null default '',
  valid_from            date not null,
  valid_to              date,
  document_id           uuid,
  created_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade,
  unique (id, org_id),
  unique (contract_id, version),
  check (ends_on is null or ends_on >= starts_on),
  check (valid_from >= starts_on),
  check (valid_to is null or valid_to >= valid_from - 1),
  check (pay_form <> 'monthly' or monthly_salary_ore is not null),
  check (pay_form <> 'hourly' or hourly_rate_ore is not null),
  check (pay_form <> 'fee' or (fee_ore is not null and fee_period is not null)),
  check ((form = 'uppdrag') = (pay_form = 'fee')),
  check (form <> 'uppdrag' or vacation_rule = 'none'),
  check (form <> 'vikariat' or substitute_for <> '' or substitute_for_employee_id is not null),
  check (form <> 'provanstallning' or probation_ends_on is not null),
  check (probation_ends_on is null or probation_ends_on >= starts_on),
  check (vacation_rule <> 'procent' or vacation_percent is not null)
);
create unique index employments_current_idx on employments (contract_id) where valid_to is null;
create index employments_employee_idx on employments (employee_id, starts_on);
create index employments_org_idx on employments (org_id);

create table employment_documents (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  employee_id           uuid not null,
  employment_id         uuid not null,
  kind                  text not null default 'contract' check (kind in ('contract','amendment','termination','certificate')),
  title                 text not null,
  template              text not null,                       -- t.ex. contract-sava
  template_version      text not null,                       -- lib/core/hr/contract.ts CONTRACT_TEMPLATE_VERSION
  storage_path          text not null unique,                -- hr/{org}/{person}/{dokument}.pdf
  sha256                text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes            int not null check (size_bytes > 0),
  signed_at             date,
  signed_marked_by      uuid,
  signed_marked_at      timestamptz,
  created_at            timestamptz not null default now(),
  created_by            uuid default auth.uid(),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade,
  foreign key (employment_id, org_id) references employments(id, org_id) on delete cascade
);
create index employment_documents_employee_idx on employment_documents (employee_id, created_at desc);

alter table employments add constraint employments_document_fk
  foreign key (document_id) references employment_documents(id);

-- Semesterår per person: modellen (startdag och om dagarna tjänas in året
-- före eller samma år) som vacationYears() i lib/core/payroll/vacation.ts.
-- Saldona fylls av lönekörningen (fas 3); här finns modellen och raden.
create table leave_balances (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  employee_id           uuid not null,
  year_start_month_day  text not null default '04-01' check (year_start_month_day ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$'),
  earning_model         text not null default 'previous-year' check (earning_model in ('previous-year','same-year')),
  vacation_year_start   date not null,
  earned_days           numeric(5,2) not null default 0,
  paid_days             numeric(5,2) not null default 0,
  saved_days            numeric(5,2) not null default 0,
  vacation_debt_ore     bigint not null default 0,
  updated_at            timestamptz not null default now(),
  foreign key (employee_id, org_id) references employees(id, org_id) on delete cascade,
  unique (employee_id, vacation_year_start),
  check (to_char(vacation_year_start, 'MM-DD') = year_start_month_day)
);
create trigger leave_balances_set_updated_at before update on leave_balances
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------- versioner

-- En ny version: contract_id och versionsnummer sätts, den förra versionen
-- stängs dagen före. Den nya måste börja efter den förra och gälla samma
-- person. contract_id null = ett nytt avtal. En version från samma dag som
-- den förra ersätter den (den förra blir tom och räknas inte).
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
  -- Samma dag som den förra: den förra fick aldrig verkan (en rättelse före start).
  if new.valid_from < v_prev.valid_from then
    raise exception 'Den nya versionen kan gälla tidigast från %.', v_prev.valid_from using errcode = '22023';
  end if;
  new.version := v_prev.version + 1;
  update public.employments set valid_to = new.valid_from - 1 where id = v_prev.id;
  return new;
end;
$$;
create trigger employments_version before insert on employments
  for each row execute function employments_version();

-- En stängd version ändras aldrig: bara valid_to (en gång, av triggern
-- ovan) och document_id (avtalet som signerades) får sättas.
create or replace function public.employments_freeze() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if (to_jsonb(new) - 'valid_to' - 'document_id') is distinct from (to_jsonb(old) - 'valid_to' - 'document_id') then
    raise exception 'En anställning ändras inte; lägg till en ny version.' using errcode = '0A000';
  end if;
  if old.valid_to is not null and new.valid_to is distinct from old.valid_to then
    raise exception 'Versionen är redan stängd.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
create trigger employments_freeze before update on employments
  for each row execute function employments_freeze();
create trigger employments_no_delete before delete on employments
  for each row execute function forbid_change();

-- Ett avtal är fryst: bara signeringen (en gång) får sättas.
create or replace function public.employment_documents_freeze() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if (to_jsonb(new) - 'signed_at' - 'signed_marked_by' - 'signed_marked_at')
     is distinct from (to_jsonb(old) - 'signed_at' - 'signed_marked_by' - 'signed_marked_at') then
    raise exception 'Ett avtal ändras inte; skapa ett nytt.' using errcode = '0A000';
  end if;
  if old.signed_at is not null then
    raise exception 'Avtalet är redan markerat som signerat.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
create trigger employment_documents_freeze before update on employment_documents
  for each row execute function employment_documents_freeze();
create trigger employment_documents_no_delete before delete on employment_documents
  for each row execute function forbid_change();

-- ---------------------------------------------------------------- loggboken

create or replace function public.hr_log(p_org uuid, p_employee uuid, p_type text, p_data jsonb) returns void
  language sql volatile security definer set search_path = public
as $$
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
  values (p_org, 'employee', p_employee, p_type, coalesce(p_data, '{}'::jsonb), public.hr_actor())
$$;
revoke all on function public.hr_log(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.hr_events() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_table_name = 'employees' then
    if tg_op = 'INSERT' then
      perform public.hr_log(new.org_id, new.id, 'employee.created', jsonb_build_object('name', new.name));
    elsif (to_jsonb(new) - 'updated_at') is distinct from (to_jsonb(old) - 'updated_at') then
      -- Vilka fält som ändrades, aldrig deras värden (krypterade fält syns som namn).
      perform public.hr_log(new.org_id, new.id, 'employee.updated', jsonb_build_object('fields',
        (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_each(to_jsonb(new) - 'updated_at') n(k, v)
          where n.v is distinct from to_jsonb(old)->n.k)));
    end if;
  elsif tg_table_name = 'employments' then
    perform public.hr_log(new.org_id, new.employee_id,
      case when new.version = 1 then 'employment.created' else 'employment.versioned' end,
      jsonb_build_object('employmentId', new.id, 'contractId', new.contract_id, 'version', new.version,
                         'form', new.form, 'payForm', new.pay_form, 'validFrom', new.valid_from));
  elsif tg_table_name = 'employee_tax' then
    perform public.hr_log(new.org_id, new.employee_id, 'employee_tax.versioned',
      jsonb_build_object('kind', new.kind, 'tableNo', new.table_no, 'columnNo', new.column_no,
                         'mainEmployer', new.main_employer, 'source', new.source, 'validFrom', new.valid_from));
  elsif tg_table_name = 'employment_documents' then
    if tg_op = 'INSERT' then
      perform public.hr_log(new.org_id, new.employee_id, 'employment_document.created',
        jsonb_build_object('documentId', new.id, 'employmentId', new.employment_id, 'template', new.template, 'sha256', new.sha256));
    elsif old.signed_at is null and new.signed_at is not null then
      perform public.hr_log(new.org_id, new.employee_id, 'employment_document.signed',
        jsonb_build_object('documentId', new.id, 'employmentId', new.employment_id, 'signedAt', new.signed_at));
    end if;
  end if;
  return null;
end;
$$;
revoke all on function public.hr_events() from public, anon, authenticated, service_role;
create trigger employees_events after insert or update on employees for each row execute function hr_events();
create trigger employments_events after insert on employments for each row execute function hr_events();
create trigger employee_tax_events after insert on employee_tax for each row execute function hr_events();
create trigger employment_documents_events after insert or update on employment_documents for each row execute function hr_events();

-- Personalens händelser syns bara för den som får läsa personal.
create policy "events_hr_payroll_only" on events as restrictive
  for select to authenticated using (aggregate_type <> 'employee' or public.can_payroll_read(org_id));

-- En anställd som blir medlem (inbjudan med rollen employee) kopplas till
-- sin personrad via e-postadressen, om raden inte redan har en inloggning.
create or replace function public.hr_link_employee_login() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if new.role = 'employee' then
    update public.employees e set user_id = new.user_id
     where e.org_id = new.org_id and e.user_id is null and e.email <> ''
       and lower(e.email) = (select lower(u.email) from auth.users u where u.id = new.user_id)
       and not exists (select 1 from public.employees x where x.org_id = new.org_id and x.user_id = new.user_id);
  end if;
  return null;
end;
$$;
revoke all on function public.hr_link_employee_login() from public, anon, authenticated, service_role;
create trigger memberships_link_employee after insert on memberships
  for each row execute function hr_link_employee_login();

-- =====================================================================
-- 7. RLS och kolumnrättigheter
-- =====================================================================

alter table employees            enable row level security;
alter table employee_tax         enable row level security;
alter table employments          enable row level security;
alter table employment_documents enable row level security;
alter table leave_balances       enable row level security;

create policy "employees_payroll_select" on employees
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(id));
create policy "employees_payroll_update" on employees
  for update to authenticated using (public.can_payroll_approve(org_id)) with check (public.can_payroll_approve(org_id));
-- Nya personer skapas med hr_create_employee() (personnumret krypteras där).

create policy "employee_tax_payroll_select" on employee_tax
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));
create policy "employee_tax_payroll_insert" on employee_tax
  for insert to authenticated with check (public.can_payroll_approve(org_id));

create policy "employments_payroll_select" on employments
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));
create policy "employments_payroll_insert" on employments
  for insert to authenticated with check (public.can_payroll_approve(org_id));

create policy "employment_documents_payroll_select" on employment_documents
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));
create policy "employment_documents_payroll_insert" on employment_documents
  for insert to authenticated with check (public.can_payroll_approve(org_id));

create policy "leave_balances_payroll_select" on leave_balances
  for select to authenticated using (public.can_payroll_read(org_id) or public.is_self(employee_id));
create policy "leave_balances_payroll_write" on leave_balances
  for all to authenticated using (public.can_payroll_approve(org_id)) with check (public.can_payroll_approve(org_id));

-- Kryptotexterna och hashen går inte att välja för någon roll. Skrivning
-- bara i de kolumner formuläret äger; versioner och avtal ändras genom
-- funktionerna nedan.
revoke all on employees, employee_tax, employments, employment_documents, leave_balances from anon, authenticated;
grant select (id, org_id, name, email, phone, street, postal_code, city, pnr_masked, birth_date, bank_clearing,
              bank_account_masked, user_id, is_owner, is_board_member, agreement, emergency_contact, notes, ended_at,
              created_at, updated_at) on employees to authenticated;
grant update (name, email, phone, street, postal_code, city, user_id, is_owner, is_board_member, agreement,
              emergency_contact, notes, ended_at) on employees to authenticated;
grant select, insert on employee_tax, employments, employment_documents to authenticated;
grant select, insert, update on leave_balances to authenticated;

-- =====================================================================
-- 8. Funktionerna för personnummer, konto, avtal
-- =====================================================================

-- Ny person med personnummer (tolv siffror; formuläret normaliserar och
-- kontrollerar kontrollsiffran) och valfritt bankkonto, i en transaktion.
create or replace function public.hr_create_employee(
  p_org uuid,
  p_employee jsonb,
  p_pnr12 text,
  p_bank_clearing text default '',
  p_bank_account text default ''
) returns uuid
  language plpgsql security definer set search_path = public, extensions, vault
as $$
declare
  v_id uuid;
  v_pnr text := nullif(btrim(coalesce(p_pnr12, '')), '');
  v_account text := regexp_replace(coalesce(p_bank_account, ''), '\D', '', 'g');
  v_hash text;
begin
  if not public.can_payroll_approve(p_org) then
    raise exception 'Bara ägare och administratörer lägger till personal.' using errcode = '42501';
  end if;
  if v_pnr is not null then
    perform public.hr_pnr_birth_date(v_pnr);
    v_hash := public.hr_pnr_hash(p_org, v_pnr);
    if exists (select 1 from public.employees where org_id = p_org and pnr_hash = v_hash) then
      raise exception 'Det finns redan en person med det personnumret.' using errcode = '23505';
    end if;
  end if;
  insert into public.employees (org_id, name, email, phone, street, postal_code, city, is_owner, is_board_member, agreement,
                                emergency_contact, notes, pnr_enc, pnr_hash, pnr_masked, birth_date,
                                bank_clearing, bank_account_enc, bank_account_masked)
  values (p_org, btrim(p_employee->>'name'), coalesce(p_employee->>'email', ''), coalesce(p_employee->>'phone', ''),
          coalesce(p_employee->>'street', ''), coalesce(p_employee->>'postalCode', ''), coalesce(p_employee->>'city', ''),
          coalesce((p_employee->>'isOwner')::boolean, false), coalesce((p_employee->>'isBoardMember')::boolean, false),
          coalesce(p_employee->>'agreement', 'none'), coalesce(p_employee->>'emergencyContact', ''), coalesce(p_employee->>'notes', ''),
          case when v_pnr is null then null else public.hr_encrypt('hr_pnr_key', p_org, v_pnr) end,
          v_hash,
          case when v_pnr is null then '' else substr(v_pnr, 1, 8) || '-XXXX' end,
          case when v_pnr is null then null else public.hr_pnr_birth_date(v_pnr) end,
          case when v_account = '' then '' else regexp_replace(coalesce(p_bank_clearing, ''), '[^\d-]', '', 'g') end,
          case when v_account = '' then null else public.hr_encrypt('hr_bank_key', p_org, v_account) end,
          case when v_account = '' then '' else '••••' || right(v_account, 4) end)
  returning id into v_id;
  return v_id;
end;
$$;

-- Byter eller lägger in personnumret (och därmed födelsedagen).
create or replace function public.hr_employee_set_pnr(p_employee uuid, p_pnr12 text) returns void
  language plpgsql security definer set search_path = public, extensions, vault
as $$
declare
  v_org uuid;
  v_hash text;
begin
  select org_id into v_org from public.employees where id = p_employee;
  if not found or not public.can_payroll_approve(v_org) then
    raise exception 'Bara ägare och administratörer ändrar personnummer.' using errcode = '42501';
  end if;
  v_hash := public.hr_pnr_hash(v_org, p_pnr12);
  if exists (select 1 from public.employees where org_id = v_org and pnr_hash = v_hash and id <> p_employee) then
    raise exception 'Det finns redan en person med det personnumret.' using errcode = '23505';
  end if;
  update public.employees set
    pnr_enc = public.hr_encrypt('hr_pnr_key', v_org, p_pnr12),
    pnr_hash = v_hash,
    pnr_masked = substr(p_pnr12, 1, 8) || '-XXXX',
    birth_date = public.hr_pnr_birth_date(p_pnr12)
  where id = p_employee;
end;
$$;

-- Byter eller tar bort bankkontot (tomt kontonummer tar bort).
create or replace function public.hr_employee_set_bank(p_employee uuid, p_clearing text, p_account text) returns void
  language plpgsql security definer set search_path = public, extensions, vault
as $$
declare
  v_org uuid;
  v_account text := regexp_replace(coalesce(p_account, ''), '\D', '', 'g');
begin
  select org_id into v_org from public.employees where id = p_employee;
  if not found or not public.can_payroll_approve(v_org) then
    raise exception 'Bara ägare och administratörer ändrar bankkonton.' using errcode = '42501';
  end if;
  update public.employees set
    bank_clearing = case when v_account = '' then '' else regexp_replace(coalesce(p_clearing, ''), '[^\d-]', '', 'g') end,
    bank_account_enc = case when v_account = '' then null else public.hr_encrypt('hr_bank_key', v_org, v_account) end,
    bank_account_masked = case when v_account = '' then '' else '••••' || right(v_account, 4) end
  where id = p_employee;
end;
$$;

-- Personnumret i klartext, bara för owner/admin (eller service role), och
-- varje läsning står i loggboken med skälet.
create or replace function public.hr_employee_pnr(p_employee uuid, p_reason text default 'visning') returns text
  language plpgsql volatile security definer set search_path = public, extensions, vault
as $$
declare
  v_org uuid;
  v_enc bytea;
begin
  select org_id, pnr_enc into v_org, v_enc from public.employees where id = p_employee;
  if not found then
    raise exception 'Personen finns inte.';
  end if;
  if not (public.can_admin_org(v_org) or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Bara ägare och administratörer ser personnummer.' using errcode = '42501';
  end if;
  if v_enc is null then
    return null;
  end if;
  perform public.hr_log(v_org, p_employee, 'employee.pnr_revealed', jsonb_build_object('reason', left(coalesce(p_reason, ''), 80)));
  return public.hr_decrypt('hr_pnr_key', v_org, v_enc);
end;
$$;

create or replace function public.hr_employee_bank_account(p_employee uuid, p_reason text default 'visning') returns text
  language plpgsql volatile security definer set search_path = public, extensions, vault
as $$
declare
  v_org uuid;
  v_enc bytea;
begin
  select org_id, bank_account_enc into v_org, v_enc from public.employees where id = p_employee;
  if not found then
    raise exception 'Personen finns inte.';
  end if;
  if not (public.can_admin_org(v_org) or coalesce(auth.jwt()->>'role', '') = 'service_role') then
    raise exception 'Bara ägare och administratörer ser kontonummer.' using errcode = '42501';
  end if;
  if v_enc is null then
    return null;
  end if;
  perform public.hr_log(v_org, p_employee, 'employee.bank_revealed', jsonb_build_object('reason', left(coalesce(p_reason, ''), 80)));
  return public.hr_decrypt('hr_bank_key', v_org, v_enc);
end;
$$;

-- Finns personnumret redan i organisationen? Utan att dekryptera något.
create or replace function public.hr_find_employee_by_pnr(p_org uuid, p_pnr12 text) returns uuid
  language plpgsql stable security definer set search_path = public, extensions, vault
as $$
begin
  if not public.can_payroll_read(p_org) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  return (select id from public.employees where org_id = p_org and pnr_hash = public.hr_pnr_hash(p_org, p_pnr12));
end;
$$;

-- Markerar ett avtal som signerat (datumet då båda skrivit under) och gör
-- det till versionens avtal.
create or replace function public.hr_sign_document(p_document uuid, p_signed_on date) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_doc public.employment_documents%rowtype;
begin
  select * into v_doc from public.employment_documents where id = p_document;
  if not found or not public.can_payroll_approve(v_doc.org_id) then
    raise exception 'Bara ägare och administratörer markerar avtal som signerade.' using errcode = '42501';
  end if;
  if p_signed_on is null or p_signed_on > current_date + 1 or p_signed_on < v_doc.created_at::date - 1 then
    raise exception 'Signeringsdatumet ska vara mellan dagen avtalet skapades och i dag.' using errcode = '22023';
  end if;
  update public.employment_documents
     set signed_at = p_signed_on, signed_marked_by = auth.uid(), signed_marked_at = now()
   where id = p_document;
  update public.employments set document_id = p_document where id = v_doc.employment_id;
end;
$$;

revoke all on function public.can_payroll_read(uuid) from public, anon;
revoke all on function public.can_payroll_approve(uuid) from public, anon;
revoke all on function public.is_self(uuid) from public, anon;
revoke all on function public.hr_create_employee(uuid, jsonb, text, text, text) from public, anon;
revoke all on function public.hr_employee_set_pnr(uuid, text) from public, anon;
revoke all on function public.hr_employee_set_bank(uuid, text, text) from public, anon;
revoke all on function public.hr_employee_pnr(uuid, text) from public, anon;
revoke all on function public.hr_employee_bank_account(uuid, text) from public, anon;
revoke all on function public.hr_find_employee_by_pnr(uuid, text) from public, anon;
revoke all on function public.hr_sign_document(uuid, date) from public, anon;
grant execute on function public.can_payroll_read(uuid) to authenticated;
grant execute on function public.can_payroll_approve(uuid) to authenticated;
grant execute on function public.is_self(uuid) to authenticated;
grant execute on function public.hr_create_employee(uuid, jsonb, text, text, text) to authenticated;
grant execute on function public.hr_employee_set_pnr(uuid, text) to authenticated;
grant execute on function public.hr_employee_set_bank(uuid, text, text) to authenticated;
grant execute on function public.hr_employee_pnr(uuid, text) to authenticated, service_role;
grant execute on function public.hr_employee_bank_account(uuid, text) to authenticated, service_role;
grant execute on function public.hr_find_employee_by_pnr(uuid, text) to authenticated;
grant execute on function public.hr_sign_document(uuid, date) to authenticated;

-- =====================================================================
-- 9. Bucketen hr
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('hr', 'hr', false)
on conflict (id) do nothing;

-- Sökvägen {org}/{person}/{fil}: läses av lönebehöriga och av personen
-- själv, skrivs av owner/admin och bara för en person i organisationen.
-- Ingen policy för ändring eller borttagning: filerna är frysta.
create or replace function public.hr_storage_access(p_name text, p_write boolean) returns boolean
  language plpgsql stable security definer set search_path = public
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_org uuid;
  v_employee uuid;
begin
  if array_length(v_parts, 1) <> 3
     or v_parts[1] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or v_parts[2] !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  v_org := v_parts[1]::uuid;
  v_employee := v_parts[2]::uuid;
  if not exists (select 1 from public.employees where id = v_employee and org_id = v_org) then
    return false;
  end if;
  if p_write then
    return public.can_payroll_approve(v_org);
  end if;
  return public.can_payroll_read(v_org) or public.is_self(v_employee);
end;
$$;
revoke all on function public.hr_storage_access(text, boolean) from public, anon;
grant execute on function public.hr_storage_access(text, boolean) to authenticated;

create policy "hr_payroll_read" on storage.objects
  for select to authenticated using (bucket_id = 'hr' and public.hr_storage_access(name, false));
create policy "hr_payroll_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'hr' and public.hr_storage_access(name, true));

-- =====================================================================
-- 10. LAS-klockorna
-- =====================================================================
--
-- Samma regler som lib/core/payroll/employment-clocks.ts, som är
-- referensen; supabase/tests/0035_hr.sql kör dess testfall här.
--
-- Dagar är kalenderdagar, båda ändar inräknade, en dag räknas en gång även
-- när två perioder överlappar. SÄVA räknas i dagsekvivalenter: en obruten
-- sträcka räknar hela kalendermånader datum till datum som 30 dagar plus
-- sina udda dagar; tre eller fler SÄVA i samma kalendermånad gör att
-- dagarna mellan dem räknas (LAS 5 a § och 3 § andra stycket). SÄVA blir
-- tillsvidare när summan på fem år passerar 360, vikariat när den passerar
-- 730 (AD 2019 nr 56). Provanställning: sex månader, besked två veckor före.

create type public.las_period as (form text, starts_on date, ends_on date);

-- payrollRulesAt(...).las (lib/core/rules/payroll.ts). Ändras de där, ändras
-- de här i en ny migration; clock-parity-testet stoppar annars.
create or replace function public.las_rules(
  out sava_limit_days int, out sava_days_per_month int, out vikariat_limit_days int, out window_years int,
  out sava_same_month_threshold int, out probation_max_months int, out probation_notice_days int)
  language sql immutable
as $$ select 360, 30, 730, 5, 3, 6, 14 $$;

-- Samma datum n månader senare, sista dagen i månaden när datumet saknas (addMonths).
create or replace function public.las_add_months(p date, n int) returns date
  language sql immutable
as $$ select (p + make_interval(months => n))::date $$;

-- Sista dagen i den k:te hela månaden från p_start (monthEnd): 15 jan → 14 feb, 31 jan → 28 feb.
create or replace function public.las_month_end(p_start date, k int) returns date
  language sql immutable set search_path = public
as $$
  select case when extract(day from public.las_add_months(p_start, k)) < extract(day from p_start)
              then public.las_add_months(p_start, k)
              else public.las_add_months(p_start, k) - 1 end
$$;

-- Första dagen i femårsfönstret som slutar p (windowStart).
create or replace function public.las_window_start(p date, years int) returns date
  language sql immutable set search_path = public
as $$ select public.las_add_months(p, -12 * years) + 1 $$;

-- En obruten sträcka i dagsekvivalenter (monthEquivalent).
create or replace function public.las_month_equivalent(p_from date, p_to date, p_per_month int) returns int
  language plpgsql immutable set search_path = public
as $$
declare
  v_months int := 0;
begin
  while public.las_month_end(p_from, v_months + 1) <= p_to loop
    v_months := v_months + 1;
  end loop;
  return v_months * p_per_month
       + (p_to - case when v_months > 0 then public.las_month_end(p_from, v_months) else p_from - 1 end);
end;
$$;

-- Dagarna perioderna täcker fram till p_horizon, med luckorna fyllda i
-- månader med minst p_same_month perioder (coveredDays). Sorterade, unika.
create or replace function public.las_covered_days(p_periods public.las_period[], p_horizon date, p_same_month int) returns date[]
  language sql immutable set search_path = public
as $$
  with clipped as (
    select ord, p.starts_on as f, least(coalesce(p.ends_on, p_horizon), p_horizon) as t
      from unnest(p_periods) with ordinality as p(form, starts_on, ends_on, ord)
     where least(coalesce(p.ends_on, p_horizon), p_horizon) >= p.starts_on
  ), base as (
    select c.f + i as d from clipped c, generate_series(0, c.t - c.f) i
  ), months as (
    select distinct d - (extract(day from d)::int - 1) as m from base
  ), in_month as (
    select m.m, c.f, c.t,
           count(*) over (partition by m.m) as n,
           lag(c.t) over (partition by m.m order by c.f, c.ord) as prev_t
      from months m
      join clipped c on c.f <= public.las_add_months(m.m, 1) - 1 and c.t >= m.m
  ), gaps as (
    select g.lo + i as d
      from (select greatest(prev_t + 1, m) as lo, least(f - 1, public.las_add_months(m, 1) - 1) as hi
              from in_month
             where p_same_month is not null and n >= p_same_month and prev_t is not null) g,
           generate_series(0, g.hi - g.lo) i
  )
  select coalesce(array_agg(d order by d), '{}') from (select d from base union select d from gaps) x
$$;

-- Dagarna (eller dagsekvivalenterna) mellan p_from och p_to (measure).
create or replace function public.las_measure(p_days date[], p_from date, p_to date, p_per_month int) returns int
  language plpgsql immutable set search_path = public
as $$
declare
  v_total int := 0;
  v_start date;
  v_prev date;
  d date;
begin
  foreach d in array p_days loop
    continue when d < p_from;
    exit when d > p_to;
    if v_start is null then
      v_start := d;
    elsif d <> v_prev + 1 then
      v_total := v_total + case when p_per_month is null then v_prev - v_start + 1 else public.las_month_equivalent(v_start, v_prev, p_per_month) end;
      v_start := d;
    end if;
    v_prev := d;
  end loop;
  if v_start is not null then
    v_total := v_total + case when p_per_month is null then v_prev - v_start + 1 else public.las_month_equivalent(v_start, v_prev, p_per_month) end;
  end if;
  return v_total;
end;
$$;

-- En klocka (clock): dagar i fönstret som slutar p_as_of och den första dag
-- summan passerar gränsen om perioderna löper som de är bokade.
create or replace function public.las_clock(p_periods public.las_period[], p_as_of date, p_limit int, p_sava boolean,
  out days_in_window int, out limit_days int, out days_left int, out converted boolean, out converts_on date)
  language plpgsql immutable set search_path = public
as $$
declare
  r record := public.las_rules();
  v_per_month int := case when p_sava then r.sava_days_per_month end;
  v_horizon date := p_as_of + greatest(p_limit * 2, 3 * 366);
  v_days date[];
  v_d date;
  v_c int;
  v_prev int;
  v_step int;
  -- Från en dag till nästa rör sig summan högst så här mycket (en dag till,
  -- en 28-dagarsmånad som blir 30, en dag som lämnar fönstret).
  c_max_step constant int := 4;
begin
  v_days := public.las_covered_days(p_periods, v_horizon, case when p_sava then r.sava_same_month_threshold end);
  days_in_window := public.las_measure(v_days, public.las_window_start(p_as_of, r.window_years), p_as_of, v_per_month);
  limit_days := p_limit;
  days_left := greatest(0, p_limit - days_in_window);
  converted := days_in_window > p_limit;
  converts_on := null;
  if cardinality(v_days) = 0 then
    return;
  end if;
  v_d := p_as_of;
  v_c := days_in_window;
  if converted then
    -- Redan passerad: gå bakåt till den första dagen över gränsen.
    while v_d > p_as_of - 6 * 366 loop
      v_step := greatest(1, (v_c - p_limit - 1) / c_max_step);
      v_prev := public.las_measure(v_days, public.las_window_start(v_d - v_step, r.window_years), v_d - v_step, v_per_month);
      if v_prev > p_limit then
        v_d := v_d - v_step;
        v_c := v_prev;
      elsif v_step = 1 then
        exit;
      else
        v_c := p_limit + 1;
      end if;
    end loop;
    converts_on := v_d;
  else
    while v_d < v_horizon loop
      v_d := v_d + greatest(1, (p_limit - v_c) / c_max_step);
      v_c := public.las_measure(v_days, public.las_window_start(least(v_d, v_horizon), r.window_years), least(v_d, v_horizon), v_per_month);
      if v_c > p_limit then
        while public.las_measure(v_days, public.las_window_start(v_d - 1, r.window_years), v_d - 1, v_per_month) > p_limit loop
          v_d := v_d - 1;
        end loop;
        converts_on := v_d;
        exit;
      end if;
    end loop;
  end if;
end;
$$;

-- Alla tre klockorna för en persons perioder (employmentClocks).
create or replace function public.las_clocks(p_periods public.las_period[], p_as_of date)
returns table (
  sava_days int, sava_limit int, sava_days_left int, sava_converted boolean, sava_converts_on date,
  vikariat_days int, vikariat_limit int, vikariat_days_left int, vikariat_converted boolean, vikariat_converts_on date,
  probation_starts_on date, probation_ends_on date, probation_notice_by date, probation_days_left int, probation_converts_on date
)
  language plpgsql immutable set search_path = public
as $$
declare
  r record := public.las_rules();
  v_known public.las_period[];
  v_sava record;
  v_vik record;
  v_prob public.las_period;
  v_max_end date;
begin
  select coalesce(array_agg((u.form, u.starts_on, u.ends_on)::public.las_period order by u.ord), '{}') into v_known
    from unnest(p_periods) with ordinality as u(form, starts_on, ends_on, ord)
   where u.starts_on <= p_as_of + 3 * 366;
  select * into v_sava from public.las_clock(
    (select coalesce(array_agg((k.form, k.starts_on, k.ends_on)::public.las_period order by k.o), '{}')
       from unnest(v_known) with ordinality as k(form, starts_on, ends_on, o) where k.form = 'sava'),
    p_as_of, r.sava_limit_days, true);
  select * into v_vik from public.las_clock(
    (select coalesce(array_agg((k.form, k.starts_on, k.ends_on)::public.las_period order by k.o), '{}')
       from unnest(v_known) with ordinality as k(form, starts_on, ends_on, o) where k.form = 'vikariat'),
    p_as_of, r.vikariat_limit_days, false);
  sava_days := v_sava.days_in_window; sava_limit := v_sava.limit_days; sava_days_left := v_sava.days_left;
  sava_converted := v_sava.converted; sava_converts_on := v_sava.converts_on;
  vikariat_days := v_vik.days_in_window; vikariat_limit := v_vik.limit_days; vikariat_days_left := v_vik.days_left;
  vikariat_converted := v_vik.converted; vikariat_converts_on := v_vik.converts_on;

  -- Den provanställning som pågår, den senast påbörjade.
  select k.form, k.starts_on, k.ends_on into v_prob
    from unnest(v_known) as k
   where k.form = 'provanstallning' and k.starts_on <= p_as_of and (k.ends_on is null or k.ends_on >= p_as_of)
   order by k.starts_on desc
   limit 1;
  if v_prob.starts_on is not null then
    v_max_end := public.las_month_end(v_prob.starts_on, r.probation_max_months);
    probation_starts_on := v_prob.starts_on;
    probation_ends_on := case when v_prob.ends_on is not null and v_prob.ends_on < v_max_end then v_prob.ends_on else v_max_end end;
    probation_notice_by := probation_ends_on - r.probation_notice_days;
    probation_days_left := probation_ends_on - p_as_of;
    probation_converts_on := probation_ends_on + 1;
  end if;
  return next;
end;
$$;

-- En persons perioder ur anställningsversionerna (lib/core/hr/clocks.ts,
-- employmentPeriods): varje version gäller från max(starts_on, valid_from)
-- till min(ends_on, valid_to) (en provanställning också högst till
-- probation_ends_on); på varandra följande versioner av samma
-- avtal och samma form slås ihop till en period, så att en lönehöjning
-- under provanställningen inte flyttar dess start.
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
  ), islands as (
    select *, sum(case when form = prev_form then 0 else 1 end) over (partition by contract_id order by version) as island
      from (select *, lag(form) over (partition by contract_id order by version) as prev_form from live) x
  ), merged as (
    select contract_id, island, min(form) as form, min(f) as f,
           case when bool_or(t is null) then null else max(t) end as t
      from islands group by contract_id, island
  )
  select coalesce(array_agg((form, f, t)::public.las_period order by f, contract_id, island), '{}') from merged
$$;

-- Klockorna per person i organisationen, så som den som frågar får se
-- personerna (RLS: lönebehöriga alla, en anställd sig själv).
create or replace function public.employment_clocks(p_org uuid, p_as_of date default current_date)
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
    cross join lateral public.las_clocks(public.employment_periods(e.id), p_as_of) c
   where e.org_id = p_org
   order by e.name
$$;

revoke all on function public.las_rules() from public, anon;
revoke all on function public.las_add_months(date, int) from public, anon;
revoke all on function public.las_month_end(date, int) from public, anon;
revoke all on function public.las_window_start(date, int) from public, anon;
revoke all on function public.las_month_equivalent(date, date, int) from public, anon;
revoke all on function public.las_covered_days(public.las_period[], date, int) from public, anon;
revoke all on function public.las_measure(date[], date, date, int) from public, anon;
revoke all on function public.las_clock(public.las_period[], date, int, boolean) from public, anon;
revoke all on function public.las_clocks(public.las_period[], date) from public, anon;
revoke all on function public.employment_periods(uuid) from public, anon;
revoke all on function public.employment_clocks(uuid, date) from public, anon;
grant execute on function public.las_rules() to authenticated;
grant execute on function public.las_add_months(date, int) to authenticated;
grant execute on function public.las_month_end(date, int) to authenticated;
grant execute on function public.las_window_start(date, int) to authenticated;
grant execute on function public.las_month_equivalent(date, date, int) to authenticated;
grant execute on function public.las_covered_days(public.las_period[], date, int) to authenticated;
grant execute on function public.las_measure(date[], date, date, int) to authenticated;
grant execute on function public.las_clock(public.las_period[], date, int, boolean) to authenticated;
grant execute on function public.las_clocks(public.las_period[], date) to authenticated;
grant execute on function public.employment_periods(uuid) to authenticated;
grant execute on function public.employment_clocks(uuid, date) to authenticated;

commit;
