-- Rättelser av utfärdade fakturor (docs/fakturering.md, läge 2026-10-22).
--
-- En utfärdad faktura ändras aldrig på plats (momslagen 17 kap. 22 §,
-- Skatteverkets ställningstagande 2024-06-11, dnr 8-2900380). Varje rättelse
-- är en ny handling med eget nummer och hänvisning till originalet:
--
--   void_invoice              makulerar en utfärdad men oskickad faktura utan
--                             betalningar. Numret behålls, utfärdandets
--                             verifikation vänds med en rättelsepost
--                             (BFNAR 2013:2 punkt 2.17–2.18).
--   issue_correction_invoice  utfärdar en ändringsfaktura (kind 'correction')
--                             som rättar uppgifter men inte belopp: nästa
--                             nummer i serien, samma OCR och förfallodag som
--                             originalet, ingen verifikation. Originalet får
--                             corrected_by och bär fortfarande beloppen och
--                             betalningarna.
--
-- Frystriggern släpper igenom just de två övergångarna och bara när de görs
-- av funktionerna (en transaktionslokal inställning med fakturans id). En
-- makulerad faktura är helt låst. register_payment stoppar betalningar på en
-- ändringsfaktura: de registreras på originalet.

-- =====================================================================
-- 1. Kolumner
-- =====================================================================

alter table invoices drop constraint if exists invoices_kind_check;
alter table invoices add constraint invoices_kind_check check (kind in ('invoice','credit','correction'));

alter table invoices
  add column if not exists voided_at           timestamptz,
  add column if not exists voided_by           text,
  add column if not exists void_reason         text,
  -- På originalet: den senaste ändringsfakturan.
  add column if not exists corrected_by        uuid references invoices(id) on delete restrict,
  -- På ändringsfakturan: originalet den rättar.
  add column if not exists corrects_invoice_id uuid references invoices(id) on delete restrict;

alter table invoices drop constraint if exists invoices_correction_link;
alter table invoices add constraint invoices_correction_link
  check ((kind = 'correction') = (corrects_invoice_id is not null));
create index if not exists invoices_corrects_idx on invoices (corrects_invoice_id) where corrects_invoice_id is not null;

-- =====================================================================
-- 2. Frystriggern och insert-vakten
-- =====================================================================

-- Som i 0014, plus: makulerad = helt låst; makulering och corrected_by bara
-- genom funktionerna nedan; en ändringsfaktura är aldrig ett utkast.
create or replace function public.invoices_freeze() returns trigger language plpgsql as $$
begin
  if old.status <> 'draft' then
    if old.status = 'void' then
      raise exception 'Faktura % är makulerad och kan inte ändras.', old.number using errcode = '0A000';
    end if;
    if new.document is distinct from old.document
       or new.number is distinct from old.number
       or new.series is distinct from old.series
       or new.kind is distinct from old.kind
       or new.customer_id is distinct from old.customer_id
       or new.credits_invoice_id is distinct from old.credits_invoice_id
       or new.corrects_invoice_id is distinct from old.corrects_invoice_id
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
      raise exception 'Faktura % är utfärdad och kan inte ändras. Rätta den med ändringsfaktura eller kreditfaktura.', old.number using errcode = '0A000';
    end if;
    if new.status = 'draft' then
      raise exception 'En utfärdad faktura kan inte bli utkast igen.' using errcode = '0A000';
    end if;
    if (new.status = 'void' or new.voided_at is not null or new.voided_by is not null or new.void_reason is not null)
       and coalesce(current_setting('binaafy.void_invoice', true), '') <> old.id::text then
      raise exception 'Faktura % makuleras bara med void_invoice().', old.number using errcode = '0A000';
    end if;
    if new.corrected_by is distinct from old.corrected_by
       and coalesce(current_setting('binaafy.correct_invoice', true), '') <> old.id::text then
      raise exception 'Faktura % rättas bara med issue_correction_invoice().', old.number using errcode = '0A000';
    end if;
  else
    if new.kind = 'correction' or new.corrects_invoice_id is not null then
      raise exception 'En ändringsfaktura utfärdas direkt och är aldrig ett utkast.' using errcode = '0A000';
    end if;
    if new.status = 'void' or new.voided_at is not null or new.corrected_by is not null then
      raise exception 'Ett utkast tas bort i stället för att makuleras eller rättas.' using errcode = '0A000';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.invoices_guard_insert() returns trigger language plpgsql as $$
begin
  if (new.kind = 'correction' or new.corrects_invoice_id is not null)
     and coalesce(current_setting('binaafy.correct_invoice', true), '') <> coalesce(new.corrects_invoice_id::text, '-') then
    raise exception 'En ändringsfaktura skapas bara med issue_correction_invoice().' using errcode = '0A000';
  end if;
  if new.status = 'void' or new.voided_at is not null or new.corrected_by is not null then
    raise exception 'En ny faktura kan inte vara makulerad eller rättad.' using errcode = '0A000';
  end if;
  return new;
end;
$$;
drop trigger if exists invoices_guard_insert on invoices;
create trigger invoices_guard_insert before insert on invoices
  for each row execute function invoices_guard_insert();

-- =====================================================================
-- 3. Makulera
-- =====================================================================

create or replace function public.void_invoice(
  p_invoice uuid,
  p_reason text,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv      public.invoices%rowtype;
  v_issue    public.journal_entries%rowtype;
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_date     date := (now() at time zone 'Europe/Stockholm')::date;
  v_year     int;
  v_no       int;
  v_entry_id uuid;
  v_credit   text;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_reason = '' then
    raise exception 'Ange varför fakturan makuleras.';
  end if;
  if length(v_reason) > 500 then
    raise exception 'Orsaken får vara högst 500 tecken.';
  end if;
  if v_inv.kind = 'credit' then
    raise exception 'Kreditfaktura % kan inte makuleras.', v_inv.number;
  end if;
  if v_inv.kind = 'correction' then
    raise exception 'Ändringsfaktura % kan inte makuleras.', v_inv.number;
  end if;
  if v_inv.status = 'draft' then
    raise exception 'Ett utkast tas bort i stället för att makuleras.';
  end if;
  if v_inv.status = 'void' then
    raise exception 'Faktura % är redan makulerad.', v_inv.number;
  end if;
  if v_inv.paid_ore <> 0 or exists (select 1 from public.payment_allocations where invoice_id = p_invoice) then
    raise exception 'Faktura % har registrerade betalningar och kan inte makuleras. Rätta den med kreditfaktura.', v_inv.number;
  end if;
  if exists (select 1 from public.rot_claim_items where invoice_id = p_invoice) then
    raise exception 'Faktura % finns i en ROT-begäran och kan inte makuleras.', v_inv.number;
  end if;
  select number into v_credit from public.invoices where credits_invoice_id = p_invoice order by created_at limit 1;
  if found then
    raise exception 'Faktura % har en kreditfaktura (%) och kan inte makuleras.', v_inv.number, coalesce(v_credit, 'utkast');
  end if;
  if v_inv.corrected_by is not null then
    raise exception 'Faktura % är rättad med en ändringsfaktura och kan inte makuleras.', v_inv.number;
  end if;
  if v_inv.reminders > 0 then
    raise exception 'Faktura % har påminnelser och kan inte makuleras.', v_inv.number;
  end if;
  if v_inv.status <> 'issued' or v_inv.sent_at is not null then
    raise exception 'Faktura % är skickad till kunden och kan inte makuleras. Rätta den med ändringsfaktura eller kreditfaktura.', v_inv.number;
  end if;

  -- Rättelsepost: utfärdandets verifikation med debet och kredit omvända.
  select * into v_issue from public.journal_entries
    where org_id = v_inv.org_id and source_type = 'invoice' and source_id = p_invoice
    order by created_at limit 1;
  if not found then
    raise exception 'Utfärdandets verifikation för faktura % saknas.', v_inv.number;
  end if;
  v_year := extract(year from v_date)::int;
  v_no := public.next_document_number(v_inv.org_id, 'V', v_year);
  insert into public.journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type, source_id, created_by)
    values (v_inv.org_id, 'V', v_year, v_no, v_date, 'Makulering av faktura ' || v_inv.number,
            'reversal', v_issue.id, p_actor->>'name')
    returning id into v_entry_id;
  insert into public.journal_lines (org_id, entry_id, account, debit_ore, credit_ore, project_id, customer_id, text)
    select org_id, v_entry_id, account, credit_ore, debit_ore, project_id, customer_id, text
      from public.journal_lines where entry_id = v_issue.id;

  perform set_config('binaafy.void_invoice', p_invoice::text, true);
  update public.invoices set
    status      = 'void',
    voided_at   = now(),
    voided_by   = coalesce(p_actor->>'name', 'system'),
    void_reason = v_reason
  where id = p_invoice;
  perform set_config('binaafy.void_invoice', '', true);

  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.voided',
            jsonb_build_object('number', v_inv.number, 'reason', v_reason, 'entry', v_year::text || '-' || v_no::text,
                               'reverses', v_issue.fiscal_year::text || '-' || v_issue.number::text),
            p_actor);

  return jsonb_build_object('number', v_inv.number, 'entryId', v_entry_id, 'entryNumber', v_year::text || '-' || v_no::text);
end;
$$;
revoke all on function public.void_invoice(uuid, text, jsonb) from public, anon;
grant execute on function public.void_invoice(uuid, text, jsonb) to authenticated, service_role;

-- =====================================================================
-- 4. Ändringsfaktura
-- =====================================================================

-- Det i ett fakturadokument som avgör beloppen och skatten. En ändringsfaktura
-- måste ha exakt detta lika med originalet; den får bara ändra namn,
-- adress, referenser, rubrik, text och radernas benämning.
create or replace function public.invoice_amount_basis(p_doc jsonb) returns jsonb
  language sql immutable set search_path = public
as $$
  select jsonb_build_object(
    'currency', p_doc->>'currency',
    'dueDate', p_doc->>'dueDate',
    'deliveryDate', p_doc->>'deliveryDate',
    'period', p_doc->'period',
    'buyerType', p_doc#>>'{buyer,type}',
    'buyerOrgNr', p_doc#>>'{buyer,orgNr}',
    'buyerVatNr', p_doc#>>'{buyer,vatNr}',
    'sellerOrgNr', p_doc#>>'{seller,orgNr}',
    'sellerVatNr', p_doc#>>'{seller,vatNr}',
    'reverseCharge', coalesce((p_doc#>>'{se,reverseCharge}')::boolean, false),
    'rot', p_doc#>'{se,rot}' is not null and jsonb_typeof(p_doc#>'{se,rot}') = 'object',
    'rotDeduction', p_doc#>>'{se,rot,deductionOre}',
    'rotBuyers', coalesce(jsonb_array_length(case when jsonb_typeof(p_doc#>'{se,rot,buyers}') = 'array' then p_doc#>'{se,rot,buyers}' end), 0),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_array(
               l->>'id', (l->>'quantity')::numeric, (l->>'unitPriceOre')::bigint, l->>'unit',
               l->>'vatCategory', (l->>'vatRate')::numeric, l->>'kind', l->>'changeOrderId') order by o)
        from jsonb_array_elements(p_doc->'lines') with ordinality as t(l, o)), '[]'::jsonb)
  )
$$;

create or replace function public.issue_correction_invoice(
  p_original uuid,
  p_document jsonb,
  p_changes text,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, extensions
as $$
declare
  v_orig    public.invoices%rowtype;
  v_base    jsonb;
  v_prev    text;
  v_series  public.number_series%rowtype;
  v_issue   date := coalesce((p_document->>'issueDate')::date, (now() at time zone 'Europe/Stockholm')::date);
  v_year    int;
  v_counter int;
  v_number  text;
  v_doc     jsonb;
  v_id      uuid;
begin
  select * into v_orig from public.invoices where id = p_original for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_orig.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_orig.kind = 'credit' then
    raise exception 'Kreditfaktura % rättas inte med ändringsfaktura.', v_orig.number;
  end if;
  if v_orig.kind = 'correction' then
    raise exception 'Rätta originalfakturan, inte ändringsfaktura %.', v_orig.number;
  end if;
  if v_orig.status = 'draft' then
    raise exception 'Ett utkast ändras direkt; det behöver ingen ändringsfaktura.';
  end if;
  if v_orig.status = 'void' then
    raise exception 'Faktura % är makulerad och kan inte rättas.', v_orig.number;
  end if;
  if v_orig.status = 'credited' then
    raise exception 'Faktura % är krediterad och kan inte rättas med ändringsfaktura.', v_orig.number;
  end if;
  if coalesce(btrim(p_document->>'correctionNote'), '') = '' then
    raise exception 'Ändringsfakturan saknar texten om vad som ändrats.';
  end if;
  if coalesce(btrim(p_changes), '') = '' then
    raise exception 'Inga uppgifter är ändrade.';
  end if;

  -- Rättelsen utgår från den senaste versionen: originalet eller dess senaste ändringsfaktura.
  if v_orig.corrected_by is not null then
    select document, number into v_base, v_prev from public.invoices where id = v_orig.corrected_by;
  else
    v_base := v_orig.document;
  end if;
  if public.invoice_amount_basis(p_document) is distinct from public.invoice_amount_basis(v_base) then
    raise exception 'En ändringsfaktura får inte ändra belopp, moms, ROT, villkor eller förfallodag. Använd Rätta belopp.';
  end if;

  select * into v_series from public.number_series where org_id = v_orig.org_id and series = v_orig.series;
  if not found then
    raise exception 'Nummerserien % finns inte.', v_orig.series;
  end if;
  v_year := case when v_series.per_year then extract(year from v_issue)::int else 0 end;
  v_counter := public.next_document_number(v_orig.org_id, v_orig.series, v_year);
  v_number := case when v_series.per_year
                   then v_year::text || '-' || lpad(v_counter::text, greatest(v_series.pad, length(v_counter::text)), '0')
                   else v_counter::text end;

  v_doc := p_document
    || jsonb_build_object('kind', 'correction', 'number', v_number, 'issueDate', v_issue::text, 'dueDate', v_orig.due_on::text);
  v_doc := jsonb_set(v_doc, '{references,precedingInvoiceNumber}', to_jsonb(v_orig.number));
  v_doc := jsonb_set(v_doc, '{paymentMeans,ocr}', coalesce(to_jsonb(v_orig.ocr), 'null'::jsonb));

  perform set_config('binaafy.correct_invoice', p_original::text, true);
  insert into public.invoices (
    org_id, series, number, kind, status, customer_id, quote_id, project_id, corrects_invoice_id, document, currency,
    total_ore, vat_ore, rot_ore, payable_ore, paid_ore, issued_on, due_on, delivered_on, ocr, sha256, created_by
  ) values (
    v_orig.org_id, v_orig.series, v_number, 'correction', 'issued', v_orig.customer_id, v_orig.quote_id, v_orig.project_id, p_original, v_doc, v_orig.currency,
    v_orig.total_ore, v_orig.vat_ore, v_orig.rot_ore, v_orig.payable_ore, 0, v_issue, v_orig.due_on, v_orig.delivered_on, v_orig.ocr,
    encode(digest(v_doc::text, 'sha256'), 'hex'), p_actor->>'name'
  ) returning id into v_id;
  update public.invoices set corrected_by = v_id where id = p_original;
  perform set_config('binaafy.correct_invoice', '', true);

  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor) values
    (v_orig.org_id, 'invoice', p_original, 'invoice.corrected',
     jsonb_build_object('number', v_orig.number, 'correctionNumber', v_number, 'correction', v_id, 'previous', v_prev, 'changes', p_changes), p_actor),
    (v_orig.org_id, 'invoice', v_id, 'invoice.corrected',
     jsonb_build_object('number', v_number, 'corrects', v_orig.number, 'original', p_original, 'previous', v_prev, 'changes', p_changes), p_actor);

  return jsonb_build_object('id', v_id, 'number', v_number);
end;
$$;
revoke all on function public.issue_correction_invoice(uuid, jsonb, text, jsonb) from public, anon;
grant execute on function public.issue_correction_invoice(uuid, jsonb, text, jsonb) to authenticated, service_role;

-- =====================================================================
-- 5. Betalningar hör till originalet
-- =====================================================================

-- Som i 0021, plus stoppet för ändringsfakturor.
create or replace function public.register_payment(
  p_invoice uuid,
  p_amount bigint,
  p_method text,
  p_paid_on date,
  p_reference text,
  p_note text,
  p_posting jsonb,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv        public.invoices%rowtype;
  v_orig       text;
  v_payment_id uuid;
  v_paid       bigint;
  v_status     text;
  v_entry_id   uuid;
  v_year       int;
  v_no         int;
  v_line       jsonb;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org_or_system(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_inv.kind = 'correction' then
    select number into v_orig from public.invoices where id = v_inv.corrects_invoice_id;
    raise exception 'Ändringsfaktura % tar inte emot betalningar. Registrera betalningen på faktura %.', v_inv.number, v_orig;
  end if;
  if v_inv.status not in ('issued','sent','partially_paid','paid') then
    raise exception 'Faktura % kan inte ta emot betalningar i status %.', v_inv.number, v_inv.status;
  end if;
  if p_amount = 0 then
    raise exception 'Beloppet kan inte vara noll.';
  end if;

  insert into public.payments (org_id, amount_ore, method, paid_on, reference, note, created_by)
    values (v_inv.org_id, p_amount, p_method, p_paid_on, coalesce(p_reference, ''), coalesce(p_note, ''), p_actor->>'name')
    returning id into v_payment_id;
  insert into public.payment_allocations (org_id, payment_id, invoice_id, amount_ore)
    values (v_inv.org_id, v_payment_id, p_invoice, p_amount);

  v_paid := v_inv.paid_ore + p_amount;
  v_status := case
    when v_paid >= v_inv.payable_ore then 'paid'
    when v_paid > 0 then 'partially_paid'
    else case when v_inv.status = 'paid' then 'issued' else v_inv.status end
  end;
  update public.invoices set
    paid_ore = v_paid,
    status   = v_status,
    paid_at  = case when v_status = 'paid' then coalesce(paid_at, now()) else null end
  where id = p_invoice;

  v_year := extract(year from p_paid_on)::int;
  v_no := public.next_document_number(v_inv.org_id, 'V', v_year);
  insert into public.journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type, source_id, created_by)
    values (v_inv.org_id, 'V', v_year, v_no, p_paid_on, coalesce(p_posting->>'text', 'Inbetalning'), 'payment', v_payment_id, p_actor->>'name')
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
    values (v_inv.org_id, 'payment', v_payment_id, 'payment.received',
            jsonb_build_object('invoice', p_invoice, 'number', v_inv.number, 'amount', p_amount, 'method', p_method, 'paidOn', p_paid_on),
            p_actor);
  if v_status in ('paid', 'partially_paid') and v_status <> v_inv.status then
    insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
      values (v_inv.org_id, 'invoice', p_invoice, 'invoice.' || v_status,
              jsonb_build_object('number', v_inv.number, 'paid', v_paid, 'payable', v_inv.payable_ore, 'amount', p_amount, 'method', p_method),
              p_actor);
  end if;

  return jsonb_build_object('paymentId', v_payment_id, 'paid', v_paid, 'status', v_status, 'entryNumber', v_year::text || '-' || v_no::text);
end;
$$;
revoke all on function public.register_payment(uuid, bigint, text, date, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.register_payment(uuid, bigint, text, date, text, text, jsonb, jsonb) to authenticated, service_role;
