-- Lönekörning, fas 3 (docs/hr-lon.md, avsnitt 3, 5, 7, 9, 10, 11 och 12).
-- Läggs på efter 0035–0038, som inte ändras.
--
-- Appen räknar lönen (lib/core/payroll/run.ts med fas 0:s kalkylatorer);
-- databasen lagrar, numrerar, fryser, bokför och stämmer av. Ingen
-- lönematematik här, bara summor och kontroller.
--
-- 1. Konton för lön (BAS) och nummerserien L för lönebesked, för alla
--    befintliga organisationer och i create_organization().
-- 2. pay_items: löneartsregistret med flaggorna i PayItemFlags,
--    versionerat (en ändring är en ny rad med valid_from), seedat ur
--    pay-items.default.ts (blocket hålls lika av pay-items-sql.test.ts).
-- 3. tax_tables och tax_table_imports: Skatteverkets månadstabeller, i
--    kronor. tax_tables_import_begin/_rows/_finish tar JSON:en från
--    `npm run tax-tables:import -- ÅÅÅÅ --out fil` i delar och vägrar om en
--    enda kontrollvektor inte stämmer, också mot raderna som lagts in här.
-- 4. payroll_settings: lönebeslut per organisation (period, lönedag,
--    semesterår, avtal, kontering, godkännare, bankkonto, Fora/Collectum)
--    med confirmed: när varje beslut senast sparades. Ett beslut utan
--    datum visas som "inte bekräftad".
-- 5. pay_runs → payslips (+ payslip_lines): draft → calculated → approved
--    → paid → booked → closed. Den som räknade godkänner inte (fyra ögon,
--    regel 5). Ej godkänd tid i perioden stoppar beräkningen och
--    godkännandet (regel 3), och ett underlag som ändrats efter
--    beräkningen stoppar godkännandet. Godkännandet låser tidsperioden,
--    fryser lönebeskeden och numrerar dem i serien L. Ett godkänt
--    lönebesked ändras aldrig (regel 6).
-- 6. bank_files: pain.001.001.03, fryst, skickas aldrig av systemet.
--    Summan läses ur filens CtrlSum och jämförs med nettolönerna.
-- 7. payroll_run_book(): en verifikation i serien V på lönedagen ur
--    lönebeskedens rader och summor (plus appens periodiseringar för
--    semesterlöneskuld och tjänstepension).
-- 8. payroll_reconciliation(): lönebesked = rader = verifikation = bankfil.
--    payroll_run_close() vägrar annars (regel 7).
-- 9. payroll_corrections: rättelse framåt, retroaktiva rader i nästa
--    körning som pekar på originalet; AGI-omprövningen markeras för fas 4.
-- 10. RLS (avsnitt 10): owner/admin allt, redovisningskonsulten läser och
--    räknar men godkänner inte, den anställde läser sina egna godkända
--    lönebesked, personal och läsbehörighet ingenting.
-- 11. Loggboken: körningens händelser har aggregate_type 'payroll' (bara
--    lönebehöriga ser dem), lönebeskedens 'employee'.

begin;

-- =====================================================================
-- 1. Konton och nummerserien L
-- =====================================================================

create or replace function public.seed_payroll_accounts(p_org uuid) returns void
  language sql security definer set search_path = public
as $$
  insert into public.accounts (org_id, number, name) values
    (p_org, '1610', 'Kortfristiga fordringar hos anställda'),
    (p_org, '2710', 'Personalskatt'),
    (p_org, '2731', 'Avräkning lagstadgade sociala avgifter'),
    (p_org, '2820', 'Kortfristiga skulder till anställda'),
    (p_org, '2920', 'Upplupna semesterlöner'),
    (p_org, '2940', 'Upplupna lagstadgade sociala och andra avgifter'),
    (p_org, '2941', 'Beräknade upplupna lagstadgade sociala avgifter'),
    (p_org, '2950', 'Upplupna avtalade sociala avgifter'),
    (p_org, '7010', 'Löner till kollektivanställda'),
    (p_org, '7081', 'Sjuklöner till kollektivanställda'),
    (p_org, '7082', 'Semesterlöner till kollektivanställda'),
    (p_org, '7090', 'Förändring av semesterlöneskuld'),
    (p_org, '7210', 'Löner till tjänstemän'),
    (p_org, '7220', 'Löner till företagsledare'),
    (p_org, '7240', 'Styrelsearvoden som inte är lön'),
    (p_org, '7281', 'Sjuklöner till tjänstemän'),
    (p_org, '7282', 'Semesterlöner till tjänstemän'),
    (p_org, '7290', 'Förändring av semesterlöneskuld, tjänstemän'),
    (p_org, '7321', 'Skattefria traktamenten, Sverige'),
    (p_org, '7322', 'Skattepliktiga traktamenten, Sverige'),
    (p_org, '7331', 'Skattefria bilersättningar'),
    (p_org, '7332', 'Skattepliktiga bilersättningar'),
    (p_org, '7382', 'Kostnader för fria eller subventionerade måltider'),
    (p_org, '7385', 'Kostnader för fri bil'),
    (p_org, '7389', 'Övriga kostnader för förmåner'),
    (p_org, '7399', 'Motkonto förmånsvärden'),
    (p_org, '7410', 'Pensionsförsäkringspremier'),
    (p_org, '7510', 'Arbetsgivaravgifter'),
    (p_org, '7519', 'Sociala avgifter för semester- och löneskulder'),
    (p_org, '7570', 'Premier för arbetsmarknadsförsäkringar'),
    (p_org, '7690', 'Övriga personalkostnader')
  on conflict do nothing
$$;
revoke all on function public.seed_payroll_accounts(uuid) from public, anon, authenticated;

-- =====================================================================
-- 2. Löneartsregistret
-- =====================================================================

create table pay_items (
  id                                uuid primary key default gen_random_uuid(),
  org_id                            uuid not null references organizations(id) on delete cascade,
  code                              text not null check (code ~ '^\d{3,5}$'),
  name                              text not null check (length(btrim(name)) between 1 and 80),
  kind                              text not null check (kind in ('salary','hourly','overtime','ob','sick_pay','sick_deduction','vacation_pay',
                                      'vacation_deduction','fee','benefit','expense','mileage','per_diem','gross_adjustment','net_adjustment','retro')),
  version                           int not null default 1,
  valid_from                        date not null default current_date,
  taxable                           boolean not null,
  tax_mode                          text not null check (tax_mode in ('table','lump_sum','none')),
  subject_to_employer_contribution  boolean not null,
  vacation_pay_basis                boolean not null,
  pension_reportable                boolean not null,
  agi_box                           text check (agi_box ~ '^\d{3}$'),
  account                           text not null check (account ~ '^\d{4}$'),
  counter_account                   text not null check (counter_account ~ '^\d{4}$'),
  fora_category                     text,
  created_at                        timestamptz not null default now(),
  created_by                        uuid default auth.uid(),
  unique (org_id, code, version),
  check (taxable or tax_mode = 'none'),
  foreign key (org_id, account) references accounts(org_id, number),
  foreign key (org_id, counter_account) references accounts(org_id, number)
);
create index pay_items_org_idx on pay_items (org_id, code, valid_from desc);
create trigger pay_items_immutable before update or delete on pay_items
  for each row execute function forbid_change();

-- En ändring av en löneart är en ny version; numret sätts här.
create or replace function public.pay_items_version() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  new.version := coalesce((select max(version) from public.pay_items where org_id = new.org_id and code = new.code), 0) + 1;
  return new;
end;
$$;
revoke all on function public.pay_items_version() from public, anon, authenticated;
create trigger pay_items_version before insert on pay_items
  for each row execute function pay_items_version();

-- =====================================================================
-- 3. Skattetabeller
-- =====================================================================

-- Skatteverkets öppna data, ett år i taget. Gemensamma för alla
-- organisationer; vem som helst inloggad läser dem. En import görs i tre
-- steg (begin, rader i delar, finish) eftersom ett år är ungefär 48 000
-- rader; den gäller först när finish har kontrollerat vektorerna mot de
-- lagrade raderna och satt completed_at. En import utan completed_at
-- används aldrig och kan tas bort.
create table tax_table_imports (
  id               uuid primary key default gen_random_uuid(),
  year             int not null check (year between 2020 and 2100),
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  file_row_count   int not null check (file_row_count > 0),
  row_count        int not null default 0 check (row_count >= 0),
  tables           int[] not null default '{}',
  golden           jsonb not null,
  golden_passed    boolean check (golden_passed),
  imported_by      text not null default coalesce(auth.jwt()->>'email', current_user),
  imported_at      timestamptz not null default now(),
  completed_at     timestamptz,
  unique (year, sha256),
  check ((completed_at is null) = (golden_passed is null)),
  check (completed_at is null or row_count > 0)
);

create table tax_tables (
  import_id       uuid not null references tax_table_imports(id),
  year            int not null,
  table_no        int not null check (table_no between 1 and 99),
  column_no       int not null check (column_no between 1 and 6),
  income_from_kr  int not null check (income_from_kr >= 0),
  income_to_kr    int,                                   -- null: översta bandet
  tax_kr          int,                                   -- beloppsrad
  percent         numeric(5,2),                          -- procentrad ("30%")
  primary key (import_id, table_no, column_no, income_from_kr),
  check ((tax_kr is null) <> (percent is null)),
  check (income_to_kr is null or income_to_kr >= income_from_kr)
);

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
create trigger tax_tables_freeze before update or delete on tax_tables
  for each row execute function tax_tables_freeze();

-- Skatten för en månadslön ur de lagrade raderna: bara uppslag, för
-- kontrollvektorerna. Procentrader: procent av hela kronor, öretal bortfaller.
create or replace function public.tax_table_lookup(p_import uuid, p_table int, p_column int, p_pay_kr int) returns int
  language sql stable security definer set search_path = public
as $$
  select case when t.tax_kr is not null then t.tax_kr else floor(p_pay_kr * t.percent / 100)::int end
    from public.tax_tables t
   where t.import_id = p_import and t.table_no = p_table and t.column_no = p_column
     and t.income_from_kr <= p_pay_kr and (t.income_to_kr is null or t.income_to_kr >= p_pay_kr)
   order by t.income_from_kr desc
   limit 1
$$;

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
revoke all on function public.tax_table_lookup(uuid, int, int, int) from public, anon;
revoke all on function public.tax_tables_import_begin(jsonb) from public, anon, authenticated;
revoke all on function public.tax_tables_import_rows(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.tax_tables_import_finish(uuid) from public, anon, authenticated;
revoke all on function public.tax_tables_import(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.tax_table_lookup(uuid, int, int, int) to authenticated;
grant execute on function public.tax_tables_import_begin(jsonb) to service_role;
grant execute on function public.tax_tables_import_rows(uuid, jsonb) to service_role;
grant execute on function public.tax_tables_import_finish(uuid) to service_role;
grant execute on function public.tax_tables_import(jsonb, jsonb) to service_role;

-- =====================================================================
-- 4. Lönebesluten
-- =====================================================================

-- data: lib/core/payroll/settings.ts (zod, med lagens eller det vanliga
-- standardvärdet). confirmed: {"period": "2026-11-02T…", ...}, satt av
-- appen när ägaren sparar ett beslut.
create table payroll_settings (
  org_id      uuid primary key references organizations(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  confirmed   jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid()
);
create trigger payroll_settings_set_updated_at before update on payroll_settings
  for each row execute function set_updated_at();

-- =====================================================================
-- 5. Körningar, lönebesked och rader
-- =====================================================================

create table pay_runs (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references organizations(id) on delete cascade,
  -- Löneperioden (månadslönens månad) och perioden för tid och frånvaro
  -- (samma månad, eller månaden före enligt payroll_settings).
  period_start         date not null,
  period_end           date not null,
  time_period_start    date not null,
  time_period_end      date not null,
  pay_date             date not null,
  agi_period           text not null check (agi_period ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status               text not null default 'draft'
                         check (status in ('draft','calculated','approved','paid','booked','closed')),
  checks               jsonb not null default '[]'::jsonb,
  checks_at            timestamptz,
  rule_set_valid_from  date,
  tax_table_import_id  uuid references tax_table_imports(id),
  totals               jsonb not null default '{}'::jsonb,
  -- Fingeravtryck av underlaget när lönen räknades (payroll_inputs_hash);
  -- godkännandet vägrar om underlaget har ändrats sedan dess.
  inputs_hash          text,
  computed_by          uuid,
  computed_by_name     text,
  computed_at          timestamptz,
  approved_by          uuid,
  approved_by_name     text,
  approved_at          timestamptz,
  bank_file_id         uuid,
  paid_at              timestamptz,
  journal_entry_id     uuid references journal_entries(id),
  booked_at            timestamptz,
  closed_at            timestamptz,
  created_by           uuid default auth.uid(),
  created_at           timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, period_start),
  check (period_end >= period_start and time_period_end >= time_period_start),
  -- Fyra ögon (regel 5).
  check (approved_by is null or computed_by is null or approved_by <> computed_by),
  check (status in ('draft','calculated') or (approved_at is not null and approved_by is not null))
);
create index pay_runs_org_idx on pay_runs (org_id, period_start desc);

create table payslips (
  id                         uuid primary key default gen_random_uuid(),
  org_id                     uuid not null,
  run_id                     uuid not null,
  employee_id                uuid not null,
  number                     int,                          -- serien L, vid godkännandet
  document                   jsonb not null,               -- PayslipDocument (lib/core/payroll/payslip.ts)
  gross_ore                  bigint not null,
  tax_ore                    bigint not null check (tax_ore % 100 = 0),
  net_ore                    bigint not null,
  employer_contribution_ore  bigint not null,
  contribution_rate          numeric(8,4) not null,
  vacation_liability_ore     bigint not null default 0,   -- semesterlöneskulden efter körningen
  pension_premium_ore        bigint not null default 0,   -- förväntad premie SAF-LO/ITP1 (periodisering)
  pdf_path                   text,
  pdf_sha256                 text check (pdf_sha256 ~ '^[0-9a-f]{64}$'),
  pdf_size                   int,
  approved_at                timestamptz,
  created_at                 timestamptz not null default now(),
  unique (id, org_id),
  unique (run_id, employee_id),
  unique (org_id, number),
  foreign key (run_id, org_id) references pay_runs(id, org_id) on delete cascade,
  foreign key (employee_id, org_id) references employees(id, org_id),
  check ((number is null) = (approved_at is null)),
  check (pdf_path is null or approved_at is not null)
);
create index payslips_employee_idx on payslips (employee_id, created_at desc);

create table payslip_lines (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  payslip_id       uuid not null,
  run_id           uuid not null,
  employee_id      uuid not null,
  line_no          int not null,
  code             text not null,
  name             text not null,
  kind             text not null,
  item_version     int not null,
  text             text not null default '',
  quantity         numeric(12,4),
  unit             text,
  unit_price_ore   bigint,
  basis_ore        bigint,
  rate_percent     numeric(8,4),
  amount_ore       bigint not null,
  account          text not null,
  counter_account  text not null,
  agi_box          text,
  from_date        date,
  to_date          date,
  unique (payslip_id, line_no),
  foreign key (payslip_id, org_id) references payslips(id, org_id) on delete cascade
);
create index payslip_lines_run_idx on payslip_lines (run_id);

-- Ett godkänt lönebesked ändras aldrig. Det enda som får sättas efteråt är
-- den frysta PDF:en, en gång.
create or replace function public.payslips_freeze() returns trigger
  language plpgsql set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.approved_at is not null then
      raise exception 'Lönebesked % är godkänt och kan inte tas bort; rätta i nästa körning.', old.number using errcode = '0A000';
    end if;
    return old;
  end if;
  if old.approved_at is not null then
    if old.pdf_path is null and new.pdf_path is not null
       and (to_jsonb(new) - array['pdf_path','pdf_sha256','pdf_size']) = (to_jsonb(old) - array['pdf_path','pdf_sha256','pdf_size']) then
      return new;
    end if;
    raise exception 'Lönebesked % är godkänt och kan inte ändras; rätta i nästa körning.', old.number using errcode = '0A000';
  end if;
  return new;
end;
$$;
create trigger payslips_freeze before update or delete on payslips
  for each row execute function payslips_freeze();

create or replace function public.payslip_lines_freeze() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Lönebeskedets rader ändras inte.' using errcode = '0A000';
  end if;
  if exists (select 1 from public.payslips p where p.id = old.payslip_id and p.approved_at is not null) then
    raise exception 'Raderna på ett godkänt lönebesked tas inte bort.' using errcode = '0A000';
  end if;
  return old;
end;
$$;
revoke all on function public.payslip_lines_freeze() from public, anon, authenticated;
create trigger payslip_lines_freeze before update or delete on payslip_lines
  for each row execute function payslip_lines_freeze();

-- =====================================================================
-- 6. Rättelser framåt och bankfiler
-- =====================================================================

create table payroll_corrections (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null,
  employee_id           uuid not null,
  original_payslip_id   uuid not null,
  original_run_id       uuid not null,
  agi_period            text not null,                  -- originalets AGI-månad, som ska omprövas
  lines                 jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  reason                text not null check (length(btrim(reason)) between 3 and 500),
  agi_refile            boolean not null default true,  -- för fas 4
  target_run_id         uuid references pay_runs(id) on delete set null,
  created_by            uuid default auth.uid(),
  created_at            timestamptz not null default now(),
  foreign key (original_payslip_id, org_id) references payslips(id, org_id),
  foreign key (employee_id, org_id) references employees(id, org_id)
);
create index payroll_corrections_employee_idx on payroll_corrections (employee_id, created_at);

-- Bara målet får flyttas, och bara medan målkörningen inte är godkänd.
create or replace function public.payroll_corrections_freeze() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'En rättelse tas inte bort.' using errcode = '0A000';
  end if;
  if (to_jsonb(new) - 'target_run_id') <> (to_jsonb(old) - 'target_run_id')
     or (old.target_run_id is not null and exists (select 1 from public.pay_runs r where r.id = old.target_run_id
                                                    and r.status not in ('draft','calculated'))) then
    raise exception 'Rättelsen är redan med i en godkänd körning.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
revoke all on function public.payroll_corrections_freeze() from public, anon, authenticated;
create trigger payroll_corrections_freeze before update or delete on payroll_corrections
  for each row execute function payroll_corrections_freeze();

create table bank_files (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null,
  run_id           uuid not null unique,
  format           text not null default 'pain.001.001.03' check (format = 'pain.001.001.03'),
  message_id       text not null,
  xml              text not null,
  sha256           text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  total_ore        bigint not null,
  transactions     int not null,
  execution_date   date not null,
  created_by       uuid default auth.uid(),
  created_at       timestamptz not null default now(),
  unique (id, org_id),
  foreign key (run_id, org_id) references pay_runs(id, org_id)
);
create trigger bank_files_immutable before update or delete on bank_files
  for each row execute function forbid_change();
alter table pay_runs add constraint pay_runs_bank_file_fk foreign key (bank_file_id) references bank_files(id);

-- =====================================================================
-- 7. Loggboken och sådd per organisation
-- =====================================================================

create or replace function public.payroll_log(p_org uuid, p_run uuid, p_type text, p_data jsonb) returns void
  language sql volatile security definer set search_path = public
as $$
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
  values (p_org, 'payroll', p_run, p_type, coalesce(p_data, '{}'::jsonb), public.hr_actor())
$$;
revoke all on function public.payroll_log(uuid, uuid, text, jsonb) from public, anon, authenticated, service_role;

-- Körningarnas händelser syns bara för den som får läsa löner.
create policy "events_payroll_only" on events as restrictive
  for select to authenticated using (aggregate_type <> 'payroll' or public.can_payroll_read(org_id));

-- Serien L, kontona, löneartsregistret och lönebesluten för en
-- organisation. Körs igen utan att ändra något som redan finns.
create or replace function public.payroll_seed_org(p_org uuid) returns void
  language plpgsql security definer set search_path = public
as $$
begin
  insert into public.number_series (org_id, series, per_year, start, pad) values (p_org, 'L', false, 1, 0)
    on conflict do nothing;
  perform public.seed_payroll_accounts(p_org);
  if not exists (select 1 from public.pay_items where org_id = p_org) then
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
    ('1900', 'Traktamente skattefritt', 'per_diem', false, 'none', false, false, false, '051', '7321', '2820', null),
    ('1901', 'Traktamente skattepliktigt', 'per_diem', true, 'table', true, false, false, '011', '7322', '2820', null),
    ('1910', 'Milersättning skattefri', 'mileage', false, 'none', false, false, false, '050', '7331', '2820', null),
    ('1911', 'Milersättning skattepliktig', 'mileage', true, 'table', true, false, false, '011', '7332', '2820', null),
    ('1920', 'Utlägg', 'expense', false, 'none', false, false, false, null, '7690', '2820', null),
    ('2000', 'Nettolöneavdrag', 'net_adjustment', false, 'none', false, false, false, null, '1610', '2820', null)
-- END pay items
      ) as v(code, name, kind, taxable, tax_mode, avgift, semester, pension, agi_box, account, counter_account, fora);
  end if;
  insert into public.payroll_settings (org_id) values (p_org) on conflict do nothing;
end;
$$;
revoke all on function public.payroll_seed_org(uuid) from public, anon, authenticated;

select public.payroll_seed_org(id) from organizations;

-- create_organization() som i 0021, plus lönens sådd.
create or replace function public.create_organization(p_name text, p_org_nr text default '')
returns uuid
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_orgnr text := btrim(coalesce(p_org_nr, ''));
  v_base  text;
  v_slug  text;
  v_org   uuid;
begin
  if v_uid is null then
    raise exception 'Logga in för att skapa en organisation.' using errcode = '42501';
  end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then
    raise exception 'Namnet ska vara 2–120 tecken.' using errcode = '22023';
  end if;
  if v_orgnr <> '' and v_orgnr !~ '^\d{6}-?\d{4}$' then
    raise exception 'Organisationsnummer skrivs 559123-4567.' using errcode = '22023';
  end if;
  if v_orgnr ~ '^\d{10}$' then
    v_orgnr := substr(v_orgnr, 1, 6) || '-' || substr(v_orgnr, 7);
  end if;

  v_base := trim(both '-' from regexp_replace(lower(translate(v_name, 'åäöéüÅÄÖÉÜ', 'aaoeuaaoeu')), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then v_base := 'org'; end if;
  v_slug := v_base;
  while exists (select 1 from public.organizations where slug = v_slug) loop
    v_slug := v_base || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 5);
  end loop;

  insert into public.organizations (slug, name, org_nr) values (v_slug, v_name, v_orgnr) returning id into v_org;
  insert into public.memberships (org_id, user_id, role) values (v_org, v_uid, 'owner');
  insert into public.number_series (org_id, series, per_year, start, pad) values
    (v_org, 'F', false, 1, 0),
    (v_org, 'V', true, 1, 0);
  perform public.seed_org_accounts(v_org);
  perform public.payroll_seed_org(v_org);
  insert into public.org_settings (org_id, data) values
    (v_org, jsonb_build_object('company', jsonb_build_object('legalName', v_name, 'orgNr', v_orgnr)));
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_org, 'organization', v_org, 'organization.created', jsonb_build_object('name', v_name),
            jsonb_build_object('kind', 'user', 'id', v_uid, 'name', coalesce(auth.jwt()->>'email', v_uid::text)));
  return v_org;
end;
$$;
revoke all on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;

-- Ändrade lönebeslut: vilka fält, inte värdena (bankkontot står där).
create or replace function public.payroll_settings_events() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  perform public.payroll_log(new.org_id, new.org_id, 'payroll.settings_updated', jsonb_build_object(
    'fields', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_each(new.data) n(k, v)
                where n.v is distinct from coalesce(old.data, '{}'::jsonb)->n.k),
    'confirmed', (select coalesce(jsonb_agg(k order by k), '[]'::jsonb) from jsonb_each(new.confirmed) n(k, v)
                   where n.v is distinct from coalesce(old.confirmed, '{}'::jsonb)->n.k)));
  return null;
end;
$$;
revoke all on function public.payroll_settings_events() from public, anon, authenticated;
create trigger payroll_settings_events after update on payroll_settings
  for each row when (old.data is distinct from new.data or old.confirmed is distinct from new.confirmed)
  execute function payroll_settings_events();

-- =====================================================================
-- 8. Funktionerna
-- =====================================================================

create or replace function public.payroll_setting(p_org uuid, p_path text[], p_default text) returns text
  language sql stable security definer set search_path = public
as $$
  select coalesce(nullif((select s.data #>> p_path from public.payroll_settings s where s.org_id = p_org), ''), p_default)
$$;
revoke all on function public.payroll_setting(uuid, text[], text) from public, anon, authenticated;

-- Ej godkänd tid i körningens tidsperiod, per person ("Erik (3 rader)").
create or replace function public.payroll_unapproved_time(p_run uuid) returns text
  language sql stable security definer set search_path = public
as $$
  select string_agg(e.name || ' (' || t.n || case when t.n = 1 then ' rad)' else ' rader)' end, ', ' order by e.name)
    from (select te.employee_id, count(*) n
            from public.time_entries te join public.pay_runs r on r.id = p_run and te.org_id = r.org_id
           where te.work_date between r.time_period_start and r.time_period_end and te.status in ('draft','submitted')
           group by te.employee_id) t
    join public.employees e on e.id = t.employee_id
$$;
revoke all on function public.payroll_unapproved_time(uuid) from public, anon, authenticated;

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

-- En ny körning för månaden som p_period ligger i. Tid och frånvaro läses
-- för samma månad eller månaden före (payroll_settings.data.variablePeriod).
create or replace function public.payroll_run_create(p_org uuid, p_period date, p_pay_date date) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  v_start date := date_trunc('month', p_period)::date;
  v_end date;
  v_tstart date;
  v_id uuid;
begin
  if not public.can_payroll_read(p_org) then
    raise exception 'Bara ägare, administratörer och redovisningskonsulten räknar löner.' using errcode = '42501';
  end if;
  if p_period is null or p_pay_date is null then
    raise exception 'Körningen behöver en månad och en lönedag.' using errcode = '22023';
  end if;
  perform public.payroll_seed_org(p_org);
  v_end := (v_start + interval '1 month' - interval '1 day')::date;
  v_tstart := case when public.payroll_setting(p_org, array['variablePeriod'], 'previous') = 'same' then v_start
                   else (v_start - interval '1 month')::date end;
  if p_pay_date < v_tstart or p_pay_date > v_end + 62 then
    raise exception 'Lönedagen % passar inte perioden %.', p_pay_date, to_char(v_start, 'YYYY-MM') using errcode = '22023';
  end if;
  if exists (select 1 from public.pay_runs where org_id = p_org and period_start = v_start) then
    raise exception 'Det finns redan en lönekörning för %.', to_char(v_start, 'YYYY-MM') using errcode = '23505';
  end if;
  insert into public.pay_runs (org_id, period_start, period_end, time_period_start, time_period_end, pay_date, agi_period)
  values (p_org, v_start, v_end, v_tstart, (v_tstart + interval '1 month' - interval '1 day')::date, p_pay_date, to_char(p_pay_date, 'YYYY-MM'))
  returning id into v_id;
  perform public.payroll_log(p_org, v_id, 'payroll.run_created', jsonb_build_object('period', to_char(v_start, 'YYYY-MM'), 'payDate', p_pay_date));
  return v_id;
end;
$$;

-- Kontrollistan (regel 4) sparas på körningen med sitt utfall.
create or replace function public.payroll_run_store_checks(p_run uuid, p_checks jsonb) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  r public.pay_runs;
begin
  select * into r from public.pay_runs where id = p_run for update;
  if r.id is null or not public.can_payroll_read(r.org_id) then
    raise exception 'Körningen finns inte.' using errcode = '42501';
  end if;
  if r.status not in ('draft','calculated') then
    raise exception 'Körningen är redan godkänd.' using errcode = '0A000';
  end if;
  if jsonb_typeof(p_checks) <> 'array' then
    raise exception 'Kontrollistan ska vara en lista.' using errcode = '22023';
  end if;
  update public.pay_runs set checks = p_checks, checks_at = now() where id = p_run;
end;
$$;

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

-- En körning som inte är godkänd kan slängas och räknas om från början.
create or replace function public.payroll_run_discard(p_run uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  r public.pay_runs;
begin
  select * into r from public.pay_runs where id = p_run for update;
  if r.id is null or not public.can_payroll_read(r.org_id) then
    raise exception 'Körningen finns inte.' using errcode = '42501';
  end if;
  if r.status not in ('draft','calculated') then
    raise exception 'En godkänd körning tas inte bort; rätta i nästa körning.' using errcode = '0A000';
  end if;
  delete from public.pay_runs where id = p_run;
  perform public.payroll_log(r.org_id, p_run, 'payroll.run_discarded', jsonb_build_object('period', to_char(r.period_start, 'YYYY-MM')));
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

-- Den frysta PDF:en, en gång per lönebesked, i bucketen hr.
create or replace function public.payslip_attach_pdf(p_payslip uuid, p_path text, p_sha256 text, p_size int) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  p public.payslips;
begin
  select * into p from public.payslips where id = p_payslip for update;
  if p.id is null or not public.can_payroll_approve(p.org_id) then
    raise exception 'Lönebeskedet finns inte.' using errcode = '42501';
  end if;
  if p.approved_at is null then
    raise exception 'PDF:en görs när lönebeskedet är godkänt.' using errcode = '0A000';
  end if;
  if p.pdf_path is not null then
    raise exception 'Lönebeskedet har redan sin PDF.' using errcode = '0A000';
  end if;
  if p_path <> p.org_id || '/' || p.employee_id || '/payslip-' || p.id || '.pdf' then
    raise exception 'Fel sökväg för lönebeskedets PDF.' using errcode = '22023';
  end if;
  update public.payslips set pdf_path = p_path, pdf_sha256 = p_sha256, pdf_size = p_size where id = p_payslip;
  perform public.hr_log(p.org_id, p.employee_id, 'payslip.pdf_created', jsonb_build_object('payslipId', p.id, 'sha256', p_sha256));
end;
$$;

-- Bankfilen (pain.001.001.03): summan och antalet läses ur filen själv
-- och ska vara lönebeskedens positiva nettolöner. Systemet skickar den aldrig.
create or replace function public.payroll_bank_file_store(p_run uuid, p_xml text, p_message_id text, p_execution_date date) returns uuid
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  r public.pay_runs;
  v_x xml;
  v_ctrl numeric;
  v_nb int;
  v_amounts numeric;
  v_net bigint;
  v_count int;
  v_id uuid;
begin
  select * into r from public.pay_runs where id = p_run for update;
  if r.id is null or not public.can_payroll_approve(r.org_id) then
    raise exception 'Bara ägare och administratörer skapar bankfilen.' using errcode = '42501';
  end if;
  if r.status <> 'approved' then
    raise exception 'Bankfilen görs efter godkännandet, en gång (körningen är %).', r.status using errcode = '0A000';
  end if;
  begin
    v_x := p_xml::xml;
  exception when others then
    raise exception 'Bankfilen är inte giltig XML.' using errcode = '22023';
  end;
  v_ctrl := ((xpath('/*[local-name()="Document"]/*[local-name()="CstmrCdtTrfInitn"]/*[local-name()="GrpHdr"]/*[local-name()="CtrlSum"]/text()', v_x))[1])::text::numeric;
  v_nb := ((xpath('/*[local-name()="Document"]/*[local-name()="CstmrCdtTrfInitn"]/*[local-name()="GrpHdr"]/*[local-name()="NbOfTxs"]/text()', v_x))[1])::text::int;
  select coalesce(sum(a::text::numeric), 0) into v_amounts
    from unnest(xpath('//*[local-name()="CdtTrfTxInf"]/*[local-name()="Amt"]/*[local-name()="InstdAmt"]/text()', v_x)) a;
  select coalesce(sum(net_ore), 0), count(*) into v_net, v_count from public.payslips where run_id = p_run and net_ore > 0;
  if v_ctrl is null or v_nb is null or round(v_ctrl * 100) <> v_net or round(v_amounts * 100) <> v_net or v_nb <> v_count then
    raise exception 'Bankfilen stämmer inte med lönebeskeden: filen % kr i % betalningar, nettolönerna % kr i %.',
      v_ctrl, v_nb, v_net / 100.0, v_count using errcode = '23514';
  end if;
  insert into public.bank_files (org_id, run_id, message_id, xml, sha256, total_ore, transactions, execution_date)
  values (r.org_id, p_run, p_message_id, p_xml, encode(digest(convert_to(p_xml, 'UTF8'), 'sha256'), 'hex'), v_net, v_count, p_execution_date)
  returning id into v_id;
  update public.pay_runs set status = 'paid', bank_file_id = v_id, paid_at = now() where id = p_run;
  perform public.payroll_log(r.org_id, p_run, 'payroll.bank_file_created', jsonb_build_object('bankFileId', v_id, 'totalOre', v_net, 'transactions', v_count));
  return v_id;
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

-- Avstämningen (regel 7): nettolönerna fyra gånger, ur lönebeskeden, ur
-- raderna (summa − förmåner − skatt), ur verifikationen (nettokontot) och
-- ur bankfilen (CtrlSum). Skatt och avgifter mot verifikationen också.
create or replace function public.payroll_reconciliation(p_run uuid)
returns table (payslips_ore bigint, lines_ore bigint, journal_ore bigint, bank_ore bigint,
               tax_ore bigint, journal_tax_ore bigint, contributions_ore bigint, journal_contributions_ore bigint, ok boolean)
  language plpgsql stable security definer set search_path = public
as $$
declare
  r public.pay_runs;
  v_tax text;
  v_net text;
  v_cl text;
begin
  select * into r from public.pay_runs where id = p_run;
  if r.id is null or not public.can_payroll_read(r.org_id) then
    raise exception 'Körningen finns inte.' using errcode = '42501';
  end if;
  v_tax := public.payroll_setting(r.org_id, array['accounts','tax'], '2710');
  v_net := public.payroll_setting(r.org_id, array['accounts','net'], '2820');
  v_cl := public.payroll_setting(r.org_id, array['accounts','contributionLiability'], '2731');
  select coalesce(sum(p.net_ore), 0), coalesce(sum(p.tax_ore), 0), coalesce(sum(p.employer_contribution_ore), 0)
    into payslips_ore, tax_ore, contributions_ore from public.payslips p where p.run_id = p_run;
  select coalesce(sum(l.amount_ore) filter (where l.kind <> 'benefit'), 0) - tax_ore into lines_ore
    from public.payslip_lines l where l.run_id = p_run;
  if r.journal_entry_id is not null then
    select sum(j.credit_ore - j.debit_ore) filter (where j.account = v_net),
           sum(j.credit_ore - j.debit_ore) filter (where j.account = v_tax),
           sum(j.credit_ore - j.debit_ore) filter (where j.account = v_cl)
      into journal_ore, journal_tax_ore, journal_contributions_ore
      from public.journal_lines j where j.entry_id = r.journal_entry_id;
    journal_ore := coalesce(journal_ore, 0);
    journal_tax_ore := coalesce(journal_tax_ore, 0);
    journal_contributions_ore := coalesce(journal_contributions_ore, 0);
  end if;
  if r.bank_file_id is not null then
    select round(((xpath('/*[local-name()="Document"]/*[local-name()="CstmrCdtTrfInitn"]/*[local-name()="GrpHdr"]/*[local-name()="CtrlSum"]/text()',
                         b.xml::xml))[1])::text::numeric * 100)::bigint
      into bank_ore from public.bank_files b where b.id = r.bank_file_id;
  end if;
  ok := lines_ore = payslips_ore and journal_ore is not distinct from payslips_ore and bank_ore is not distinct from payslips_ore
        and journal_tax_ore is not distinct from tax_ore and journal_contributions_ore is not distinct from contributions_ore;
  return next;
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

-- Rätta framåt: retroaktiva rader för nästa körning, som pekar på
-- originalet. Originalet ändras aldrig; AGI-månaden ska omprövas (fas 4).
create or replace function public.payroll_correction_add(p_payslip uuid, p_lines jsonb, p_reason text) returns uuid
  language plpgsql security definer set search_path = public
as $$
declare
  p public.payslips;
  r public.pay_runs;
  v_id uuid;
begin
  select * into p from public.payslips where id = p_payslip;
  if p.id is null or not public.can_payroll_approve(p.org_id) then
    raise exception 'Bara ägare och administratörer rättar lönebesked.' using errcode = '42501';
  end if;
  select * into r from public.pay_runs where id = p.run_id;
  if r.status <> 'closed' then
    raise exception 'Rätta efter att körningen är stängd; innan dess räknas den om.' using errcode = '0A000';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0
     or exists (select 1 from jsonb_array_elements(p_lines) l
                 where coalesce((l->>'amountOre')::bigint, 0) = 0
                    or not exists (select 1 from public.pay_items i where i.org_id = p.org_id and i.code = l->>'code')) then
    raise exception 'Rättelsen behöver minst en rad med en löneart ur registret och ett belopp.' using errcode = '22023';
  end if;
  insert into public.payroll_corrections (org_id, employee_id, original_payslip_id, original_run_id, agi_period, lines, reason)
  values (p.org_id, p.employee_id, p.id, p.run_id, r.agi_period, p_lines, btrim(coalesce(p_reason, '')))
  returning id into v_id;
  perform public.hr_log(p.org_id, p.employee_id, 'payslip.corrected',
    jsonb_build_object('payslipId', p.id, 'number', p.number, 'correctionId', v_id, 'agiPeriod', r.agi_period,
                       'amountOre', (select sum((l->>'amountOre')::bigint) from jsonb_array_elements(p_lines) l)));
  return v_id;
end;
$$;

-- =====================================================================
-- 9. RLS och rättigheter
-- =====================================================================

alter table pay_items           enable row level security;
alter table tax_table_imports   enable row level security;
alter table tax_tables          enable row level security;
alter table payroll_settings    enable row level security;
alter table pay_runs            enable row level security;
alter table payslips            enable row level security;
alter table payslip_lines       enable row level security;
alter table payroll_corrections enable row level security;
alter table bank_files          enable row level security;

create policy "pay_items_select" on pay_items
  for select to authenticated using (public.can_payroll_read(org_id));
create policy "pay_items_insert" on pay_items
  for insert to authenticated with check (public.can_payroll_approve(org_id));
-- Bara klara importer syns; en halvfärdig används aldrig.
create policy "tax_table_imports_select" on tax_table_imports
  for select to authenticated using (completed_at is not null);
create policy "tax_tables_select" on tax_tables
  for select to authenticated using (exists (select 1 from public.tax_table_imports i where i.id = import_id and i.completed_at is not null));
create policy "payroll_settings_select" on payroll_settings
  for select to authenticated using (public.can_payroll_read(org_id));
create policy "payroll_settings_insert" on payroll_settings
  for insert to authenticated with check (public.can_payroll_approve(org_id));
create policy "payroll_settings_update" on payroll_settings
  for update to authenticated using (public.can_payroll_approve(org_id)) with check (public.can_payroll_approve(org_id));
create policy "pay_runs_select" on pay_runs
  for select to authenticated using (public.can_payroll_read(org_id));
-- Den anställde läser sina egna lönebesked när de är godkända.
create policy "payslips_select" on payslips
  for select to authenticated using (public.can_payroll_read(org_id) or (approved_at is not null and public.is_self(employee_id)));
create policy "payslip_lines_select" on payslip_lines
  for select to authenticated using (public.can_payroll_read(org_id)
    or exists (select 1 from public.payslips p where p.id = payslip_id and p.approved_at is not null and public.is_self(p.employee_id)));
create policy "payroll_corrections_select" on payroll_corrections
  for select to authenticated using (public.can_payroll_read(org_id));
-- Bankfilen har kontonumren i klartext: bara owner/admin.
create policy "bank_files_select" on bank_files
  for select to authenticated using (public.can_payroll_approve(org_id));

revoke all on pay_items, tax_table_imports, tax_tables, payroll_settings, pay_runs, payslips, payslip_lines,
              payroll_corrections, bank_files from anon, authenticated;
grant select on pay_items, tax_table_imports, tax_tables, payroll_settings, pay_runs, payslips, payslip_lines,
                payroll_corrections, bank_files to authenticated;
grant insert (org_id, code, name, kind, valid_from, taxable, tax_mode, subject_to_employer_contribution, vacation_pay_basis,
              pension_reportable, agi_box, account, counter_account, fora_category) on pay_items to authenticated;
grant insert (org_id, data, confirmed), update (data, confirmed) on payroll_settings to authenticated;

revoke all on function public.payroll_run_create(uuid, date, date) from public, anon;
revoke all on function public.payroll_run_store_checks(uuid, jsonb) from public, anon;
revoke all on function public.payroll_run_store_result(uuid, jsonb) from public, anon;
revoke all on function public.payroll_run_discard(uuid) from public, anon;
revoke all on function public.payroll_run_approve(uuid) from public, anon;
revoke all on function public.payslip_attach_pdf(uuid, text, text, int) from public, anon;
revoke all on function public.payroll_bank_file_store(uuid, text, text, date) from public, anon;
revoke all on function public.payroll_run_book(uuid, jsonb) from public, anon;
revoke all on function public.payroll_reconciliation(uuid) from public, anon;
revoke all on function public.payroll_run_close(uuid) from public, anon;
revoke all on function public.payroll_correction_add(uuid, jsonb, text) from public, anon;
grant execute on function public.payroll_run_create(uuid, date, date) to authenticated;
grant execute on function public.payroll_run_store_checks(uuid, jsonb) to authenticated;
grant execute on function public.payroll_run_store_result(uuid, jsonb) to authenticated;
grant execute on function public.payroll_run_discard(uuid) to authenticated;
grant execute on function public.payroll_run_approve(uuid) to authenticated;
grant execute on function public.payslip_attach_pdf(uuid, text, text, int) to authenticated;
grant execute on function public.payroll_bank_file_store(uuid, text, text, date) to authenticated;
grant execute on function public.payroll_run_book(uuid, jsonb) to authenticated;
grant execute on function public.payroll_reconciliation(uuid) to authenticated;
grant execute on function public.payroll_run_close(uuid) to authenticated;
grant execute on function public.payroll_correction_add(uuid, jsonb, text) to authenticated;

commit;
