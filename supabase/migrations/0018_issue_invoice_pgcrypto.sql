-- Rättelse: på Supabase ligger pgcrypto i schemat "extensions", och
-- issue_invoice() kör med search_path låst till public, så digest() hittades
-- inte: "function digest(text, unknown) does not exist". search_path får nu
-- även extensions (ett schema som inte finns ignoreras, så lokal Postgres med
-- pgcrypto i public fungerar oförändrat). Funktionen är i övrigt den från
-- 0014.

create or replace function public.issue_invoice(
  p_invoice uuid,
  p_document jsonb,
  p_totals jsonb,
  p_posting jsonb,
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public, extensions
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
  if not public.can_write_org_or_system(v_inv.org_id) then
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
grant execute on function public.issue_invoice(uuid, jsonb, jsonb, jsonb, jsonb) to authenticated, service_role;
