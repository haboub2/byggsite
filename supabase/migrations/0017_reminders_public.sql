-- Fas 3: påminnelser, publik fakturasida och bankfil.

-- org_id får default_org() på tabellerna som applikationen skriver direkt
-- (lib/core/*/store.ts skickar inget org_id). 0014 satte det bara på de
-- gamla tabellerna, så en insert i t.ex. customers föll på not null. När
-- det finns fler organisationer sätts org_id uttryckligen (fas 5).
alter table events             alter column org_id set default default_org();
alter table customers          alter column org_id set default default_org();
alter table invoices           alter column org_id set default default_org();
alter table invoice_lines      alter column org_id set default default_org();
alter table payment_plans      alter column org_id set default default_org();
alter table payment_plan_steps alter column org_id set default default_org();
alter table recurring_invoices alter column org_id set default default_org();
alter table reminders          alter column org_id set default default_org();
alter table bank_transactions  alter column org_id set default default_org();
alter table payments           alter column org_id set default default_org();
alter table payment_allocations alter column org_id set default default_org();
alter table rot_buyers         alter column org_id set default default_org();
alter table rot_claims         alter column org_id set default default_org();
alter table rot_claim_items    alter column org_id set default default_org();

-- Den dagliga körningen (app/api/cron/invoices) har ingen användare utan
-- service role; då är auth.uid() null och can_write_org() falsk.
create or replace function public.can_write_org_or_system(org uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select coalesce(auth.jwt()->>'role', '') = 'service_role' or public.can_write_org(org) $$;
revoke all on function public.can_write_org_or_system(uuid) from public, anon;
grant execute on function public.can_write_org_or_system(uuid) to authenticated, service_role;

-- Samma undantag i nummerserien, som register_reminder anropar för
-- verifikationen. Oförändrad i övrigt (0014).
create or replace function public.next_document_number(p_org uuid, p_series text, p_year int default 0) returns int
  language plpgsql security definer set search_path = public
as $$
declare
  v_start int;
  v_n int;
begin
  if not public.can_write_org_or_system(p_org) then
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
revoke all on function public.next_document_number(uuid, text, int) from public, anon;
grant execute on function public.next_document_number(uuid, text, int) to authenticated, service_role;

-- Publik sida utan inloggning: /faktura/<token>. Slumpad vid skapandet,
-- null stänger sidan. Läses med service role; anon har ingen policy.
alter table invoices add column if not exists public_token text unique default encode(gen_random_bytes(16), 'hex');

-- En påminnelse som transaktion: raden, fakturans räknare, verifikationen
-- för avgift och ränta (konteringen från lib/core/ledger/posting.ts) och
-- händelsen. Avgift och ränta läggs på kundfordran; fakturans payable_ore
-- rörs inte (den är det utfärdade dokumentet), så "kvar att betala" visas
-- som payable + påminnelsebelopp − betalt i applikationen.
create or replace function public.register_reminder(
  p_invoice uuid,
  p_fee bigint,
  p_interest bigint,
  p_sent_to text,
  p_posting jsonb,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
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

  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.reminded',
            jsonb_build_object('number', v_inv.number, 'level', v_inv.reminders + 1, 'fee', p_fee, 'interest', p_interest, 'to', p_sent_to), p_actor);
  return jsonb_build_object('reminderId', v_rem_id, 'level', v_inv.reminders + 1);
end;
$$;
revoke all on function public.register_reminder(uuid, bigint, bigint, text, jsonb, jsonb) from public, anon;
grant execute on function public.register_reminder(uuid, bigint, bigint, text, jsonb, jsonb) to authenticated, service_role;

-- Betalning kopplad till en banktransaktion markerar den som matchad.
create or replace function public.mark_bank_transaction(p_tx uuid, p_status text, p_payment uuid default null)
returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_tx public.bank_transactions%rowtype;
begin
  select * into v_tx from public.bank_transactions where id = p_tx for update;
  if not found then
    raise exception 'Transaktionen finns inte.';
  end if;
  if not public.can_write_org_or_system(v_tx.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if p_status not in ('unmatched','matched','ignored') then
    raise exception 'Okänd status %.', p_status;
  end if;
  update public.bank_transactions set status = p_status where id = p_tx;
  if p_payment is not null then
    update public.payments set bank_transaction_id = p_tx where id = p_payment;
  end if;
end;
$$;
revoke all on function public.mark_bank_transaction(uuid, text, uuid) from public, anon;
grant execute on function public.mark_bank_transaction(uuid, text, uuid) to authenticated, service_role;
