-- Flera mottagare för fakturor och påminnelser (docs/fakturering.md, läge 2026-10-22).
--
-- customers.invoice_emails  "Fakturor till": adresserna fakturan mejlas till.
--                           Tom lista betyder kundens vanliga e-postadress.
-- customers.cc_emails       "Kopia till": får fakturan som kopia.
--
-- Vid utfärdande fryses listorna in i fakturadokumentet (se.recipients), så
-- ett senare utskick av en gammal faktura går till adresserna som gällde då.
-- mark_invoice_sent och register_reminder tar dessutom emot hela listan
-- (p_recipients, {"to": [...], "cc": [...]}) och loggar den i händelsen.
-- Utan p_recipients fungerar de som förut (Markera skickad, Registrera bara).

-- =====================================================================
-- 1. Kolumner
-- =====================================================================

alter table customers add column if not exists invoice_emails text[] not null default '{}';
alter table customers add column if not exists cc_emails text[] not null default '{}';

alter table customers drop constraint if exists customers_invoice_emails_check;
alter table customers add constraint customers_invoice_emails_check check (coalesce(array_length(invoice_emails, 1), 0) <= 10);
alter table customers drop constraint if exists customers_cc_emails_check;
alter table customers add constraint customers_cc_emails_check check (coalesce(array_length(cc_emails, 1), 0) <= 10);

-- =====================================================================
-- 2. mark_invoice_sent med mottagarlistan
-- =====================================================================

drop function if exists public.mark_invoice_sent(uuid, text, jsonb);

create or replace function public.mark_invoice_sent(
  p_invoice uuid,
  p_to text,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb,
  p_recipients jsonb default null
) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv  public.invoices%rowtype;
  v_data jsonb;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'Utfärda fakturan innan den skickas.';
  end if;
  if v_inv.status = 'void' then
    raise exception 'Faktura % är makulerad och skickas inte.', v_inv.number;
  end if;
  update public.invoices set
    sent_at = coalesce(sent_at, now()),
    status  = case when status = 'issued' then 'sent' else status end
  where id = p_invoice;
  v_data := jsonb_build_object('number', v_inv.number, 'to', p_to);
  if p_recipients is not null then
    v_data := v_data || jsonb_build_object('recipients', p_recipients);
  end if;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.sent', v_data, p_actor);
end;
$$;
revoke all on function public.mark_invoice_sent(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.mark_invoice_sent(uuid, text, jsonb, jsonb) to authenticated, service_role;

-- =====================================================================
-- 3. register_reminder med mottagarlistan (i övrigt som i 0017)
-- =====================================================================

drop function if exists public.register_reminder(uuid, bigint, bigint, text, jsonb, jsonb);

create or replace function public.register_reminder(
  p_invoice uuid,
  p_fee bigint,
  p_interest bigint,
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
  v_today    date := current_date;
  v_data     jsonb;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if coalesce(p_fee, 0) < 0 or coalesce(p_interest, 0) < 0 then
    raise exception 'Avgift och ränta kan inte vara negativa.';
  end if;
  if v_inv.status not in ('issued','sent','partially_paid') then
    raise exception 'Faktura % är %, inte obetald.', v_inv.number, v_inv.status;
  end if;

  insert into public.reminders (org_id, invoice_id, level, fee_ore, interest_ore, sent_to, created_by)
    values (v_inv.org_id, p_invoice, v_inv.reminders + 1, p_fee, p_interest, coalesce(p_sent_to, ''), p_actor->>'name')
    returning id into v_rem_id;
  update public.invoices set reminders = reminders + 1, reminded_at = now() where id = p_invoice;

  if p_fee + p_interest > 0 then
    v_year := extract(year from v_today)::int;
    v_no := public.next_document_number(v_inv.org_id, 'V', v_year);
    insert into public.journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type, source_id, created_by)
      values (v_inv.org_id, 'V', v_year, v_no, v_today, coalesce(p_posting->>'text', 'Påminnelseavgift och dröjsmålsränta'), 'reminder', v_rem_id, p_actor->>'name')
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

  v_data := jsonb_build_object('number', v_inv.number, 'level', v_inv.reminders + 1, 'fee', p_fee, 'interest', p_interest, 'to', p_sent_to);
  if p_recipients is not null then
    v_data := v_data || jsonb_build_object('recipients', p_recipients);
  end if;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.reminded', v_data, p_actor);
  return jsonb_build_object('reminderId', v_rem_id, 'level', v_inv.reminders + 1);
end;
$$;
revoke all on function public.register_reminder(uuid, bigint, bigint, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.register_reminder(uuid, bigint, bigint, text, jsonb, jsonb, jsonb) to authenticated, service_role;
