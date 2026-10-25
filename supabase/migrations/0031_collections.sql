-- Inkasso efter påminnelsekedjan (docs/fakturering.md, läge 2026-10-25).
--
-- Två steg, båda utan avtal med något inkassobolag:
--
--   register_collection_demand  borgenärens eget inkassokrav enligt 5 §
--                               inkassolagen (1974:182): en rad i reminders
--                               med kind 'demand', inkassoavgift (högst 180 kr,
--                               4 § lagen 1981:739) och ränta bokförda som
--                               påminnelserna, betalningsfrist minst åtta dagar
--                               (FFFS 2025:2, 4 kap. 7 §). Bara ett per faktura.
--   open_collection_case        fakturan lämnas till inkasso: ett ärende i
--                               collection_cases (prepared → sent → paid/closed)
--                               och invoices.collection_case_id pekar på det
--                               så länge det är öppet.
--
-- En faktura hos inkasso får inga fler påminnelser, och en faktura med
-- inkassokrav inga fler vanliga påminnelser (vakt på reminders). När fakturan
-- blir betald eller krediterad stänger triggern ärendet i samma transaktion
-- som betalningen; register_payment och mark_invoice_credited är oförändrade.
-- Inkassokolumnerna på invoices ändras bara av funktionerna här
-- (transaktionslokal inställning binaafy.collection med fakturans id).

-- =====================================================================
-- 1. Tabellen och kolumnerna
-- =====================================================================

create table if not exists collection_cases (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null default default_org() references organizations(id) on delete cascade,
  invoice_id    uuid not null references invoices(id) on delete restrict,
  -- Ärendenumret mot inkassobolaget: fakturanumret och löpnummer, "10001-1".
  reference     text not null,
  status        text not null default 'prepared' check (status in ('prepared','sent','paid','closed')),
  agency        text not null default '',
  external_ref  text not null default '',
  -- Fordran när ärendet skapades (underlaget räknas om till dagens datum vid nedladdning).
  capital_ore   bigint not null check (capital_ore > 0),
  interest_ore  bigint not null default 0 check (interest_ore >= 0),
  fees_ore      bigint not null default 0 check (fees_ore >= 0),
  interest_to   date not null,
  note          text not null default '',
  sent_at       timestamptz,
  closed_at     timestamptz,
  created_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists collection_cases_reference_idx on collection_cases (org_id, reference);
-- Högst ett öppet ärende per faktura.
create unique index if not exists collection_cases_open_idx on collection_cases (invoice_id) where status in ('prepared','sent');
create index if not exists collection_cases_org_status_idx on collection_cases (org_id, status, created_at desc);
drop trigger if exists collection_cases_set_updated_at on collection_cases;
create trigger collection_cases_set_updated_at before update on collection_cases
  for each row execute function set_updated_at();

alter table collection_cases enable row level security;
drop policy if exists "collection_cases_member_select" on collection_cases;
create policy "collection_cases_member_select" on collection_cases
  for select to authenticated using (is_org_member(org_id));
-- Inga skrivpolicies: ärenden skapas och ändras bara med funktionerna nedan.
revoke insert, update, delete on collection_cases from anon, authenticated;

alter table invoices
  -- Det öppna inkassoärendet; null när inget är öppet.
  add column if not exists collection_case_id       uuid references collection_cases(id) on delete restrict,
  -- Inkassokravet: när det skickades och sista betalningsdag.
  add column if not exists collection_demanded_on   date,
  add column if not exists collection_demand_pay_by date;
create index if not exists invoices_collection_idx on invoices (org_id) where collection_case_id is not null;

alter table reminders
  add column if not exists kind   text not null default 'reminder',
  add column if not exists pay_by date;
alter table reminders drop constraint if exists reminders_kind_check;
alter table reminders add constraint reminders_kind_check check (kind in ('reminder','demand'));
alter table reminders drop constraint if exists reminders_demand_pay_by;
alter table reminders add constraint reminders_demand_pay_by check (kind <> 'demand' or pay_by is not null);

-- =====================================================================
-- 2. Vakter
-- =====================================================================

-- Påminnelser stoppas hos inkasso; efter inkassokravet kommer inga vanliga
-- påminnelser och inget andra krav. Gäller register_reminder också.
create or replace function public.reminders_collection_guard() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.invoices%rowtype;
begin
  select * into v_inv from public.invoices where id = new.invoice_id;
  if v_inv.collection_case_id is not null then
    raise exception 'Faktura % är hos inkasso och får inga fler påminnelser.', v_inv.number using errcode = '0A000';
  end if;
  if v_inv.collection_demanded_on is not null then
    if new.kind = 'demand' then
      raise exception 'Faktura % har redan fått ett inkassokrav.', v_inv.number using errcode = '0A000';
    end if;
    raise exception 'Faktura % har fått inkassokrav. Nästa steg är att lämna den till inkasso, inte en påminnelse.', v_inv.number using errcode = '0A000';
  end if;
  if new.kind = 'demand' and coalesce(current_setting('binaafy.collection', true), '') <> new.invoice_id::text then
    raise exception 'Ett inkassokrav registreras bara med register_collection_demand().' using errcode = '0A000';
  end if;
  return new;
end;
$$;
revoke all on function public.reminders_collection_guard() from public, anon, authenticated, service_role;
drop trigger if exists reminders_collection_guard on reminders;
create trigger reminders_collection_guard before insert on reminders
  for each row execute function reminders_collection_guard();

-- Inkassokolumnerna ändras bara av funktionerna. Blir fakturan betald eller
-- krediterad medan ett ärende är öppet stängs ärendet (betald → paid,
-- krediterad → closed) och händelsen loggas, i samma transaktion.
-- Namnet sorterar före invoices_freeze, som inte rör kolumnerna.
create or replace function public.invoices_collection() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_case public.collection_cases%rowtype;
  v_status text;
begin
  if (new.collection_case_id is distinct from old.collection_case_id
      or new.collection_demanded_on is distinct from old.collection_demanded_on
      or new.collection_demand_pay_by is distinct from old.collection_demand_pay_by)
     and coalesce(current_setting('binaafy.collection', true), '') <> old.id::text then
    raise exception 'Faktura % lämnas till och tas från inkasso bara med inkassofunktionerna.', old.number using errcode = '0A000';
  end if;
  if old.collection_case_id is not null
     and new.collection_case_id is not distinct from old.collection_case_id
     and new.status in ('paid','credited')
     and new.status is distinct from old.status then
    v_status := case new.status when 'paid' then 'paid' else 'closed' end;
    update public.collection_cases
       set status = v_status, closed_at = now(),
           note = case when note = '' then '' else note || E'\n' end
                  || case new.status when 'paid' then 'Fakturan betald.' else 'Fakturan krediterad.' end
     where id = old.collection_case_id and status in ('prepared','sent')
     returning * into v_case;
    if found then
      insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
        values (old.org_id, 'invoice', old.id, 'invoice.collection',
                jsonb_build_object('action', v_status, 'number', old.number, 'case', v_case.id, 'reference', v_case.reference,
                                   'agency', v_case.agency, 'reason', case new.status when 'paid' then 'betald' else 'krediterad' end),
                '{"kind":"system","name":"system"}'::jsonb);
    end if;
    new.collection_case_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.invoices_collection() from public, anon, authenticated, service_role;
drop trigger if exists invoices_collection on invoices;
create trigger invoices_collection before update on invoices
  for each row execute function invoices_collection();

-- =====================================================================
-- 3. Inkassokrav
-- =====================================================================

create or replace function public.register_collection_demand(
  p_invoice uuid,
  p_fee bigint,
  p_interest bigint,
  p_pay_by date,
  p_sent_to text,
  p_posting jsonb,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb,
  p_recipients jsonb default null
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv      public.invoices%rowtype;
  v_rem_id   uuid;
  v_entry_id uuid;
  v_year     int;
  v_no       int;
  v_line     jsonb;
  v_today    date := (now() at time zone 'Europe/Stockholm')::date;
  v_data     jsonb;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_inv.kind <> 'invoice' then
    raise exception 'Bara en vanlig faktura kan få inkassokrav.';
  end if;
  if v_inv.status not in ('issued','sent','partially_paid') then
    raise exception 'Faktura % är %, inte obetald.', v_inv.number, v_inv.status;
  end if;
  if v_inv.due_on is null or v_inv.due_on >= v_today then
    raise exception 'Faktura % är inte förfallen.', v_inv.number;
  end if;
  if v_inv.collection_case_id is not null then
    raise exception 'Faktura % är redan hos inkasso.', v_inv.number;
  end if;
  if v_inv.collection_demanded_on is not null then
    raise exception 'Faktura % har redan fått ett inkassokrav.', v_inv.number;
  end if;
  -- 4 § lagen (1981:739): högst 180 kr om inte särskilda skäl finns.
  if coalesce(p_fee, 0) < 0 or coalesce(p_fee, 0) > 18000 or coalesce(p_interest, 0) < 0 then
    raise exception 'Inkassoavgiften är högst 180 kr och räntan kan inte vara negativ.';
  end if;
  -- FFFS 2025:2, 4 kap. 7 §: minst åtta dagar från att kravet skickas.
  if p_pay_by is null or p_pay_by < v_today + 8 then
    raise exception 'Betalningsfristen ska vara minst åtta dagar, till % eller senare.', v_today + 8;
  end if;

  perform set_config('binaafy.collection', p_invoice::text, true);
  insert into public.reminders (org_id, invoice_id, level, fee_ore, interest_ore, sent_to, created_by, kind, pay_by)
    values (v_inv.org_id, p_invoice, v_inv.reminders + 1, p_fee, p_interest, coalesce(p_sent_to, ''), p_actor->>'name', 'demand', p_pay_by)
    returning id into v_rem_id;
  update public.invoices
     set reminders = reminders + 1, reminded_at = now(), collection_demanded_on = v_today, collection_demand_pay_by = p_pay_by
   where id = p_invoice;
  perform set_config('binaafy.collection', '', true);

  if p_fee + p_interest > 0 then
    v_year := extract(year from v_today)::int;
    v_no := public.next_document_number(v_inv.org_id, 'V', v_year);
    insert into public.journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type, source_id, created_by)
      values (v_inv.org_id, 'V', v_year, v_no, v_today, coalesce(p_posting->>'text', 'Inkassoavgift och dröjsmålsränta'), 'reminder', v_rem_id, p_actor->>'name')
      returning id into v_entry_id;
    for v_line in select * from jsonb_array_elements(p_posting->'lines') loop
      insert into public.journal_lines (org_id, entry_id, account, debit_ore, credit_ore, project_id, customer_id, text)
        values (v_inv.org_id, v_entry_id, v_line->>'account',
                coalesce((v_line->>'debit')::bigint, 0), coalesce((v_line->>'credit')::bigint, 0),
                nullif(v_line->'dimensions'->>'projectId', '')::uuid,
                nullif(v_line->'dimensions'->>'customerId', '')::uuid,
                v_line->>'text');
    end loop;
  end if;

  v_data := jsonb_build_object('action', 'demand', 'number', v_inv.number, 'level', v_inv.reminders + 1, 'fee', p_fee,
                               'interest', p_interest, 'payBy', p_pay_by, 'to', p_sent_to);
  if p_recipients is not null then
    v_data := v_data || jsonb_build_object('recipients', p_recipients);
  end if;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.collection', v_data, p_actor);
  return jsonb_build_object('reminderId', v_rem_id, 'level', v_inv.reminders + 1, 'payBy', p_pay_by);
end;
$$;
revoke all on function public.register_collection_demand(uuid, bigint, bigint, date, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.register_collection_demand(uuid, bigint, bigint, date, text, jsonb, jsonb, jsonb) to authenticated, service_role;

-- =====================================================================
-- 4. Lämna till inkasso
-- =====================================================================

create or replace function public.open_collection_case(
  p_invoice uuid,
  p_capital bigint,
  p_interest bigint,
  p_fees bigint,
  p_agency text default '',
  p_note text default '',
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv   public.invoices%rowtype;
  v_today date := (now() at time zone 'Europe/Stockholm')::date;
  v_n     int;
  v_ref   text;
  v_id    uuid;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_inv.kind <> 'invoice' then
    raise exception 'Bara en vanlig faktura lämnas till inkasso.';
  end if;
  if v_inv.status not in ('issued','sent','partially_paid') then
    raise exception 'Faktura % är %, inte obetald.', v_inv.number, v_inv.status;
  end if;
  if v_inv.due_on is null or v_inv.due_on >= v_today then
    raise exception 'Faktura % är inte förfallen.', v_inv.number;
  end if;
  if v_inv.reminders < 1 then
    raise exception 'Faktura % har inte fått någon påminnelse eller något inkassokrav.', v_inv.number;
  end if;
  if v_inv.collection_case_id is not null then
    raise exception 'Faktura % är redan hos inkasso.', v_inv.number;
  end if;
  -- 6 § inkassolagen och FFFS 2025:2, 3 kap. 5 §: inte innan kravets frist har gått ut.
  if v_inv.collection_demand_pay_by is not null and v_inv.collection_demand_pay_by >= v_today then
    raise exception 'Inkassokravet på faktura % ger kunden tid till och med %.', v_inv.number, v_inv.collection_demand_pay_by;
  end if;
  if p_capital is distinct from v_inv.payable_ore - v_inv.paid_ore then
    raise exception 'Kapitalet ska vara det obetalda beloppet på fakturan, %.', v_inv.payable_ore - v_inv.paid_ore;
  end if;
  if coalesce(p_interest, 0) < 0 or coalesce(p_fees, 0) < 0 then
    raise exception 'Ränta och avgifter kan inte vara negativa.';
  end if;
  if length(coalesce(p_agency, '')) > 120 or length(coalesce(p_note, '')) > 1000 then
    raise exception 'Inkassobolaget får vara högst 120 tecken och anteckningen högst 1000.';
  end if;

  select count(*) + 1 into v_n from public.collection_cases where invoice_id = p_invoice;
  v_ref := v_inv.number || '-' || v_n;
  insert into public.collection_cases (org_id, invoice_id, reference, capital_ore, interest_ore, fees_ore, interest_to, agency, note, created_by)
    values (v_inv.org_id, p_invoice, v_ref, p_capital, coalesce(p_interest, 0), coalesce(p_fees, 0), v_today,
            trim(coalesce(p_agency, '')), trim(coalesce(p_note, '')), p_actor->>'name')
    returning id into v_id;
  perform set_config('binaafy.collection', p_invoice::text, true);
  update public.invoices set collection_case_id = v_id where id = p_invoice;
  perform set_config('binaafy.collection', '', true);

  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.collection',
            jsonb_build_object('action', 'prepared', 'number', v_inv.number, 'case', v_id, 'reference', v_ref,
                               'capital', p_capital, 'interest', coalesce(p_interest, 0), 'fees', coalesce(p_fees, 0),
                               'agency', trim(coalesce(p_agency, ''))),
            p_actor);
  return jsonb_build_object('id', v_id, 'reference', v_ref);
end;
$$;
revoke all on function public.open_collection_case(uuid, bigint, bigint, bigint, text, text, jsonb) from public, anon;
grant execute on function public.open_collection_case(uuid, bigint, bigint, bigint, text, text, jsonb) to authenticated;

-- Skickat till inkassobolaget (prepared → sent; på ett skickat ärende ändras
-- bolag och deras ärendenummer), eller avslutat utan betalning (återkallat,
-- avskrivet): fakturan tas från inkasso och kan påminnas igen om den inte
-- har fått inkassokrav.
create or replace function public.update_collection_case(
  p_case uuid,
  p_action text,
  p_agency text default '',
  p_external_ref text default '',
  p_note text default '',
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_case public.collection_cases%rowtype;
  v_inv  public.invoices%rowtype;
begin
  select * into v_case from public.collection_cases where id = p_case for update;
  if not found then
    raise exception 'Ärendet finns inte.';
  end if;
  if not public.can_write_org(v_case.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_case.status not in ('prepared','sent') then
    raise exception 'Ärende % är avslutat.', v_case.reference;
  end if;
  select * into v_inv from public.invoices where id = v_case.invoice_id for update;

  if p_action = 'sent' then
    if trim(coalesce(p_agency, '')) = '' then
      raise exception 'Ange vilket inkassobolag ärendet lämnades till.';
    end if;
    if length(p_agency) > 120 or length(coalesce(p_external_ref, '')) > 80 then
      raise exception 'Inkassobolaget får vara högst 120 tecken och deras ärendenummer högst 80.';
    end if;
    update public.collection_cases
       set status = 'sent', agency = trim(p_agency), external_ref = trim(coalesce(p_external_ref, '')),
           sent_at = coalesce(sent_at, now())
     where id = p_case;
  elsif p_action = 'closed' then
    if trim(coalesce(p_note, '')) = '' then
      raise exception 'Ange varför ärendet avslutas.';
    end if;
    if length(p_note) > 1000 then
      raise exception 'Anteckningen får vara högst 1000 tecken.';
    end if;
    update public.collection_cases
       set status = 'closed', closed_at = now(),
           note = case when note = '' then '' else note || E'\n' end || trim(p_note)
     where id = p_case;
    perform set_config('binaafy.collection', v_inv.id::text, true);
    update public.invoices set collection_case_id = null where id = v_inv.id and collection_case_id = p_case;
    perform set_config('binaafy.collection', '', true);
  else
    raise exception 'Okänd åtgärd %.', p_action;
  end if;

  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_case.org_id, 'invoice', v_inv.id, 'invoice.collection',
            jsonb_build_object('action', p_action, 'number', v_inv.number, 'case', v_case.id, 'reference', v_case.reference,
                               'agency', case when p_action = 'sent' then trim(p_agency) else v_case.agency end,
                               'externalRef', case when p_action = 'sent' then trim(coalesce(p_external_ref, '')) else v_case.external_ref end,
                               'reason', case when p_action = 'closed' then trim(p_note) else '' end),
            p_actor);
  return jsonb_build_object('id', v_case.id, 'status', p_action);
end;
$$;
revoke all on function public.update_collection_case(uuid, text, text, text, text, jsonb) from public, anon;
grant execute on function public.update_collection_case(uuid, text, text, text, text, jsonb) to authenticated;
