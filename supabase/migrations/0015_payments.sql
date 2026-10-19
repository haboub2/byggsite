-- Fas 1: registrera en inbetalning och markera skickad, som transaktioner.
-- Konteringen räknas i lib/core/ledger/posting.ts och skickas in som
-- p_posting; här sker allt eller inget: betalning, koppling, fakturans
-- saldo och status, verifikation, händelser.

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
  if not public.can_write_org(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
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
revoke all on function public.register_payment(uuid, bigint, text, date, text, text, jsonb, jsonb) from public;
grant execute on function public.register_payment(uuid, bigint, text, date, text, text, jsonb, jsonb) to authenticated;

-- Skickad: status och tidpunkt plus händelse, i ett anrop.
create or replace function public.mark_invoice_sent(p_invoice uuid, p_to text, p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb)
returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.invoices%rowtype;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  if not found then
    raise exception 'Fakturan finns inte.';
  end if;
  if not public.can_write_org(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_inv.status = 'draft' then
    raise exception 'Utfärda fakturan innan den skickas.';
  end if;
  update public.invoices set
    sent_at = coalesce(sent_at, now()),
    status  = case when status = 'issued' then 'sent' else status end
  where id = p_invoice;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.sent', jsonb_build_object('number', v_inv.number, 'to', p_to), p_actor);
end;
$$;
revoke all on function public.mark_invoice_sent(uuid, text, jsonb) from public;
grant execute on function public.mark_invoice_sent(uuid, text, jsonb) to authenticated;

-- Krediterad: originalet markeras när kreditfakturan utfärdats och täcker det.
create or replace function public.mark_invoice_credited(p_invoice uuid, p_credit uuid, p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb)
returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_inv    public.invoices%rowtype;
  v_credit public.invoices%rowtype;
begin
  select * into v_inv from public.invoices where id = p_invoice for update;
  select * into v_credit from public.invoices where id = p_credit;
  if v_inv.id is null or v_credit.id is null then
    raise exception 'Fakturan eller kreditfakturan finns inte.';
  end if;
  if not public.can_write_org(v_inv.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_credit.status = 'draft' or v_credit.credits_invoice_id <> p_invoice then
    raise exception 'Kreditfakturan är inte utfärdad mot den här fakturan.';
  end if;
  if -v_credit.payable_ore >= v_inv.payable_ore - v_inv.paid_ore then
    update public.invoices set status = 'credited' where id = p_invoice;
  end if;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_inv.org_id, 'invoice', p_invoice, 'invoice.credited',
            jsonb_build_object('number', v_inv.number, 'creditNumber', v_credit.number, 'amount', -v_credit.payable_ore), p_actor);
end;
$$;
revoke all on function public.mark_invoice_credited(uuid, uuid, jsonb) from public;
grant execute on function public.mark_invoice_credited(uuid, uuid, jsonb) to authenticated;
