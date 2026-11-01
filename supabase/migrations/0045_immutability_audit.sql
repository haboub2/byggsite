-- Juridisk granskning 2026-10-31 (docs/juridisk-granskning-2026-10-31.md):
-- Fakturor H3 och Tid H1.
--
-- 1. Betalningar, fördelningar, påminnelser och inkassoärenden ändras och tas
--    inte bort (bokföringslagen 5 kap., BFNAR 2013:2 punkt 2.17–2.18). Varje
--    rad i payments skapas av register_payment eller issue_replacement_invoice
--    tillsammans med sin verifikation, och varje rad i reminders är skickad
--    när den skrivs (sent_at), så hela tabellerna fryses:
--      payments            tas aldrig bort; en felaktig betalning vänds med en
--                          återbetalning (register_payment med negativt belopp,
--                          som 0028 redan gör för kvittning och återbetalning).
--                          Bara kopplingarna får sättas, och bara av
--                          funktionerna: bank_transaction_id av
--                          mark_bank_transaction(), source av
--                          settle_swish_payment() (transaktionslokal
--                          inställning binaafy.payment_link med betalningens id).
--      payment_allocations forbid_change() som verifikationerna.
--      reminders           forbid_change(); inkassokrav och påminnelser står kvar.
--      collection_cases    fordran, fakturan och referensen ändras aldrig; status,
--                          bolag, ärendenummer, anteckning, sent_at och closed_at
--                          bara av update_collection_case() och av
--                          invoices_collection (betald/krediterad), via
--                          binaafy.collection_case med ärendets id. Ett ärende tas
--                          inte bort och ett avslutat ändras inte.
--    Personalens skrivpolicies (for all, 0014) på payments, payment_allocations
--    och reminders tas bort: applikationen skriver dem bara genom funktionerna
--    (lib/core/invoices/store.ts, lib/core/reminders/store.ts,
--    lib/core/collections/store.ts, lib/core/payments/*). Läsning är oförändrad.
--
-- 2. Ändringar av inskickad tid spåras (ATL 11 §, bokföringslagen 7 kap., GDPR
--    art. 5(2)):
--      time_entries.updated_by  vem som senast ändrade raden (auth.uid()); null
--                               på en rad personen själv har skapat och ingen
--                               annan rört.
--      time_entries_audit       after update or delete: när raden var inskickad,
--                               eller när någon annan än personen själv ändrar
--                               den, skrivs time.updated / time.removed på
--                               personen (aggregate employee, actor som
--                               hr_actor()) med gamla och nya värden för dag,
--                               tider, rast, timmar, sort, projekt, anteckning
--                               och status, radens id och skälet. Flödets egna
--                               övergångar (skicka in, godkänna, återskicka,
--                               låsa) har sina egna händelser och loggas inte en
--                               gång till.
--      time_update, time_remove ändrar och tar bort en rad; en lönegodkännare
--                               som ändrar eller tar bort någon annans
--                               inskickade rad måste ange ett skäl, som hamnar i
--                               händelsen (binaafy.time_note). Personens egna
--                               ändringar är som förut (0038: en inskickad rad
--                               personen ändrar blir utkast igen).
--      RLS                      en lönegodkännare ändrar och tar bort andras
--                               rader direkt bara när de är utkast; inskickade
--                               rader går genom funktionerna. Personen själv är
--                               oförändrad (egna utkast och inskickade rader).
--
-- Allt kan köras om (if not exists, drop ... if exists, create or replace).

-- =====================================================================
-- 1. Betalningar
-- =====================================================================

create or replace function public.payments_freeze() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'En betalning tas inte bort (bokföringslagen 5 kap.). Registrera en återbetalning med negativt belopp i stället.'
      using errcode = '0A000';
  end if;
  if (new.bank_transaction_id is distinct from old.bank_transaction_id or new.source is distinct from old.source)
     and coalesce(current_setting('binaafy.payment_link', true), '') <> old.id::text then
    raise exception 'Betalningen kopplas till banktransaktion och källa bara med mark_bank_transaction() och settle_swish_payment().'
      using errcode = '0A000';
  end if;
  if (to_jsonb(new) - 'bank_transaction_id' - 'source') is distinct from (to_jsonb(old) - 'bank_transaction_id' - 'source') then
    raise exception 'Betalningen är bokförd och kan inte ändras. Registrera en återbetalning med negativt belopp i stället.'
      using errcode = '0A000';
  end if;
  return new;
end;
$$;
revoke all on function public.payments_freeze() from public, anon, authenticated, service_role;
drop trigger if exists payments_freeze on payments;
create trigger payments_freeze before update or delete on payments
  for each row execute function payments_freeze();

drop trigger if exists payment_allocations_immutable on payment_allocations;
create trigger payment_allocations_immutable before update or delete on payment_allocations
  for each row execute function forbid_change();

-- Som i 0017, plus flaggan som släpper igenom kopplingen.
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
    if not exists (select 1 from public.payments where id = p_payment and org_id = v_tx.org_id) then
      raise exception 'Betalningen finns inte i organisationen.';
    end if;
    perform set_config('binaafy.payment_link', p_payment::text, true);
    update public.payments set bank_transaction_id = p_tx where id = p_payment;
    perform set_config('binaafy.payment_link', '', true);
  end if;
end;
$$;
revoke all on function public.mark_bank_transaction(uuid, text, uuid) from public, anon;
grant execute on function public.mark_bank_transaction(uuid, text, uuid) to authenticated, service_role;

-- Som i 0032, plus flaggan som släpper igenom source = 'swish'.
create or replace function public.settle_swish_payment(
  p_swish_id text,
  p_status text,
  p_payment_reference text,
  p_amount bigint,
  p_payer_masked text,
  p_error text,
  p_paid_on date,
  p_posting jsonb
) returns jsonb
  language plpgsql security definer set search_path = public
as $$
declare
  v_req     public.swish_payment_requests%rowtype;
  v_result  jsonb;
  v_payment uuid;
  v_status  text := upper(coalesce(p_status, ''));
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'Saknar behörighet.' using errcode = '42501';
  end if;
  if v_status not in ('PAID','DECLINED','ERROR','CANCELLED') then
    raise exception 'Okänd Swish-status %.', p_status using errcode = '22023';
  end if;

  select * into v_req from public.swish_payment_requests where swish_id = p_swish_id for update;
  if not found then
    raise exception 'Swish-begäran % finns inte.', p_swish_id using errcode = 'P0002';
  end if;

  -- Redan avgjord: samma svar igen, inget nytt händer.
  if v_req.status <> 'CREATED' then
    return jsonb_build_object('outcome', 'duplicate', 'status', v_req.status, 'paymentId', v_req.payment_id);
  end if;

  if v_status <> 'PAID' then
    update public.swish_payment_requests set
      status      = v_status,
      error       = nullif(p_error, ''),
      payer_alias = coalesce(nullif(p_payer_masked, ''), payer_alias),
      updated_at  = now()
    where id = v_req.id;
    return jsonb_build_object('outcome', 'updated', 'status', v_status, 'paymentId', null);
  end if;

  if coalesce(p_payment_reference, '') = '' then
    raise exception 'En betald Swish-begäran saknar betalningsreferens.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Beloppet från Swish är ogiltigt.' using errcode = '22023';
  end if;

  -- Samma referens redan bokförd (t.ex. två begäranden som fick samma
  -- callback): ingen ny betalning.
  select id into v_payment from public.payments
    where org_id = v_req.org_id and source = 'swish' and reference = p_payment_reference;
  if v_payment is null then
    begin
      v_result := public.register_payment(
        v_req.invoice_id, p_amount, 'swish', coalesce(p_paid_on, current_date),
        p_payment_reference, 'Swish Handel ' || v_req.swish_id, p_posting,
        '{"kind":"system","name":"Swish"}'::jsonb);
      v_payment := (v_result->>'paymentId')::uuid;
      perform set_config('binaafy.payment_link', v_payment::text, true);
      update public.payments set source = 'swish' where id = v_payment;
      perform set_config('binaafy.payment_link', '', true);
    exception when others then
      -- Pengarna är betalda hos Swish men kunde inte bokas på fakturan.
      update public.swish_payment_requests set
        status            = 'PAID',
        payment_reference = p_payment_reference,
        payer_alias       = coalesce(nullif(p_payer_masked, ''), payer_alias),
        error             = 'Betald hos Swish men inte bokförd: ' || sqlerrm,
        paid_at           = now(),
        updated_at        = now()
      where id = v_req.id;
      return jsonb_build_object('outcome', 'unbooked', 'status', 'PAID', 'paymentId', null, 'error', sqlerrm);
    end;
  end if;

  update public.swish_payment_requests set
    status            = 'PAID',
    payment_reference = p_payment_reference,
    payer_alias       = coalesce(nullif(p_payer_masked, ''), payer_alias),
    payment_id        = v_payment,
    error             = case when p_amount <> v_req.amount_ore
                             then 'Swish betalade ' || p_amount || ' öre, begäran gällde ' || v_req.amount_ore || ' öre.'
                             else null end,
    paid_at           = now(),
    updated_at        = now()
  where id = v_req.id;
  return jsonb_build_object('outcome', case when v_result is null then 'duplicate' else 'paid' end,
                            'status', 'PAID', 'paymentId', v_payment,
                            'invoiceStatus', v_result->>'status');
end;
$$;
revoke all on function public.settle_swish_payment(text, text, text, bigint, text, text, date, jsonb) from public, anon, authenticated;
grant execute on function public.settle_swish_payment(text, text, text, bigint, text, text, date, jsonb) to service_role;

-- =====================================================================
-- 2. Påminnelser
-- =====================================================================

drop trigger if exists reminders_immutable on reminders;
create trigger reminders_immutable before update or delete on reminders
  for each row execute function forbid_change();

-- =====================================================================
-- 3. Inkassoärenden
-- =====================================================================

create or replace function public.collection_cases_freeze() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Inkassoärende % tas inte bort; avsluta det med update_collection_case().', old.reference using errcode = '0A000';
  end if;
  if new.org_id <> old.org_id or new.invoice_id <> old.invoice_id or new.reference <> old.reference
     or new.capital_ore <> old.capital_ore or new.interest_ore <> old.interest_ore or new.fees_ore <> old.fees_ore
     or new.interest_to <> old.interest_to or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'Inkassoärende %: fordran, faktura och referens ändras inte; öppna ett nytt ärende.', old.reference using errcode = '0A000';
  end if;
  if old.status in ('paid','closed') then
    raise exception 'Inkassoärende % är avslutat och kan inte ändras.', old.reference using errcode = '0A000';
  end if;
  if coalesce(current_setting('binaafy.collection_case', true), '') <> old.id::text then
    raise exception 'Inkassoärende % ändras bara med inkassofunktionerna.', old.reference using errcode = '0A000';
  end if;
  return new;
end;
$$;
revoke all on function public.collection_cases_freeze() from public, anon, authenticated, service_role;
-- Namnet sorterar före collection_cases_set_updated_at.
drop trigger if exists collection_cases_freeze on collection_cases;
create trigger collection_cases_freeze before update or delete on collection_cases
  for each row execute function collection_cases_freeze();

-- Som i 0031, plus flaggan runt ärendets uppdatering.
create or replace function public.invoices_collection() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_case   public.collection_cases%rowtype;
  v_status text;
  v_closed boolean;
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
    perform set_config('binaafy.collection_case', old.collection_case_id::text, true);
    update public.collection_cases
       set status = v_status, closed_at = now(),
           note = case when note = '' then '' else note || E'\n' end
                  || case new.status when 'paid' then 'Fakturan betald.' else 'Fakturan krediterad.' end
     where id = old.collection_case_id and status in ('prepared','sent')
     returning * into v_case;
    -- perform sätter found; spara svaret från update först.
    v_closed := found;
    perform set_config('binaafy.collection_case', '', true);
    if v_closed then
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

-- Som i 0031, plus flaggan runt ärendets uppdateringar.
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

  perform set_config('binaafy.collection_case', p_case::text, true);
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
  perform set_config('binaafy.collection_case', '', true);

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

-- =====================================================================
-- 4. Inga direkta skrivningar från personalen
-- =====================================================================

-- Funktionerna (security definer) är de enda som skriver; medlemmarna läser
-- som förut (payments_member_select, payment_allocations_member_select,
-- reminders_member_select).
drop policy if exists "payments_staff_write" on payments;
drop policy if exists "payment_allocations_staff_write" on payment_allocations;
drop policy if exists "reminders_staff_write" on reminders;
revoke insert, update, delete on payments, payment_allocations, reminders from anon, authenticated;

-- =====================================================================
-- 5. Tid: updated_by
-- =====================================================================

alter table time_entries add column if not exists updated_by uuid;
comment on column time_entries.updated_by is 'Vem som senast ändrade raden (auth.uid()). Null på en rad personen själv har skapat och ingen annan har rört.';

-- Efter time_entries_guard (namnen sorterar så), som jämför gamla och nya
-- raden vid låsningen.
create or replace function public.time_entries_set_updated_by() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.updated_by := case when auth.uid() is not null and not public.is_self(new.employee_id) then auth.uid() end;
  else
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;
revoke all on function public.time_entries_set_updated_by() from public, anon, authenticated, service_role;
drop trigger if exists time_entries_set_updated_by on time_entries;
create trigger time_entries_set_updated_by before insert or update on time_entries
  for each row execute function time_entries_set_updated_by();

-- =====================================================================
-- 6. Tid: händelsen
-- =====================================================================

-- Det en ändring av inskickad tid bedöms på, som händelsen skriver det.
create or replace function public.time_entry_audit_values(t public.time_entries) returns jsonb
  language sql immutable
as $$
  select jsonb_build_object(
    'date', t.work_date, 'start', left(t.start_time::text, 5), 'end', left(t.end_time::text, 5),
    'breakMinutes', t.break_minutes, 'hours', t.hours, 'kind', t.kind, 'projectId', t.project_id,
    'note', t.note, 'status', t.status)
$$;
revoke all on function public.time_entry_audit_values(public.time_entries) from public, anon, authenticated, service_role;

-- time.updated när raden var inskickad eller någon annan än personen ändrar
-- den och något i underlaget (eller inskickad → utkast) ändras; time.removed
-- på samma villkor vid borttagning. Skälet kommer från time_update/time_remove
-- (binaafy.time_note). time_return sätter binaafy.time_workflow så att
-- återskickningen bara loggas som time.returned.
create or replace function public.time_entries_audit() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_self boolean;
  v_note text := left(btrim(coalesce(current_setting('binaafy.time_note', true), '')), 200);
begin
  v_self := auth.uid() is not null and public.is_self(old.employee_id);
  if tg_op = 'DELETE' then
    if old.status = 'submitted' or not v_self then
      perform public.hr_log(old.org_id, old.employee_id, 'time.removed',
        jsonb_build_object('entryId', old.id, 'date', old.work_date, 'old', public.time_entry_audit_values(old),
                           'note', v_note, 'byEmployee', v_self));
    end if;
    return null;
  end if;
  if (old.status = 'submitted' or not v_self)
     and coalesce(current_setting('binaafy.time_workflow', true), '') <> old.id::text
     and ((public.time_entry_audit_values(new) - 'status') is distinct from (public.time_entry_audit_values(old) - 'status')
          or (old.status = 'submitted' and new.status = 'draft')) then
    perform public.hr_log(new.org_id, new.employee_id, 'time.updated',
      jsonb_build_object('entryId', new.id, 'date', new.work_date, 'old', public.time_entry_audit_values(old),
                         'new', public.time_entry_audit_values(new), 'note', v_note, 'byEmployee', v_self));
  end if;
  return null;
end;
$$;
revoke all on function public.time_entries_audit() from public, anon, authenticated, service_role;
drop trigger if exists time_entries_audit on time_entries;
create trigger time_entries_audit after update or delete on time_entries
  for each row execute function time_entries_audit();

-- Som i 0037, plus flaggan: återskickningen har sin egen händelse.
create or replace function public.time_return(p_entries uuid[], p_note text default '') returns int
  language plpgsql security definer set search_path = public
as $$
declare
  t public.time_entries%rowtype;
  v_ids uuid[] := '{}';
begin
  for t in select * from public.time_entries where id = any(p_entries) and status = 'submitted' for update loop
    if not public.time_entry_approvable(t) then
      raise exception 'Du får inte hantera tiden för %.', t.work_date using errcode = '42501';
    end if;
    perform set_config('binaafy.time_workflow', t.id::text, true);
    update public.time_entries set status = 'draft',
           note = left(case when coalesce(p_note, '') = '' then note else btrim(note || ' · Återskickad: ' || p_note) end, 500)
     where id = t.id;
    perform set_config('binaafy.time_workflow', '', true);
    v_ids := v_ids || t.id;
  end loop;
  if cardinality(v_ids) > 0 then
    perform public.time_log_batch(v_ids, 'time.returned', jsonb_build_object('note', left(coalesce(p_note, ''), 200)));
  end if;
  return cardinality(v_ids);
end;
$$;
revoke all on function public.time_return(uuid[], text) from public, anon;
grant execute on function public.time_return(uuid[], text) to authenticated;

-- =====================================================================
-- 7. Tid: ändra och ta bort med skäl
-- =====================================================================

-- Ändrar ett utkast eller en inskickad rad (personen själv eller en
-- lönegodkännare). Någon annan än personen som ändrar en inskickad rad anger
-- varför; skälet hamnar i time.updated. Guarden (0038) gäller som förut: en
-- inskickad rad personen ändrar blir utkast, en lönegodkännare ändrar förblir
-- inskickad. p_row: {"date","start","end","breakMinutes","hours","kind","projectId","note"};
-- fält som saknas lämnas orörda.
create or replace function public.time_update(p_entry uuid, p_row jsonb, p_note text default '') returns void
  language plpgsql security definer set search_path = public
as $$
declare
  t public.time_entries%rowtype;
  v_note text := left(btrim(coalesce(p_note, '')), 200);
begin
  select * into t from public.time_entries where id = p_entry for update;
  if not found or not (public.is_self(t.employee_id) or public.can_payroll_approve(t.org_id)) then
    raise exception 'Raden finns inte eller är inte din.' using errcode = '42501';
  end if;
  if t.status in ('approved','locked') then
    raise exception 'En godkänd tidrad ändras inte; gör en rättelse.' using errcode = '0A000';
  end if;
  if t.status = 'submitted' and not public.is_self(t.employee_id) and v_note = '' then
    raise exception 'Ange varför den inskickade raden ändras.' using errcode = '22023';
  end if;
  perform set_config('binaafy.time_note', v_note, true);
  update public.time_entries set
    work_date     = coalesce((p_row->>'date')::date, work_date),
    start_time    = case when p_row ? 'start' then nullif(p_row->>'start', '')::time else start_time end,
    end_time      = case when p_row ? 'end' then nullif(p_row->>'end', '')::time else end_time end,
    break_minutes = coalesce((p_row->>'breakMinutes')::int, break_minutes),
    hours         = coalesce((p_row->>'hours')::numeric, hours),
    kind          = coalesce(p_row->>'kind', kind),
    project_id    = case when p_row ? 'projectId' then nullif(p_row->>'projectId', '')::uuid else project_id end,
    note          = coalesce(left(p_row->>'note', 500), note)
  where id = p_entry;
  perform set_config('binaafy.time_note', '', true);
end;
$$;
revoke all on function public.time_update(uuid, jsonb, text) from public, anon;
grant execute on function public.time_update(uuid, jsonb, text) to authenticated;

-- Tar bort ett utkast (personen själv eller en lönegodkännare) eller en
-- inskickad rad (bara en lönegodkännare, med skäl om det inte är den egna).
create or replace function public.time_remove(p_entry uuid, p_note text default '') returns void
  language plpgsql security definer set search_path = public
as $$
declare
  t public.time_entries%rowtype;
  v_note text := left(btrim(coalesce(p_note, '')), 200);
begin
  select * into t from public.time_entries where id = p_entry for update;
  if not found or not (public.is_self(t.employee_id) or public.can_payroll_approve(t.org_id)) then
    raise exception 'Raden finns inte eller är inte din.' using errcode = '42501';
  end if;
  if t.status in ('approved','locked') then
    raise exception 'En godkänd tidrad tas inte bort; gör en rättelse.' using errcode = '0A000';
  end if;
  if t.status = 'submitted' then
    if not public.can_payroll_approve(t.org_id) then
      raise exception 'Raden är inskickad; be den som godkänner att skicka tillbaka den.' using errcode = '0A000';
    end if;
    if not public.is_self(t.employee_id) and v_note = '' then
      raise exception 'Ange varför den inskickade raden tas bort.' using errcode = '22023';
    end if;
  end if;
  perform set_config('binaafy.time_note', v_note, true);
  delete from public.time_entries where id = p_entry;
  perform set_config('binaafy.time_note', '', true);
end;
$$;
revoke all on function public.time_remove(uuid, text) from public, anon;
grant execute on function public.time_remove(uuid, text) to authenticated;

-- =====================================================================
-- 8. Tid: RLS
-- =====================================================================

-- Personen själv som förut; en lönegodkännare direkt bara på utkast, inskickade
-- rader genom time_update/time_remove (och flödets funktioner).
drop policy if exists "time_entries_update" on time_entries;
create policy "time_entries_update" on time_entries
  for update to authenticated
  using ((public.is_self(employee_id) and status in ('draft','submitted')) or (public.can_payroll_approve(org_id) and status = 'draft'))
  with check ((public.is_self(employee_id) and status in ('draft','submitted')) or (public.can_payroll_approve(org_id) and status = 'draft'));
drop policy if exists "time_entries_delete" on time_entries;
create policy "time_entries_delete" on time_entries
  for delete to authenticated
  using (status = 'draft' and (public.is_self(employee_id) or public.can_payroll_approve(org_id)));
