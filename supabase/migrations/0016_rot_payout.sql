-- Fas 2: ROT-begäran och Skatteverkets utbetalning.
-- Begäran skapas från applikationen (rot_claims + rot_claim_items). När
-- Skatteverket betalar ut registreras det här som en transaktion: beloppet
-- på begäran, status, verifikation 1930/1513 och händelser. Fakturans
-- paid_ore rörs inte: det är kundens betalning; ROT-delen är en egen fordran.

create or replace function public.register_rot_payout(
  p_claim uuid,
  p_amount bigint,
  p_paid_on date,
  p_posting jsonb,
  p_note text default '',
  p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_claim    public.rot_claims%rowtype;
  v_entry_id uuid;
  v_year     int;
  v_no       int;
  v_line     jsonb;
  v_item     record;
begin
  select * into v_claim from public.rot_claims where id = p_claim for update;
  if not found then
    raise exception 'Begäran finns inte.';
  end if;
  if not public.can_write_org(v_claim.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_claim.status not in ('sent') then
    raise exception 'Begäran är inte skickad (status %).', v_claim.status;
  end if;

  update public.rot_claims set status = 'paid', decided_on = p_paid_on, paid_ore = p_amount,
    note = case when coalesce(p_note, '') = '' then note else p_note end
  where id = p_claim;
  update public.rot_claim_items set status = 'paid' where claim_id = p_claim and status = 'pending';

  v_year := extract(year from p_paid_on)::int;
  v_no := public.next_document_number(v_claim.org_id, 'V', v_year);
  insert into public.journal_entries (org_id, series, fiscal_year, number, entry_date, text, source_type, source_id, created_by)
    values (v_claim.org_id, 'V', v_year, v_no, p_paid_on, coalesce(p_posting->>'text', 'Utbetalning ROT från Skatteverket'), 'payment', p_claim, p_actor->>'name')
    returning id into v_entry_id;
  for v_line in select * from jsonb_array_elements(p_posting->'lines') loop
    insert into public.journal_lines (org_id, entry_id, account, debit_ore, credit_ore, project_id, customer_id, text)
      values (v_claim.org_id, v_entry_id, v_line->>'account',
              coalesce((v_line->>'debit')::bigint, 0), coalesce((v_line->>'credit')::bigint, 0),
              nullif(v_line->'dimensions'->>'projectId', '')::uuid,
              nullif(v_line->'dimensions'->>'customerId', '')::uuid,
              v_line->>'text');
  end loop;

  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_claim.org_id, 'rot_claim', p_claim, 'rot_claim.paid',
            jsonb_build_object('amount', p_amount, 'paidOn', p_paid_on, 'entry', v_year::text || '-' || v_no::text), p_actor);
  for v_item in select invoice_id, amount_ore from public.rot_claim_items where claim_id = p_claim loop
    insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
      values (v_claim.org_id, 'invoice', v_item.invoice_id, 'rot_claim.paid',
              jsonb_build_object('claim', p_claim, 'amount', v_item.amount_ore, 'paidOn', p_paid_on), p_actor);
  end loop;

  return jsonb_build_object('entryNumber', v_year::text || '-' || v_no::text);
end;
$$;
revoke all on function public.register_rot_payout(uuid, bigint, date, jsonb, text, jsonb) from public;
grant execute on function public.register_rot_payout(uuid, bigint, date, jsonb, text, jsonb) to authenticated;

-- Avvisad begäran: fakturorna flaggas, kunden ska betala resten.
create or replace function public.reject_rot_claim(p_claim uuid, p_note text, p_actor jsonb default '{"kind":"system","name":"system"}'::jsonb)
returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_claim public.rot_claims%rowtype;
  v_item  record;
begin
  select * into v_claim from public.rot_claims where id = p_claim for update;
  if not found then
    raise exception 'Begäran finns inte.';
  end if;
  if not public.can_write_org(v_claim.org_id) then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  update public.rot_claims set status = 'rejected', decided_on = current_date, note = coalesce(p_note, '') where id = p_claim;
  update public.rot_claim_items set status = 'rejected', decision_note = coalesce(p_note, '') where claim_id = p_claim;
  insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
    values (v_claim.org_id, 'rot_claim', p_claim, 'rot_claim.rejected', jsonb_build_object('note', coalesce(p_note, '')), p_actor);
  for v_item in select invoice_id, amount_ore from public.rot_claim_items where claim_id = p_claim loop
    insert into public.events (org_id, aggregate_type, aggregate_id, type, data, actor)
      values (v_claim.org_id, 'invoice', v_item.invoice_id, 'rot_claim.rejected', jsonb_build_object('claim', p_claim, 'amount', v_item.amount_ore, 'note', coalesce(p_note, '')), p_actor);
  end loop;
end;
$$;
revoke all on function public.reject_rot_claim(uuid, text, jsonb) from public;
grant execute on function public.reject_rot_claim(uuid, text, jsonb) to authenticated;

-- Vilken kategori hos Skatteverket fakturans arbete hör till (Bygg som standard).
alter table rot_buyers add column if not exists category text not null default 'Bygg';
