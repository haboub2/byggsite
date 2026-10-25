-- Kvittning vid Rätta belopp på betalda fakturor (docs/fakturering.md, läge
-- 2026-10-25: kvittning).
--
-- Rätta belopp krediterar originalet i sin helhet och öppnar ett nytt utkast
-- som personalen rättar. Har kunden redan betalat på originalet flyttas
-- betalningen till den nya fakturan när utkastet utfärdas, i samma
-- transaktion som utfärdandet:
--
--   utkastet          replaces_invoice_id   originalet det ersätter
--                     offset_from_credit_id kreditfakturan som krediterade det
--   issue_replacement_invoice
--                     utfärdar utkastet med issue_invoice(), flyttar
--                     originalets betalningar (en kvittning per betalning,
--                     method 'offset', 0 kr, fördelad -X på originalet och +X
--                     på den nya fakturan), bokför kvittningen 1510 mot 1510
--                     och flyttar betalplanens steg och ÄTA till den nya
--                     fakturan. Händelsen invoice.offset loggas på båda.
--
-- Ingen ny bankpost: krediten har krediterat 1510 med hela originalet,
-- utfärdandet debiterar 1510 med den nya fakturan, och kvittningen flyttar
-- det betalda mellan fakturorna på samma konto (raderna namnger fakturorna).
-- Blir den nya fakturan lägre än det betalda är den överbetald ("att
-- återbetala") och återbetalningen registreras med register_payment och ett
-- negativt belopp (1510 mot 1930). Blir den högre är resten öppen med den
-- nya fakturans OCR.
--
-- Ett utkast med replaces_invoice_id kan bara utfärdas genom
-- issue_replacement_invoice (en vakt i en egen trigger, så att issue_invoice
-- och invoices_freeze inte behöver skrivas om här).

-- =====================================================================
-- 1. Kolumner
-- =====================================================================

alter table invoices
  -- På den nya fakturan: originalet den ersätter.
  add column if not exists replaces_invoice_id   uuid references invoices(id) on delete restrict,
  -- På den nya fakturan: kreditfakturan som betalningen kvittas mot.
  add column if not exists offset_from_credit_id uuid references invoices(id) on delete restrict;

alter table invoices drop constraint if exists invoices_replacement_link;
alter table invoices add constraint invoices_replacement_link
  check ((offset_from_credit_id is null or replaces_invoice_id is not null) and (replaces_invoice_id is null or kind = 'invoice'));
-- Ett original ersätts en gång och en kreditfaktura kvittas en gång.
create unique index if not exists invoices_replaces_idx on invoices (replaces_invoice_id) where replaces_invoice_id is not null;
create unique index if not exists invoices_offset_credit_idx on invoices (offset_from_credit_id) where offset_from_credit_id is not null;

-- Kvittning som eget betalsätt. Samma lista som tidigare plus 'offset'.
alter table payments drop constraint if exists payments_method_check;
alter table payments add constraint payments_method_check
  check (method in ('bankgiro','swish','card','manual','rot','offset'));
alter table payments
  -- På en kvittning: betalningen på originalet som flyttas.
  add column if not exists offsets_payment_id uuid references payments(id) on delete restrict,
  -- På en kvittning: kreditfakturan den kvittas mot.
  add column if not exists offset_credit_id   uuid references invoices(id) on delete restrict;
alter table payments drop constraint if exists payments_offset_link;
alter table payments add constraint payments_offset_link
  check ((method = 'offset') = (offset_credit_id is not null and offsets_payment_id is not null)
         and (method <> 'offset' or amount_ore = 0));
create index if not exists payments_offsets_idx on payments (offsets_payment_id) where offsets_payment_id is not null;

-- =====================================================================
-- 2. Vakter
-- =====================================================================

-- Kopplingen fryses vid utfärdandet, och ett ersättande utkast utfärdas bara
-- genom issue_replacement_invoice (som gör kvittningen).
create or replace function public.invoices_guard_replacement() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' and (new.replaces_invoice_id is distinct from old.replaces_invoice_id
                                or new.offset_from_credit_id is distinct from old.offset_from_credit_id) then
    raise exception 'Faktura % är utfärdad och kan inte ändras.', old.number using errcode = '0A000';
  end if;
  if old.status = 'draft' and new.status <> 'draft' and coalesce(new.replaces_invoice_id, old.replaces_invoice_id) is not null
     and coalesce(current_setting('binaafy.replace_invoice', true), '') <> old.id::text then
    raise exception 'Fakturan ersätter en annan faktura och utfärdas bara med issue_replacement_invoice().' using errcode = '0A000';
  end if;
  return new;
end;
$$;
drop trigger if exists invoices_guard_replacement on invoices;
create trigger invoices_guard_replacement before update on invoices
  for each row execute function invoices_guard_replacement();

-- En kvittning skapas bara av issue_replacement_invoice.
create or replace function public.payments_guard_offset() returns trigger language plpgsql as $$
begin
  if (new.method = 'offset' or new.offset_credit_id is not null or new.offsets_payment_id is not null)
     and coalesce(current_setting('binaafy.replace_invoice', true), '') = '' then
    raise exception 'En kvittning registreras bara när den ersättande fakturan utfärdas.' using errcode = '0A000';
  end if;
  if tg_op = 'UPDATE' and (new.method is distinct from old.method or new.offset_credit_id is distinct from old.offset_credit_id
                           or new.offsets_payment_id is distinct from old.offsets_payment_id) then
    raise exception 'En betalnings källa kan inte ändras.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
drop trigger if exists payments_guard_offset on payments;
create trigger payments_guard_offset before insert or update on payments
  for each row execute function payments_guard_offset();

-- =====================================================================
-- 3. Utfärda den ersättande fakturan, med kvittning
-- =====================================================================

-- p_document, p_totals och p_posting som till issue_invoice(). p_offset_posting
-- är kvittningens verifikation (lib/core/ledger/posting.ts, postOffset), med
-- {number} för den nya fakturans nummer; den används bara när originalet har
-- betalningar. Dokumentet ska ha se.offset med samma belopp som är betalt på
-- originalet, eftersom PDF:en skriver ut kvittningen.
create or replace function public.issue_replacement_invoice(
  p_invoice uuid,
  p_document jsonb,
  p_totals jsonb,
  p_posting jsonb,
  p_offset_posting jsonb,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_inv      public.invoices%rowtype;
  v_orig     public.invoices%rowtype;
  v_credit   public.invoices%rowtype;
  v_new      public.invoices%rowtype;
  v_result   jsonb;
  v_number   text;
  v_moved    bigint;
  v_debit    bigint;
  v_credit_sum bigint;
  v_alloc    record;
  v_pay_id   uuid;
  v_entry_id uuid;
  v_year     int;
  v_no       int;
  v_line     jsonb;
  v_status   text;
  v_entry    text;
  v_cos      text[];
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_inv.status <> 'draft' then
    raise exception 'Faktura % är redan utfärdad.', v_inv.number;
  end if;
  if v_inv.replaces_invoice_id is null then
    raise exception 'Utkastet ersätter ingen faktura. Utfärda det som vanligt.';
  end if;

  select * into v_orig from public.invoices where id = v_inv.replaces_invoice_id for update;
  if not found or v_orig.org_id <> v_inv.org_id then
    raise exception 'Fakturan som ersätts finns inte.';
  end if;
  if v_orig.status <> 'credited' then
    raise exception 'Faktura % är inte krediterad. Kreditera den innan den ersätts.', v_orig.number;
  end if;
  if v_inv.offset_from_credit_id is not null then
    select * into v_credit from public.invoices where id = v_inv.offset_from_credit_id;
    if not found or v_credit.kind <> 'credit' or v_credit.credits_invoice_id is distinct from v_orig.id or v_credit.status = 'draft' then
      raise exception 'Kreditfakturan som betalningen kvittas mot är inte utfärdad mot faktura %.', v_orig.number;
    end if;
  end if;

  -- Det kunden har betalat på originalet, netto efter eventuella återbetalningar.
  v_moved := v_orig.paid_ore;
  if v_moved <> 0 and v_credit.id is null then
    raise exception 'Faktura % har betalningar men utkastet saknar kreditfakturan de kvittas mot.', v_orig.number;
  end if;
  if coalesce((p_document#>>'{se,offset,amountOre}')::bigint, 0) <> v_moved then
    raise exception 'Kvittningen på fakturan (% öre) stämmer inte med det som är betalt på faktura % (% öre). Ladda om sidan och utfärda igen.',
      coalesce((p_document#>>'{se,offset,amountOre}')::bigint, 0), v_orig.number, v_moved;
  end if;
  if v_moved <> 0 and (p_document#>>'{se,offset,invoiceNumber}' is distinct from v_orig.number
                       or p_document#>>'{se,offset,creditNumber}' is distinct from v_credit.number) then
    raise exception 'Kvittningen på fakturan hänvisar inte till faktura % och kreditfaktura %.', v_orig.number, v_credit.number;
  end if;
  if v_moved <> 0 then
    select coalesce(sum((l->>'debit')::bigint), 0), coalesce(sum((l->>'credit')::bigint), 0) into v_debit, v_credit_sum
      from jsonb_array_elements(coalesce(p_offset_posting->'lines', '[]'::jsonb)) l;
    if v_debit <> v_credit_sum or v_debit <> abs(v_moved) then
      raise exception 'Kvittningens verifikation balanserar inte mot beloppet (debet %, kredit %, belopp %).', v_debit, v_credit_sum, abs(v_moved);
    end if;
  end if;

  perform set_config('binaafy.replace_invoice', p_invoice::text, true);
  v_result := public.issue_invoice(p_invoice, p_document, p_totals, p_posting, p_actor);
  v_number := v_result->>'number';
  select * into v_new from public.invoices where id = p_invoice;

  -- Betalplanens steg och ÄTA följer med till fakturan som ersätter originalet.
  -- ÄTA som inte längre finns på någon rad är inte fakturerade.
  select coalesce(array_agg(l->>'changeOrderId'), '{}') into v_cos
    from jsonb_array_elements(p_document->'lines') l where coalesce(l->>'changeOrderId', '') <> '';
  update public.payment_plan_steps set invoice_id = p_invoice where invoice_id = v_orig.id and org_id = v_orig.org_id;
  update public.change_orders set invoice_id = case when id::text = any(v_cos) then p_invoice else null end
    where invoice_id = v_orig.id;

  if v_moved <> 0 then
    -- En kvittning per betalning på originalet: 0 kr i pengar, -X på originalet och +X på den nya fakturan.
    for v_alloc in
      select a.payment_id, sum(a.amount_ore) as amount
        from public.payment_allocations a
       where a.invoice_id = v_orig.id
       group by a.payment_id
      having sum(a.amount_ore) <> 0
       order by min(a.created_at), a.payment_id
    loop
      insert into public.payments (org_id, amount_ore, method, paid_on, reference, note, offsets_payment_id, offset_credit_id, created_by)
        values (v_orig.org_id, 0, 'offset', v_new.issued_on, v_orig.number,
                'Kvittning: betalning flyttad från faktura ' || v_orig.number || ' till faktura ' || v_number || ' (kreditfaktura ' || v_credit.number || ')',
                v_alloc.payment_id, v_credit.id, p_actor->>'name')
        returning id into v_pay_id;
      insert into public.payment_allocations (org_id, payment_id, invoice_id, amount_ore) values
        (v_orig.org_id, v_pay_id, v_orig.id, -v_alloc.amount),
        (v_orig.org_id, v_pay_id, p_invoice, v_alloc.amount);
    end loop;

    update public.invoices set paid_ore = paid_ore - v_moved where id = v_orig.id;
    v_status := case
      when v_moved >= v_new.payable_ore then 'paid'
      when v_moved > 0 then 'partially_paid'
      else v_new.status
    end;
    update public.invoices set
      paid_ore = v_moved,
      status   = v_status,
      paid_at  = case when v_status = 'paid' then now() else null end
    where id = p_invoice;

    v_year := extract(year from v_new.issued_on)::int;
    v_no := public.next_document_number(v_orig.org_id, 'V', v_year);
    v_entry := v_year::text || '-' || v_no::text;
    insert into public.journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type, source_id, created_by)
      values (v_orig.org_id, 'V', v_year, v_no, v_new.issued_on,
              replace(coalesce(p_offset_posting->>'text', 'Kvittning'), '{number}', v_number),
              'offset', p_invoice, p_actor->>'name')
      returning id into v_entry_id;
    for v_line in select * from jsonb_array_elements(p_offset_posting->'lines') loop
      insert into public.journal_lines (org_id, entry_id, account, debit_ore, credit_ore, project_id, customer_id, text)
        values (v_orig.org_id, v_entry_id, v_line->>'account',
                coalesce((v_line->>'debit')::bigint, 0), coalesce((v_line->>'credit')::bigint, 0),
                nullif(v_line->'dimensions'->>'projectId', '')::uuid,
                nullif(v_line->'dimensions'->>'customerId', '')::uuid,
                replace(v_line->>'text', '{number}', v_number));
    end loop;

    insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor) values
      (v_orig.org_id, 'invoice', v_orig.id, 'invoice.offset',
       jsonb_build_object('number', v_orig.number, 'toNumber', v_number, 'to', p_invoice, 'creditNumber', v_credit.number,
                          'amount', v_moved, 'entry', v_entry), p_actor),
      (v_orig.org_id, 'invoice', p_invoice, 'invoice.offset',
       jsonb_build_object('number', v_number, 'fromNumber', v_orig.number, 'from', v_orig.id, 'creditNumber', v_credit.number,
                          'amount', v_moved, 'payable', v_new.payable_ore, 'entry', v_entry), p_actor);
    if v_status in ('paid', 'partially_paid') then
      insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
        values (v_orig.org_id, 'invoice', p_invoice, 'invoice.' || v_status,
                jsonb_build_object('number', v_number, 'paid', v_moved, 'payable', v_new.payable_ore, 'amount', v_moved, 'method', 'offset'),
                p_actor);
    end if;
    v_result := v_result || jsonb_build_object('offset', v_moved, 'offsetEntryNumber', v_entry, 'status', v_status);
  end if;
  perform set_config('binaafy.replace_invoice', '', true);

  return v_result;
end;
$$;
revoke all on function public.issue_replacement_invoice(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.issue_replacement_invoice(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;
