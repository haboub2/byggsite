-- Prov för 0032 (Swish Handel). Körs i Supabase SQL-editor efter 0032. Allt
-- sker i en transaktion som rullas tillbaka: två provanvändare, två
-- provorganisationer, inget blir kvar. Ett fel avbryter med ett tydligt
-- meddelande; "Prov 0032: alla gick igenom" betyder att allt höll.
--
-- I PGlite och vanlig Postgres finns ingen Vault. Då skapas en ersättning
-- (vault.decrypted_secrets med en provhemlighet) i transaktionen.
--
--   A1  owner i organisation A, där faktura 1 och 2 utfärdas
--   B1  owner i organisation B, som inte ser A:s Swish-begäranden

begin;

do $$
begin
  if to_regclass('vault.decrypted_secrets') is null then
    create schema if not exists vault;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
  end if;
  insert into vault.decrypted_secrets (name, decrypted_secret) values ('swish_prov_0032', '{"cert":"prov","key":"prov","environment":"test"}');
end $$;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000032a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000032b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated, service_role;
create temp table utfall (k text primary key, v jsonb) on commit drop;
grant all on utfall to authenticated, service_role;

create function pg_temp.doc(p_name text) returns jsonb language sql as $$
  select jsonb_build_object(
    'schemaVersion', 1, 'kind', 'invoice', 'series', 'F', 'number', null, 'currency', 'SEK',
    'issueDate', '2026-10-25', 'dueDate', '2026-11-24', 'deliveryDate', null, 'period', null,
    'title', 'Provfaktura', 'note', '',
    'references', jsonb_build_object('quoteNumber', null, 'projectId', null, 'planStep', null, 'precedingInvoiceNumber', null, 'ourReference', ''),
    'seller', jsonb_build_object('name', 'Prov A AB', 'orgNr', '559000-0001', 'vatNr', 'SE559000000101', 'street', 'Gatan 1', 'postalCode', '11122', 'city', 'Stockholm', 'countryCode', 'SE', 'email', '', 'phone', '', 'fSkatt', true),
    'buyer', jsonb_build_object('name', p_name, 'type', 'privat', 'orgNr', '', 'vatNr', '', 'street', 'Vägen 2', 'postalCode', '12345', 'city', 'Täby', 'countryCode', 'SE', 'email', '', 'phone', '', 'customerId', null, 'reference', ''),
    'lines', jsonb_build_array(jsonb_build_object('id', 'l1', 'description', 'Arbete', 'quantity', 10, 'unit', 'tim', 'unitPriceOre', 10000, 'vatCategory', 'S', 'vatRate', 25, 'kind', 'labor', 'section', '', 'changeOrderId', null)),
    'paymentMeans', jsonb_build_object('bankgiro', '123-4567', 'plusgiro', '', 'iban', '', 'bic', '', 'swish', '1234679304', 'ocr', null, 'termsText', '30 dagar netto', 'termsDays', 30),
    'se', jsonb_build_object('reverseCharge', false, 'rot', null, 'lateInterestText', ''))
$$;
create function pg_temp.draft(p_key text) returns void language sql as $$
  with x as (
    insert into invoices (org_id, series, kind, document, total_ore, vat_ore, payable_ore, due_on)
    values ((select v from prov where k = 'a'), 'F', 'invoice', pg_temp.doc('Anna Andersson'), 125000, 25000, 125000, '2026-11-24')
    returning id)
  insert into prov select p_key, id from x
$$;
create function pg_temp.issue(p_key text) returns text language sql as $$
  select issue_invoice((select v from prov where k = p_key), pg_temp.doc('Anna Andersson'),
                       '{"total":125000,"vat":25000,"rot":0,"payable":125000}'::jsonb,
                       '{"text":"Faktura {number} Prov","lines":[{"account":"1510","debit":125000,"credit":0},{"account":"3001","debit":0,"credit":100000},{"account":"2611","debit":0,"credit":25000}]}'::jsonb,
                       '{"kind":"user","id":"a-agare@prov.se","name":"a-agare@prov.se"}'::jsonb)->>'number'
$$;
create function pg_temp.posting(p_amount bigint) returns jsonb language sql as $$
  select jsonb_build_object('text', 'Inbetalning Swish', 'lines', jsonb_build_array(
    jsonb_build_object('account', '1930', 'debit', p_amount, 'credit', 0),
    jsonb_build_object('account', '1510', 'debit', 0, 'credit', p_amount)))
$$;
-- En begäran som service role skapar den (startSwishPayment).
create function pg_temp.request(p_key text, p_invoice text, p_swish_id text, p_amount bigint) returns void language sql as $$
  with x as (
    insert into swish_payment_requests (org_id, invoice_id, swish_id, environment, flow, amount_ore, message, callback_identifier_hash, created_by)
    values ((select v from prov where k = 'a'), (select v from prov where k = p_invoice), p_swish_id, 'test', 'mcommerce', p_amount, '1000170',
            encode(sha256('8F0C2C86A4A44A55B1C3D2E1F0A9B8C7'::bytea), 'hex'), 'Fakturalänken')
    returning id)
  insert into prov select p_key, id from x
$$;
create function pg_temp.settle(p_swish_id text, p_status text, p_ref text, p_amount bigint, p_error text) returns jsonb language sql as $$
  select settle_swish_payment(p_swish_id, p_status, p_ref, p_amount, '4670*****67', p_error, '2026-10-25', pg_temp.posting(p_amount))
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000032b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000032a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', '5590000001'));

-- Faktura 1 och 2 utfärdade, 3 ett utkast. En webhook som tar emot allt.
select pg_temp.draft('i1'), pg_temp.draft('i2'), pg_temp.draft('i3');
do $$
begin
  if pg_temp.issue('i1') <> '1' or pg_temp.issue('i2') <> '2' then raise exception 'Utfärdandet gav fel nummer.'; end if;
end $$;
insert into webhook_endpoints (org_id, url) values ((select v from prov where k = 'a'), 'https://integrator.example/hook');

-- ------------------------------------------------------------ inloggade skriver inte

do $$
begin
  begin
    insert into swish_payment_requests (org_id, invoice_id, swish_id, environment, flow, amount_ore)
      values ((select v from prov where k = 'a'), (select v from prov where k = 'i1'), '00000000000000000000000000000001', 'test', 'mcommerce', 100);
    raise exception 'En inloggad owner kunde skapa en Swish-begäran direkt.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform settle_swish_payment('00000000000000000000000000000001', 'PAID', 'X', 100, '', '', current_date, '{}'::jsonb);
    raise exception 'En inloggad owner kunde kvittera en Swish-betalning.';
  exception when insufficient_privilege then null;
  end;
  begin
    perform swish_secret('swish_prov_0032');
    raise exception 'En inloggad owner kunde läsa Swish-certifikatet i Vault.';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ------------------------------------------------------------ service role (callback-routen)

set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

select pg_temp.request('r1', 'i1', 'A1000000000000000000000000000001', 125000);
select pg_temp.request('r2', 'i1', 'A1000000000000000000000000000002', 125000);
select pg_temp.request('r3', 'i1', 'A1000000000000000000000000000003', 125000);
select pg_temp.request('r4', 'i1', 'A1000000000000000000000000000004', 125000);
select pg_temp.request('r5', 'i3', 'A1000000000000000000000000000005', 125000);
select pg_temp.request('r6', 'i2', 'A1000000000000000000000000000006', 125000);

do $$
declare
  v_msg text;
begin
  -- Fel format på id, negativt belopp, omaskerat nummer: stoppas av tabellen.
  begin
    insert into swish_payment_requests (org_id, invoice_id, swish_id, environment, flow, amount_ore)
      values ((select v from prov where k = 'a'), (select v from prov where k = 'i1'), 'abc', 'test', 'mcommerce', 100);
    raise exception 'Ett ogiltigt instructionUUID sparades.';
  exception when check_violation then null;
  end;
  begin
    insert into swish_payment_requests (org_id, invoice_id, swish_id, environment, flow, amount_ore)
      values ((select v from prov where k = 'a'), (select v from prov where k = 'i1'), 'B1000000000000000000000000000001', 'test', 'mcommerce', 0);
    raise exception 'En begäran på 0 kr sparades.';
  exception when check_violation then null;
  end;
  begin
    insert into swish_payment_requests (org_id, invoice_id, swish_id, environment, flow, amount_ore, payer_alias)
      values ((select v from prov where k = 'a'), (select v from prov where k = 'i1'), 'B1000000000000000000000000000002', 'test', 'ecommerce', 100, '46701234567');
    raise exception 'Betalarens hela nummer sparades.';
  exception when check_violation then null;
  end;
  -- Samma instructionUUID två gånger.
  begin
    perform pg_temp.request('rx', 'i1', 'A1000000000000000000000000000001', 100);
    raise exception 'Samma instructionUUID sparades två gånger.';
  exception when unique_violation then null;
  end;
  -- Okänd status och okänd begäran.
  begin
    perform pg_temp.settle('A1000000000000000000000000000001', 'MAYBE', '', 1, '');
    raise exception 'Okänd status gick igenom.';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform pg_temp.settle('FFFF0000000000000000000000000000', 'PAID', 'R', 1, '');
    raise exception 'En okänd begäran kvitterades.';
  exception when no_data_found then null;
  end;
  -- PAID utan referens.
  begin
    perform pg_temp.settle('A1000000000000000000000000000001', 'PAID', '', 125000, '');
    raise exception 'PAID utan betalningsreferens gick igenom.';
  exception when invalid_parameter_value then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%betalningsreferens%' then raise exception 'Fel skäl: %', v_msg; end if;
  end;
end $$;

-- DECLINED och ERROR: begäran stängs, ingen betalning.
insert into utfall values ('declined', pg_temp.settle('A1000000000000000000000000000001', 'DECLINED', '', 125000, 'Betalaren avböjde.'));
insert into utfall values ('error', pg_temp.settle('A1000000000000000000000000000002', 'ERROR', '', 125000, 'RF07: Betalningen nekades.'));
-- En PAID som kommer efter DECLINED ändrar ingenting.
insert into utfall values ('declined_again', pg_temp.settle('A1000000000000000000000000000001', 'PAID', 'REF-SENT', 125000, ''));

do $$
declare
  v_r swish_payment_requests%rowtype;
begin
  if (select v->>'outcome' from utfall where k = 'declined') <> 'updated' then raise exception 'DECLINED gav %', (select v from utfall where k = 'declined'); end if;
  select * into v_r from swish_payment_requests where swish_id = 'A1000000000000000000000000000001';
  if v_r.status <> 'DECLINED' or v_r.error <> 'Betalaren avböjde.' or v_r.payment_id is not null or v_r.payer_alias <> '4670*****67' then
    raise exception 'DECLINED sparades fel: % % % %', v_r.status, v_r.error, v_r.payment_id, v_r.payer_alias;
  end if;
  select * into v_r from swish_payment_requests where swish_id = 'A1000000000000000000000000000002';
  if v_r.status <> 'ERROR' or v_r.error not like 'RF07%' then raise exception 'ERROR sparades fel: % %', v_r.status, v_r.error; end if;
  if (select v->>'outcome' from utfall where k = 'declined_again') <> 'duplicate' then raise exception 'PAID efter DECLINED ändrade begäran.'; end if;
  if (select status from swish_payment_requests where swish_id = 'A1000000000000000000000000000001') <> 'DECLINED' then raise exception 'Statusen ändrades efter DECLINED.'; end if;
  if exists (select 1 from payments where org_id = (select v from prov where k = 'a')) then raise exception 'DECLINED eller ERROR gav en betalning.'; end if;
  if (select status from invoices where id = (select v from prov where k = 'i1')) <> 'issued' then raise exception 'Fakturan ändrades utan betalning.'; end if;
end $$;

-- PAID: betalningen registreras som system, fakturan blir betald.
insert into utfall values ('paid', pg_temp.settle('A1000000000000000000000000000003', 'PAID', 'AF8A887568C14DCC9BFA2AB49D71680D', 125000, ''));
-- Samma callback en gång till, och en annan begäran med samma Swish-referens.
insert into utfall values ('paid_again', pg_temp.settle('A1000000000000000000000000000003', 'PAID', 'AF8A887568C14DCC9BFA2AB49D71680D', 125000, ''));
insert into utfall values ('same_reference', pg_temp.settle('A1000000000000000000000000000004', 'PAID', 'AF8A887568C14DCC9BFA2AB49D71680D', 125000, ''));

do $$
declare
  v_inv  invoices%rowtype;
  v_pay  payments%rowtype;
  v_r    swish_payment_requests%rowtype;
  v_n    int;
begin
  if (select v->>'outcome' from utfall where k = 'paid') <> 'paid' or (select v->>'invoiceStatus' from utfall where k = 'paid') <> 'paid' then
    raise exception 'PAID gav %', (select v from utfall where k = 'paid');
  end if;
  select count(*) into v_n from payments where org_id = (select v from prov where k = 'a');
  if v_n <> 1 then raise exception 'Väntade en betalning, fick %.', v_n; end if;
  select * into v_pay from payments where org_id = (select v from prov where k = 'a');
  if v_pay.method <> 'swish' or v_pay.source <> 'swish' or v_pay.reference <> 'AF8A887568C14DCC9BFA2AB49D71680D'
     or v_pay.amount_ore <> 125000 or v_pay.created_by <> 'Swish' or v_pay.paid_on <> '2026-10-25' then
    raise exception 'Betalningen sparades fel: % % % % % %', v_pay.method, v_pay.source, v_pay.reference, v_pay.amount_ore, v_pay.created_by, v_pay.paid_on;
  end if;
  select * into v_inv from invoices where id = (select v from prov where k = 'i1');
  if v_inv.status <> 'paid' or v_inv.paid_ore <> 125000 or v_inv.paid_at is null then raise exception 'Fakturan blev inte betald: % %', v_inv.status, v_inv.paid_ore; end if;
  select * into v_r from swish_payment_requests where swish_id = 'A1000000000000000000000000000003';
  if v_r.status <> 'PAID' or v_r.payment_id <> v_pay.id or v_r.payment_reference <> v_pay.reference or v_r.paid_at is null or v_r.error is not null then
    raise exception 'Begäran markerades fel: % % %', v_r.status, v_r.payment_id, v_r.error;
  end if;
  -- Händelser som system, verifikation, webhook.
  if not exists (select 1 from events where aggregate_id = v_inv.id and type = 'invoice.paid' and actor->>'kind' = 'system' and actor->>'name' = 'Swish') then
    raise exception 'Händelsen invoice.paid saknas eller har fel aktör.';
  end if;
  if not exists (select 1 from events where aggregate_id = v_pay.id and type = 'payment.received' and data->>'method' = 'swish') then
    raise exception 'Händelsen payment.received saknas.';
  end if;
  if not exists (select 1 from journal_entries where source_type = 'payment' and source_id = v_pay.id and created_by = 'Swish') then
    raise exception 'Verifikationen för betalningen saknas.';
  end if;
  select count(*) into v_n from webhook_deliveries d join events e on e.id = d.event_id
    where d.org_id = (select v from prov where k = 'a') and e.type in ('invoice.paid', 'payment.received') and e.actor->>'name' = 'Swish';
  if v_n <> 2 then raise exception 'Väntade två webhook-leveranser (invoice.paid, payment.received), fick %.', v_n; end if;

  -- Dubbletterna: ingen ny betalning, inget nytt saldo, inga nya händelser.
  if (select v->>'outcome' from utfall where k = 'paid_again') <> 'duplicate' then raise exception 'Samma callback två gånger gav %', (select v from utfall where k = 'paid_again'); end if;
  if (select v->>'outcome' from utfall where k = 'same_reference') <> 'duplicate' then raise exception 'Samma referens på en annan begäran gav %', (select v from utfall where k = 'same_reference'); end if;
  if (select count(*) from payments where org_id = (select v from prov where k = 'a')) <> 1 then raise exception 'En dubblett gav en till betalning.'; end if;
  if (select paid_ore from invoices where id = (select v from prov where k = 'i1')) <> 125000 then raise exception 'En dubblett ändrade saldot.'; end if;
  if (select count(*) from events where type = 'payment.received' and org_id = (select v from prov where k = 'a')) <> 1 then raise exception 'En dubblett gav en till händelse.'; end if;
  select * into v_r from swish_payment_requests where swish_id = 'A1000000000000000000000000000004';
  if v_r.status <> 'PAID' or v_r.payment_id <> v_pay.id then raise exception 'Begäran med samma referens pekar inte på samma betalning.'; end if;
end $$;

-- Även utan funktionen: databasen tar inte två Swish-betalningar med samma referens.
do $$
begin
  begin
    insert into payments (org_id, amount_ore, method, paid_on, reference, source)
      values ((select v from prov where k = 'a'), 1, 'swish', current_date, 'AF8A887568C14DCC9BFA2AB49D71680D', 'swish');
    raise exception 'Två Swish-betalningar med samma referens sparades.';
  exception when unique_violation then null;
  end;
end $$;

-- Betald hos Swish men fakturan tar inte emot betalningar (här ett utkast):
-- callbacken lyckas, felet sparas på begäran, ingen halv betalning blir kvar.
insert into utfall values ('unbooked', pg_temp.settle('A1000000000000000000000000000005', 'PAID', 'REF-UTKAST', 125000, ''));
-- Ett annat belopp än begäran: bokförs, med en anteckning.
insert into utfall values ('other_amount', pg_temp.settle('A1000000000000000000000000000006', 'PAID', 'REF-DELBETALT', 50000, ''));

do $$
declare
  v_r swish_payment_requests%rowtype;
begin
  if (select v->>'outcome' from utfall where k = 'unbooked') <> 'unbooked' then raise exception 'Utkastet gav %', (select v from utfall where k = 'unbooked'); end if;
  select * into v_r from swish_payment_requests where swish_id = 'A1000000000000000000000000000005';
  if v_r.status <> 'PAID' or v_r.payment_id is not null or v_r.payment_reference <> 'REF-UTKAST' or v_r.error not like 'Betald hos Swish men inte bokförd%' then
    raise exception 'Obokförd betalning sparades fel: % % %', v_r.status, v_r.payment_id, v_r.error;
  end if;
  if exists (select 1 from payments where reference = 'REF-UTKAST') then raise exception 'En halv betalning blev kvar.'; end if;

  select * into v_r from swish_payment_requests where swish_id = 'A1000000000000000000000000000006';
  if v_r.status <> 'PAID' or v_r.payment_id is null or v_r.error not like 'Swish betalade 50000 öre, begäran gällde 125000%' then
    raise exception 'Annat belopp sparades fel: % %', v_r.status, v_r.error;
  end if;
  if (select status from invoices where id = (select v from prov where k = 'i2')) <> 'partially_paid' then raise exception 'Faktura 2 blev inte delbetald.'; end if;

  -- Certifikatet i Vault: bara swish_-namn.
  if swish_secret('swish_prov_0032') not like '{"cert"%' then raise exception 'Vault-hemligheten lästes inte.'; end if;
  begin
    perform swish_secret('rot_pnr_key');
    raise exception 'swish_secret läste en annan hemlighet.';
  exception when invalid_parameter_value then null;
  end;
end $$;

-- ------------------------------------------------------------ läsning (RLS)

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000032a1","role":"authenticated","email":"a-agare@prov.se"}';
do $$
begin
  if (select count(*) from swish_payment_requests) <> 6 then raise exception 'A ser inte sina sex begäranden.'; end if;
  begin
    update swish_payment_requests set status = 'PAID' where swish_id = 'A1000000000000000000000000000001';
    raise exception 'A kunde ändra en begäran direkt.';
  exception when insufficient_privilege then null;
  end;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000032b1","role":"authenticated","email":"b-agare@prov.se"}';
do $$
begin
  if (select count(*) from swish_payment_requests) <> 0 then raise exception 'B ser A:s Swish-begäranden.'; end if;
end $$;

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
do $$
begin
  begin
    if (select count(*) from swish_payment_requests) <> 0 then raise exception 'Utloggad ser Swish-begäranden.'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;

do $$ begin raise notice 'Prov 0032: alla gick igenom'; end $$;

rollback;
