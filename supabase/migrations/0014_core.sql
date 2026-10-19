-- Faktureringskärnan, fas 0 (docs/fakturering.md). De sex grundkraven i en
-- migration: flera företag, huvudbok under fakturan, EN 16931-dokumentet,
-- regelverk (i kod), API-nycklar med idempotens och webhooks, samt öre,
-- obrutna nummerserier, loggbok och export.
--
-- Binaafy blir första organisationen; dagens admins blir owners. Befintliga
-- tabeller får org_id. is_admin() betyder från och med nu "owner eller admin
-- i någon organisation", så alla gamla policies fortsätter fungera.
--
-- Pengar: bigint i öre. Dokument: jsonb enligt lib/core/documents/invoice.ts.
-- Ingenting utfärdat ändras eller raderas; det vaktar triggers här, inte
-- bara applikationen.

-- =====================================================================
-- 1. Organisationer och roller
-- =====================================================================

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  org_nr      text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger organizations_set_updated_at before update on organizations
  for each row execute function set_updated_at();

create table memberships (
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','admin','staff','accountant','readonly')),
  created_at  timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_idx on memberships (user_id);

create table invitations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('owner','admin','staff','accountant','readonly')),
  token       text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by  text,
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);

-- Behörighetsfunktioner. security definer så att uppslaget inte stoppas av
-- memberships egen policy; search_path låst så att de inte kan kapas.
create or replace function public.is_org_member(org uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.memberships where org_id = org and user_id = auth.uid())
$$;

create or replace function public.has_org_role(org uuid, roles text[]) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.memberships where org_id = org and user_id = auth.uid() and role = any(roles))
$$;

-- Skriver fakturor, kunder, betalningar.
create or replace function public.can_write_org(org uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select public.has_org_role(org, array['owner','admin','staff']) $$;

-- Ändrar inställningar, roller, kontoplan, nycklar; ser personnummer.
create or replace function public.can_admin_org(org uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select public.has_org_role(org, array['owner','admin']) $$;

-- is_admin() behålls för alla gamla policies: owner/admin någonstans.
create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists(select 1 from public.memberships where user_id = auth.uid() and role in ('owner','admin'))
$$;

-- Den enda organisationen medan det bara finns en. Används som default på
-- gamla tabellers org_id; byts ut mot sessionens organisation i fas 5.
create or replace function public.default_org() returns uuid
  language sql stable security definer set search_path = public
as $$ select id from public.organizations order by created_at limit 1 $$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, text[]) from public;
revoke all on function public.can_write_org(uuid) from public;
revoke all on function public.can_admin_org(uuid) from public;
revoke all on function public.default_org() from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.can_write_org(uuid) to authenticated;
grant execute on function public.can_admin_org(uuid) to authenticated;
grant execute on function public.default_org() to anon, authenticated;

-- Binaafy, och dagens admins som owners. Tabellen admins lämnas kvar tills
-- lib/admin.ts läser memberships; den är inte längre källan.
insert into organizations (slug, name) values ('binaafy', 'Binaafy AB');
insert into memberships (org_id, user_id, role)
  select (select id from organizations where slug = 'binaafy'), user_id, 'owner' from admins
  on conflict do nothing;

alter table organizations enable row level security;
alter table memberships   enable row level security;
alter table invitations   enable row level security;

create policy "organizations_member_select" on organizations
  for select to authenticated using (is_org_member(id));
create policy "organizations_admin_update" on organizations
  for update to authenticated using (can_admin_org(id)) with check (can_admin_org(id));
-- Nya organisationer skapas av service role (onboarding, fas 5).

create policy "memberships_member_select" on memberships
  for select to authenticated using (is_org_member(org_id));
create policy "memberships_admin_write" on memberships
  for all to authenticated using (can_admin_org(org_id)) with check (can_admin_org(org_id));

create policy "invitations_admin" on invitations
  for all to authenticated using (can_admin_org(org_id)) with check (can_admin_org(org_id));

-- =====================================================================
-- 2. Befintliga tabeller får org_id
-- =====================================================================

alter table quotes          add column org_id uuid references organizations(id);
alter table quote_templates add column org_id uuid references organizations(id);
alter table leads           add column org_id uuid references organizations(id);
alter table portal_projects add column org_id uuid references organizations(id);

update quotes          set org_id = default_org();
update quote_templates set org_id = default_org();
update leads           set org_id = default_org();
update portal_projects set org_id = default_org();

alter table quotes          alter column org_id set not null, alter column org_id set default default_org();
alter table quote_templates alter column org_id set not null, alter column org_id set default default_org();
alter table leads           alter column org_id set not null, alter column org_id set default default_org();
alter table portal_projects alter column org_id set not null, alter column org_id set default default_org();

create index quotes_org_idx          on quotes (org_id, updated_at desc);
create index quote_templates_org_idx on quote_templates (org_id);
create index leads_org_idx           on leads (org_id, created_at desc);
create index portal_projects_org_idx on portal_projects (org_id, updated_at desc);

-- Offerter och projekt följer nu organisationen, inte "någon admin".
drop policy "quotes_admin" on quotes;
create policy "quotes_member_select" on quotes
  for select to authenticated using (is_org_member(org_id));
create policy "quotes_staff_write" on quotes
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));

drop policy "quote_templates_admin" on quote_templates;
create policy "quote_templates_member_select" on quote_templates
  for select to authenticated using (is_org_member(org_id));
create policy "quote_templates_staff_write" on quote_templates
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));

drop policy "portal_projects_admin" on portal_projects;
create policy "portal_projects_org_select" on portal_projects
  for select to authenticated using (is_org_member(org_id));
create policy "portal_projects_staff_write" on portal_projects
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
-- "portal_projects_member" (kundens läsning) finns kvar från 0010.

-- Kunden ska fortfarande kunna skicka (service role) och admin läsa; is_admin()
-- räcker för leads tills inkorgen blir per organisation.

-- =====================================================================
-- 3. Inställningar och nummerserier
-- =====================================================================

create table org_settings (
  org_id      uuid primary key references organizations(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,   -- lib/core: företag, kontoplan, villkor, bank, swish, påminnelser
  updated_at  timestamptz not null default now()
);
create trigger org_settings_set_updated_at before update on org_settings
  for each row execute function set_updated_at();

-- Konfiguration per serie …
create table number_series (
  org_id      uuid not null references organizations(id) on delete cascade,
  series      text not null,                        -- 'F' fakturor, 'V' verifikationer
  per_year    boolean not null default false,
  start       int not null default 1,
  pad         int not null default 0,
  primary key (org_id, series)
);

-- … och räknaren. Rader skapas vid första användningen. En uppdatering per
-- utfärdande med radlås ger en obruten serie även när två utfärdar samtidigt.
create table number_counters (
  org_id      uuid not null references organizations(id) on delete cascade,
  series      text not null,
  year        int  not null default 0,              -- 0 = löpande serie
  next        int  not null,
  primary key (org_id, series, year),
  foreign key (org_id, series) references number_series(org_id, series) on delete cascade
);

create or replace function public.next_document_number(p_org uuid, p_series text, p_year int default 0) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  v_start int;
  v_n int;
begin
  if not public.can_write_org(p_org) then
    raise exception 'Saknar behörighet att utfärda i organisationen.' using errcode = '42501';
  end if;
  select start into v_start from public.number_series where org_id = p_org and series = p_series;
  if v_start is null then
    raise exception 'Nummerserien % finns inte.', p_series;
  end if;
  insert into public.number_counters (org_id, series, year, next)
    values (p_org, p_series, p_year, v_start + 1)
    on conflict (org_id, series, year) do update set next = public.number_counters.next + 1
    returning next - 1 into v_n;
  return v_n;
end;
$$;
revoke all on function public.next_document_number(uuid, text, int) from public;
grant execute on function public.next_document_number(uuid, text, int) to authenticated;

insert into number_series (org_id, series, per_year, start, pad) values
  (default_org(), 'F', false, 10001, 0),
  (default_org(), 'V', true, 1, 0);

alter table org_settings    enable row level security;
alter table number_series   enable row level security;
alter table number_counters enable row level security;

create policy "org_settings_member_select" on org_settings
  for select to authenticated using (is_org_member(org_id));
create policy "org_settings_admin_write" on org_settings
  for all to authenticated using (can_admin_org(org_id)) with check (can_admin_org(org_id));
create policy "number_series_member_select" on number_series
  for select to authenticated using (is_org_member(org_id));
create policy "number_series_admin_write" on number_series
  for all to authenticated using (can_admin_org(org_id)) with check (can_admin_org(org_id));
create policy "number_counters_member_select" on number_counters
  for select to authenticated using (is_org_member(org_id));
-- number_counters skrivs bara av next_document_number().

-- =====================================================================
-- 4. Loggboken: bara växer
-- =====================================================================

create table events (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  aggregate_type  text not null,                    -- invoice|payment|customer|rot_claim|export|api_key
  aggregate_id    uuid not null,
  type            text not null,                    -- lib/core/events.ts
  data            jsonb not null default '{}'::jsonb,
  actor           jsonb not null default '{"kind":"system","name":"system"}'::jsonb,
  created_at      timestamptz not null default now()
);
create index events_aggregate_idx on events (org_id, aggregate_type, aggregate_id, created_at);
create index events_org_time_idx  on events (org_id, created_at desc);

create or replace function public.forbid_change() returns trigger language plpgsql as $$
begin
  raise exception 'Raden i % kan inte ändras eller tas bort.', tg_table_name using errcode = '0A000';
end;
$$;
create trigger events_immutable before update or delete on events
  for each row execute function forbid_change();

alter table events enable row level security;
create policy "events_member_select" on events
  for select to authenticated using (is_org_member(org_id));
create policy "events_staff_insert" on events
  for insert to authenticated with check (can_write_org(org_id));

-- =====================================================================
-- 5. Kunder
-- =====================================================================

create table customers (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  type                text not null check (type in ('privat','foretag','byggforetag')),
  name                text not null,
  company             text not null default '',
  org_nr              text not null default '',
  vat_nr              text not null default '',
  email               text not null default '',
  phone               text not null default '',
  street              text not null default '',
  postal_code         text not null default '',
  city                text not null default '',
  country_code        text not null default 'SE',
  reference           text not null default '',
  peppol_id           text not null default '',   -- 0007:5590000000 när e-faktura används
  einvoice_pref       text not null default 'email' check (einvoice_pref in ('email','peppol','kivra','post')),
  default_terms_days  int  not null default 30,
  notes               text not null default '',
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
create index customers_org_name_idx on customers (org_id, name);
create trigger customers_set_updated_at before update on customers
  for each row execute function set_updated_at();

alter table quotes add column customer_id uuid references customers(id) on delete set null;

alter table customers enable row level security;
create policy "customers_member_select" on customers
  for select to authenticated using (is_org_member(org_id));
create policy "customers_staff_write" on customers
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));

-- =====================================================================
-- 6. Fakturor
-- =====================================================================

create table invoices (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  series              text not null default 'F',
  number              text,                                       -- null tills utfärdad
  kind                text not null default 'invoice' check (kind in ('invoice','credit')),
  status              text not null default 'draft'
                        check (status in ('draft','issued','sent','partially_paid','paid','credited','void')),
  customer_id         uuid references customers(id) on delete restrict,
  quote_id            uuid references quotes(id) on delete set null,
  project_id          uuid references portal_projects(id) on delete set null,
  plan_step_id        uuid,                                       -- payment_plan_steps, fk sätts nedan
  credits_invoice_id  uuid references invoices(id) on delete restrict,
  document            jsonb not null,                             -- lib/core/documents/invoice.ts, fryses vid utfärdande
  currency            text not null default 'SEK',
  total_ore           bigint not null default 0,                  -- inkl. moms (BT-112)
  vat_ore             bigint not null default 0,
  rot_ore             bigint not null default 0,
  payable_ore         bigint not null default 0,                  -- att betala (BT-115)
  paid_ore            bigint not null default 0,                  -- summa kopplade inbetalningar
  issued_on           date,
  due_on              date,
  delivered_on        date,
  ocr                 text,
  pdf_path            text,                                       -- låst PDF i bucketen
  sha256              text,                                       -- hash av det frysta dokumentet
  sent_at             timestamptz,
  paid_at             timestamptz,
  reminded_at         timestamptz,
  reminders           int not null default 0,
  created_by          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index invoices_number_idx on invoices (org_id, series, number) where number is not null;
create index invoices_org_status_idx   on invoices (org_id, status, due_on);
create index invoices_org_customer_idx on invoices (org_id, customer_id);
create index invoices_org_project_idx  on invoices (org_id, project_id);
create index invoices_org_updated_idx  on invoices (org_id, updated_at desc);
create trigger invoices_set_updated_at before update on invoices
  for each row execute function set_updated_at();

-- Utfärdad = låst. Bara betalnings- och utskicksfälten får röras.
create or replace function public.invoices_freeze() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then
    if new.document is distinct from old.document
       or new.number is distinct from old.number
       or new.series is distinct from old.series
       or new.kind is distinct from old.kind
       or new.customer_id is distinct from old.customer_id
       or new.credits_invoice_id is distinct from old.credits_invoice_id
       or new.currency is distinct from old.currency
       or new.total_ore is distinct from old.total_ore
       or new.vat_ore is distinct from old.vat_ore
       or new.rot_ore is distinct from old.rot_ore
       or new.payable_ore is distinct from old.payable_ore
       or new.issued_on is distinct from old.issued_on
       or new.due_on is distinct from old.due_on
       or new.delivered_on is distinct from old.delivered_on
       or new.ocr is distinct from old.ocr
       or new.sha256 is distinct from old.sha256
       or new.org_id is distinct from old.org_id then
      raise exception 'Faktura % är utfärdad och kan inte ändras. Skapa en kreditfaktura.', old.number using errcode = '0A000';
    end if;
    if new.status = 'draft' then
      raise exception 'En utfärdad faktura kan inte bli utkast igen.' using errcode = '0A000';
    end if;
  end if;
  return new;
end;
$$;
create trigger invoices_freeze before update on invoices
  for each row execute function invoices_freeze();

create or replace function public.invoices_no_delete() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then
    raise exception 'Faktura % är utfärdad och kan inte tas bort.', old.number using errcode = '0A000';
  end if;
  return old;
end;
$$;
create trigger invoices_no_delete before delete on invoices
  for each row execute function invoices_no_delete();

-- Rader som egen tabell för frågor (per ÄTA, per typ); dokumentet är källan.
create table invoice_lines (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  invoice_id      uuid not null references invoices(id) on delete cascade,
  sort            int not null default 0,
  line_id         text not null,                         -- BT-126, id i dokumentet
  description     text not null,
  quantity        numeric(12,3) not null default 1,
  unit            text not null default 'st',
  unit_price_ore  bigint not null default 0,              -- exkl. moms
  vat_category    text not null default 'S' check (vat_category in ('S','AE','E')),
  vat_rate        numeric(5,2) not null default 25,
  kind            text not null default 'other' check (kind in ('labor','material','other')),
  section         text not null default '',
  change_order_id uuid references change_orders(id) on delete set null,
  net_ore         bigint not null default 0,
  vat_ore         bigint not null default 0,
  gross_ore       bigint not null default 0
);
create index invoice_lines_invoice_idx on invoice_lines (invoice_id, sort);
create index invoice_lines_change_order_idx on invoice_lines (change_order_id);

alter table change_orders add column if not exists invoice_id uuid references invoices(id) on delete set null;

-- Betalplan på ett projekt: stegen blir fakturor.
create table payment_plans (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  project_id  uuid references portal_projects(id) on delete cascade,
  quote_id    uuid references quotes(id) on delete set null,
  kind        text not null default 'fixed' check (kind in ('fixed','phases')),
  created_at  timestamptz not null default now()
);
create table payment_plan_steps (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  plan_id       uuid not null references payment_plans(id) on delete cascade,
  sort          int not null default 0,
  label         text not null,
  phase_id      uuid references project_phases(id) on delete set null,
  percent       numeric(5,2),                         -- andel av offerten …
  amount_ore    bigint,                               -- … eller fast belopp
  labor_share   numeric(5,4),                         -- arbetsandel för ROT; null = offertens
  due_rule      text not null default 'on_phase_done'
                  check (due_rule in ('on_start','on_phase_done','on_date','on_completion')),
  due_on        date,
  invoice_id    uuid references invoices(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index payment_plan_steps_plan_idx on payment_plan_steps (plan_id, sort);
alter table invoices add constraint invoices_plan_step_fkey
  foreign key (plan_step_id) references payment_plan_steps(id) on delete set null;

-- Återkommande fakturor (01: månadsavtal).
create table recurring_invoices (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  customer_id  uuid not null references customers(id) on delete restrict,
  name         text not null,
  template     jsonb not null,                         -- ett fakturadokument utan datum och nummer
  interval     text not null check (interval in ('monthly','quarterly','yearly')),
  next_on      date not null,
  auto_issue   boolean not null default false,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index recurring_invoices_next_idx on recurring_invoices (org_id, active, next_on);

create table reminders (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  invoice_id    uuid not null references invoices(id) on delete cascade,
  level         int not null default 1,
  fee_ore       bigint not null default 0,
  interest_ore  bigint not null default 0,
  sent_to       text not null default '',
  sent_at       timestamptz not null default now(),
  created_by    text
);
create index reminders_invoice_idx on reminders (invoice_id, sent_at desc);

alter table invoices           enable row level security;
alter table invoice_lines      enable row level security;
alter table payment_plans      enable row level security;
alter table payment_plan_steps enable row level security;
alter table recurring_invoices enable row level security;
alter table reminders          enable row level security;

create policy "invoices_member_select" on invoices
  for select to authenticated using (is_org_member(org_id));
create policy "invoices_staff_write" on invoices
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
create policy "invoice_lines_member_select" on invoice_lines
  for select to authenticated using (is_org_member(org_id));
create policy "invoice_lines_staff_write" on invoice_lines
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
create policy "payment_plans_member_select" on payment_plans
  for select to authenticated using (is_org_member(org_id));
create policy "payment_plans_staff_write" on payment_plans
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
create policy "payment_plan_steps_member_select" on payment_plan_steps
  for select to authenticated using (is_org_member(org_id));
create policy "payment_plan_steps_staff_write" on payment_plan_steps
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
create policy "recurring_invoices_member_select" on recurring_invoices
  for select to authenticated using (is_org_member(org_id));
create policy "recurring_invoices_staff_write" on recurring_invoices
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
create policy "reminders_member_select" on reminders
  for select to authenticated using (is_org_member(org_id));
create policy "reminders_staff_write" on reminders
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));

-- Kunden ser sina fakturor i portalen via projektet.
create policy "invoices_portal_member" on invoices
  for select to authenticated using (project_id is not null and status <> 'draft' and is_member(project_id));

-- =====================================================================
-- 7. Pengar in
-- =====================================================================

create table bank_transactions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  source        text not null check (source in ('camt054','openbanking','manual')),
  external_id   text not null,                        -- bankens id eller radnummer i filen
  booked_on     date not null,
  amount_ore    bigint not null,
  currency      text not null default 'SEK',
  reference     text not null default '',             -- OCR eller meddelande
  counterpart   text not null default '',
  raw           jsonb not null default '{}'::jsonb,
  status        text not null default 'unmatched' check (status in ('unmatched','matched','ignored')),
  imported_at   timestamptz not null default now(),
  unique (org_id, source, external_id)
);
create index bank_transactions_org_status_idx on bank_transactions (org_id, status, booked_on desc);

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references organizations(id) on delete cascade,
  amount_ore          bigint not null,                -- negativt = återbetalning
  currency            text not null default 'SEK',
  method              text not null check (method in ('bankgiro','swish','card','manual','rot')),
  paid_on             date not null,
  reference           text not null default '',
  bank_transaction_id uuid references bank_transactions(id) on delete set null,
  note                text not null default '',
  created_by          text,
  created_at          timestamptz not null default now()
);
create index payments_org_date_idx on payments (org_id, paid_on desc);

create table payment_allocations (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  payment_id  uuid not null references payments(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete restrict,
  amount_ore  bigint not null,
  created_at  timestamptz not null default now()
);
create index payment_allocations_invoice_idx on payment_allocations (invoice_id);
create index payment_allocations_payment_idx on payment_allocations (payment_id);

alter table bank_transactions   enable row level security;
alter table payments            enable row level security;
alter table payment_allocations enable row level security;
create policy "bank_transactions_member_select" on bank_transactions
  for select to authenticated using (is_org_member(org_id));
create policy "bank_transactions_staff_write" on bank_transactions
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
create policy "payments_member_select" on payments
  for select to authenticated using (is_org_member(org_id));
create policy "payments_staff_write" on payments
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
create policy "payment_allocations_member_select" on payment_allocations
  for select to authenticated using (is_org_member(org_id));
create policy "payment_allocations_staff_write" on payment_allocations
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));

-- =====================================================================
-- 8. Huvudboken
-- =====================================================================

create table accounts (
  org_id   uuid not null references organizations(id) on delete cascade,
  number   text not null check (number ~ '^\d{4}$'),
  name     text not null,
  active   boolean not null default true,
  primary key (org_id, number)
);

create table journal_entries (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  series        text not null default 'V',
  fiscal_year   int  not null,
  number        int  not null,
  entry_date    date not null,
  text          text not null,
  source_type   text not null,                        -- invoice|credit|payment|reminder|reversal
  source_id     uuid,
  reversed_by   uuid references journal_entries(id),
  created_by    text,
  created_at    timestamptz not null default now(),
  unique (org_id, series, fiscal_year, number)
);
create index journal_entries_org_date_idx   on journal_entries (org_id, entry_date);
create index journal_entries_source_idx     on journal_entries (source_type, source_id);

create table journal_lines (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  entry_id     uuid not null references journal_entries(id) on delete cascade,
  account      text not null,
  debit_ore    bigint not null default 0 check (debit_ore >= 0),
  credit_ore   bigint not null default 0 check (credit_ore >= 0),
  project_id   uuid,
  customer_id  uuid,
  text         text,
  check (debit_ore = 0 or credit_ore = 0),
  foreign key (org_id, account) references accounts(org_id, number)
);
create index journal_lines_entry_idx   on journal_lines (entry_id);
create index journal_lines_account_idx on journal_lines (org_id, account);

create table period_locks (
  org_id        uuid not null references organizations(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  locked_by     text,
  locked_at     timestamptz not null default now(),
  primary key (org_id, period_start)
);

-- Verifikationer och rader ändras aldrig; fel rättas med vändande verifikation.
create trigger journal_entries_immutable before update or delete on journal_entries
  for each row execute function forbid_change();
create trigger journal_lines_immutable before update or delete on journal_lines
  for each row execute function forbid_change();

-- Ingen verifikation i en låst period.
create or replace function public.journal_entries_check_lock() returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.period_locks
             where org_id = new.org_id and new.entry_date between period_start and period_end) then
    raise exception 'Perioden för % är låst (exporterad till bokföringen).', new.entry_date using errcode = '0A000';
  end if;
  return new;
end;
$$;
create trigger journal_entries_check_lock before insert on journal_entries
  for each row execute function journal_entries_check_lock();

-- Varje verifikation balanserar vid commit.
create or replace function public.journal_entry_balanced() returns trigger language plpgsql as $$
declare
  v_debit bigint;
  v_credit bigint;
begin
  select coalesce(sum(debit_ore), 0), coalesce(sum(credit_ore), 0) into v_debit, v_credit
    from public.journal_lines where entry_id = new.entry_id;
  if v_debit <> v_credit then
    raise exception 'Verifikationen balanserar inte: debet % öre, kredit % öre.', v_debit, v_credit using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger journal_lines_balanced
  after insert on journal_lines
  deferrable initially deferred
  for each row execute function journal_entry_balanced();

alter table accounts        enable row level security;
alter table journal_entries enable row level security;
alter table journal_lines   enable row level security;
alter table period_locks    enable row level security;
create policy "accounts_member_select" on accounts
  for select to authenticated using (is_org_member(org_id));
create policy "accounts_admin_write" on accounts
  for all to authenticated using (can_admin_org(org_id)) with check (can_admin_org(org_id));
create policy "journal_entries_member_select" on journal_entries
  for select to authenticated using (is_org_member(org_id));
create policy "journal_lines_member_select" on journal_lines
  for select to authenticated using (is_org_member(org_id));
-- Verifikationer skrivs bara av issue_invoice() och motsvarande funktioner.
create policy "period_locks_member_select" on period_locks
  for select to authenticated using (is_org_member(org_id));
create policy "period_locks_admin_write" on period_locks
  for all to authenticated using (can_admin_org(org_id)) with check (can_admin_org(org_id));

-- BAS-kontona kärnan använder (lib/core/ledger/posting.ts), per organisation.
create or replace function public.seed_org_accounts(p_org uuid) returns void
  language sql security definer set search_path = public
as $$
  insert into public.accounts (org_id, number, name) values
    (p_org, '1510', 'Kundfordringar'),
    (p_org, '1513', 'Kundfordringar ROT, Skatteverket'),
    (p_org, '1930', 'Företagskonto'),
    (p_org, '2611', 'Utgående moms 25 %'),
    (p_org, '2621', 'Utgående moms 12 %'),
    (p_org, '2631', 'Utgående moms 6 %'),
    (p_org, '3001', 'Försäljning 25 %'),
    (p_org, '3002', 'Försäljning 12 %'),
    (p_org, '3003', 'Försäljning 6 %'),
    (p_org, '3004', 'Försäljning momsfri'),
    (p_org, '3231', 'Försäljning byggtjänster, omvänd betalningsskyldighet'),
    (p_org, '3591', 'Påminnelseavgifter'),
    (p_org, '3740', 'Öres- och kronutjämning'),
    (p_org, '8313', 'Ränteintäkter kundfordringar')
  on conflict do nothing
$$;
select seed_org_accounts(default_org());

-- =====================================================================
-- 9. ROT
-- =====================================================================

-- Personnummer och fastighet: egen tabell, bara owner/admin, aldrig i portalen.
create table rot_buyers (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  invoice_id       uuid not null references invoices(id) on delete cascade,
  name             text not null,
  personal_number  text not null,
  share_ore        bigint not null default 0,
  property         jsonb not null,                      -- {kind:'fastighet',designation} | {kind:'brf',orgNr,apartmentNumber}
  created_at       timestamptz not null default now()
);
create index rot_buyers_invoice_idx on rot_buyers (invoice_id);

create table rot_claims (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  status      text not null default 'draft' check (status in ('draft','sent','paid','rejected')),
  xml_path    text,
  sent_on     date,
  decided_on  date,
  paid_ore    bigint not null default 0,
  note        text not null default '',
  created_by  text,
  created_at  timestamptz not null default now()
);
create table rot_claim_items (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organizations(id) on delete cascade,
  claim_id        uuid not null references rot_claims(id) on delete cascade,
  invoice_id      uuid not null references invoices(id) on delete restrict,
  buyer_id        uuid not null references rot_buyers(id) on delete restrict,
  amount_ore      bigint not null,                      -- begärt för köparen
  work_ore        bigint not null,                      -- arbetskostnad inkl. moms
  paid_on         date not null,                        -- kundens betaldatum
  status          text not null default 'pending' check (status in ('pending','paid','rejected')),
  decision_note   text not null default ''
);
create index rot_claim_items_claim_idx on rot_claim_items (claim_id);
create index rot_claim_items_invoice_idx on rot_claim_items (invoice_id);

alter table rot_buyers      enable row level security;
alter table rot_claims      enable row level security;
alter table rot_claim_items enable row level security;
create policy "rot_buyers_admin" on rot_buyers
  for all to authenticated using (can_admin_org(org_id)) with check (can_admin_org(org_id));
create policy "rot_claims_member_select" on rot_claims
  for select to authenticated using (is_org_member(org_id));
create policy "rot_claims_staff_write" on rot_claims
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));
create policy "rot_claim_items_member_select" on rot_claim_items
  for select to authenticated using (is_org_member(org_id));
create policy "rot_claim_items_staff_write" on rot_claim_items
  for all to authenticated using (can_write_org(org_id)) with check (can_write_org(org_id));

-- =====================================================================
-- 10. API: nycklar, idempotens, webhooks
-- =====================================================================

create table api_keys (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  prefix        text not null,                          -- de första tecknen, för att känna igen nyckeln
  key_hash      text not null unique,                   -- sha256 av hela nyckeln; nyckeln lagras aldrig
  scopes        text[] not null default '{read}',       -- read|write|admin
  created_by    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index api_keys_org_idx on api_keys (org_id);

create table idempotency_keys (
  org_id        uuid not null references organizations(id) on delete cascade,
  key           text not null,
  request_hash  text not null,
  status        int  not null,
  response      jsonb not null,
  created_at    timestamptz not null default now(),
  primary key (org_id, key)
);
create index idempotency_keys_created_idx on idempotency_keys (created_at);

create table webhook_endpoints (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  url         text not null,
  secret      text not null default encode(gen_random_bytes(32), 'hex'),
  events      text[] not null default '{}',             -- lib/core/events.ts WEBHOOK_EVENT_TYPES; tom = alla
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create table webhook_deliveries (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references organizations(id) on delete cascade,
  endpoint_id      uuid not null references webhook_endpoints(id) on delete cascade,
  event_id         uuid not null references events(id) on delete cascade,
  attempt          int  not null default 0,
  status           int,
  response         text,
  next_attempt_at  timestamptz not null default now(),
  delivered_at     timestamptz,
  created_at       timestamptz not null default now()
);
create index webhook_deliveries_due_idx on webhook_deliveries (next_attempt_at) where delivered_at is null;

alter table api_keys           enable row level security;
alter table idempotency_keys   enable row level security;
alter table webhook_endpoints  enable row level security;
alter table webhook_deliveries enable row level security;
create policy "api_keys_admin" on api_keys
  for all to authenticated using (can_admin_org(org_id)) with check (can_admin_org(org_id));
create policy "webhook_endpoints_admin" on webhook_endpoints
  for all to authenticated using (can_admin_org(org_id)) with check (can_admin_org(org_id));
create policy "webhook_deliveries_admin_select" on webhook_deliveries
  for select to authenticated using (can_admin_org(org_id));
-- idempotency_keys och webhook_deliveries skrivs av servern (service role).

-- =====================================================================
-- 11. Utfärda en faktura: en transaktion
-- =====================================================================

-- OCR enligt Bankgirot: referens + längdsiffra + Luhn-kontrollsiffra.
-- Samma algoritm som lib/core/ocr.ts.
create or replace function public.ocr_for(p_reference text) returns text
  language plpgsql immutable
as $$
declare
  v_ref text := regexp_replace(p_reference, '\D', '', 'g');
  v_payload text;
  v_sum int := 0;
  v_double boolean := true;
  v_d int;
  i int;
begin
  if length(v_ref) = 0 or length(v_ref) > 23 then
    raise exception 'OCR-referensen måste vara 1–23 siffror.';
  end if;
  v_payload := v_ref || ((length(v_ref) + 2) % 10)::text;
  for i in reverse length(v_payload)..1 loop
    v_d := substr(v_payload, i, 1)::int * (case when v_double then 2 else 1 end);
    if v_d > 9 then v_d := v_d - 9; end if;
    v_sum := v_sum + v_d;
    v_double := not v_double;
  end loop;
  return v_payload || ((10 - (v_sum % 10)) % 10)::text;
end;
$$;

-- p_document: dokumentet utan nummer. p_totals: {total,vat,rot,payable} i öre.
-- p_posting: {date,text,lines:[{account,debit,credit,projectId,customerId,text}]}
-- från lib/core/ledger/posting.ts, med "{number}" som platshållare i texten.
-- Allt eller inget: nummer, fryst dokument, hash, OCR, verifikation, händelse.
create or replace function public.issue_invoice(
  p_invoice uuid,
  p_document jsonb,
  p_totals jsonb,
  p_posting jsonb,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv      public.invoices%rowtype;
  v_series   public.number_series%rowtype;
  v_issue    date;
  v_year     int;
  v_counter  int;
  v_number   text;
  v_ocr      text;
  v_doc      jsonb;
  v_entry_id uuid;
  v_ver_year int;
  v_ver_no   int;
  v_line     jsonb;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'Faktura % är redan utfärdad.', v_inv.number;
  end if;
  if p_document->>'number' is not null then
    raise exception 'Dokumentet har redan ett nummer.';
  end if;

  v_issue := (p_document->>'issueDate')::date;
  select * into v_series from public.number_series where org_id = v_inv.org_id and series = v_inv.series;
  if not found then
    raise exception 'Nummerserien % finns inte.', v_inv.series;
  end if;
  v_year := case when v_series.per_year then extract(year from v_issue)::int else 0 end;
  v_counter := public.next_document_number(v_inv.org_id, v_inv.series, v_year);
  v_number := case when v_series.per_year
                   then v_year::text || '-' || lpad(v_counter::text, greatest(v_series.pad, length(v_counter::text)), '0')
                   else v_counter::text end;
  v_ocr := public.ocr_for(v_number);

  v_doc := jsonb_set(p_document, '{number}', to_jsonb(v_number));
  v_doc := jsonb_set(v_doc, '{paymentMeans,ocr}', to_jsonb(v_ocr));

  update public.invoices set
    number      = v_number,
    status      = 'issued',
    document    = v_doc,
    ocr         = v_ocr,
    issued_on   = v_issue,
    due_on      = (p_document->>'dueDate')::date,
    delivered_on = nullif(p_document->>'deliveryDate', '')::date,
    total_ore   = (p_totals->>'total')::bigint,
    vat_ore     = (p_totals->>'vat')::bigint,
    rot_ore     = coalesce((p_totals->>'rot')::bigint, 0),
    payable_ore = (p_totals->>'payable')::bigint,
    sha256      = encode(digest(v_doc::text, 'sha256'), 'hex')
  where id = p_invoice;

  -- Verifikation i serien V, per räkenskapsår (kalenderår tills vidare).
  v_ver_year := extract(year from v_issue)::int;
  v_ver_no := public.next_document_number(v_inv.org_id, 'V', v_ver_year);
  insert into public.journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type, source_id, created_by)
    values (v_inv.org_id, 'V', v_ver_year, v_ver_no, v_issue,
            replace(p_posting->>'text', '{number}', v_number),
            case when v_inv.kind = 'credit' then 'credit' else 'invoice' end,
            p_invoice, p_actor->>'name')
    returning id into v_entry_id;
  for v_line in select * from jsonb_array_elements(p_posting->'lines') loop
    insert into public.journal_lines (org_id, entry_id, account, debit_ore, credit_ore, project_id, customer_id, text)
      values (v_inv.org_id, v_entry_id, v_line->>'account',
              coalesce((v_line->>'debit')::bigint, 0), coalesce((v_line->>'credit')::bigint, 0),
              nullif(v_line->'dimensions'->>'projectId', '')::uuid,
              nullif(v_line->'dimensions'->>'customerId', '')::uuid,
              v_line->>'text');
  end loop;

  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.issued',
            jsonb_build_object('number', v_number, 'payable', (p_totals->>'payable')::bigint, 'entry', v_ver_year::text || '-' || v_ver_no::text),
            p_actor);

  return jsonb_build_object('number', v_number, 'ocr', v_ocr, 'entryId', v_entry_id, 'entryNumber', v_ver_year::text || '-' || v_ver_no::text);
end;
$$;
revoke all on function public.issue_invoice(uuid, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.issue_invoice(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated;
revoke all on function public.ocr_for(text) from public;
grant execute on function public.ocr_for(text) to authenticated;

-- Fakturan som dokument i portalen använder project_documents.kind = 'invoice'
-- (finns sedan 0010). Lagras när PDF:en renderats, från applikationen.
