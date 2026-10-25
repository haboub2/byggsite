-- Prov för 0028 (kvittning när en betald faktura rättas med Rätta belopp).
-- Körs i Supabase SQL-editor efter 0028, eller i PGlite. Allt sker i en
-- transaktion som rullas tillbaka: två provanvändare, två provorganisationer,
-- inget blir kvar. Ett fel avbryter med ett tydligt meddelande; "Prov 0028:
-- alla gick igenom" betyder att allt höll.
--
--   A1  owner i organisation A, där fakturorna utfärdas
--   B1  owner i organisation B, som inte får röra A:s fakturor
--
-- Fall 1: faktura 1 (1 250 kr) betalas helt, krediteras med 2 och ersätts av
--         3 på 1 000 kr. 3 blir betald med 250 kr att återbetala, som
--         registreras som en negativ betalning.
-- Fall 2: faktura 4 (1 250 kr) delbetalas med 500 kr, krediteras med 5 och
--         ersätts av 6 på 1 500 kr. 6 är delbetald med 1 000 kr kvar, som
--         betalas på dess OCR. Betalplanens steg flyttas från 4 till 6.
-- Fall 3: faktura 7 obetald, krediteras med 8 och ersätts av 9 utan kvittning.

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000028a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000028b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

-- Ett fakturadokument: en rad, p_qty tim à 100 kr + 25 % moms.
create function pg_temp.doc(p_kind text, p_qty numeric, p_preceding text) returns jsonb language sql as $$
  select jsonb_build_object(
    'schemaVersion', 1, 'kind', p_kind, 'series', 'F', 'number', null, 'currency', 'SEK',
    'issueDate', '2026-10-25', 'dueDate', '2026-11-24', 'deliveryDate', null, 'period', null,
    'title', 'Provfaktura', 'note', '',
    'references', jsonb_build_object('quoteNumber', null, 'projectId', null, 'planStep', null, 'precedingInvoiceNumber', p_preceding, 'ourReference', ''),
    'seller', jsonb_build_object('name', 'Prov A AB', 'orgNr', '559000-0001', 'vatNr', 'SE559000000101', 'street', 'Gatan 1', 'postalCode', '11122', 'city', 'Stockholm', 'countryCode', 'SE', 'email', '', 'phone', '', 'fSkatt', true),
    'buyer', jsonb_build_object('name', 'Anna Andersson', 'type', 'privat', 'orgNr', '', 'vatNr', '', 'street', 'Vägen 2', 'postalCode', '12345', 'city', 'Täby', 'countryCode', 'SE', 'email', '', 'phone', '', 'customerId', null, 'reference', ''),
    'lines', jsonb_build_array(jsonb_build_object('id', 'l1', 'description', 'Arbete', 'quantity', p_qty, 'unit', 'tim', 'unitPriceOre', 10000, 'vatCategory', 'S', 'vatRate', 25, 'kind', 'labor', 'section', '', 'changeOrderId', null)),
    'paymentMeans', jsonb_build_object('bankgiro', '123-4567', 'plusgiro', '', 'iban', '', 'bic', '', 'swish', '', 'ocr', null, 'termsText', '30 dagar netto', 'termsDays', 30),
    'se', jsonb_build_object('reverseCharge', false, 'rot', null, 'lateInterestText', ''))
$$;
-- Brutto i öre för p_qty timmar; negativt på en kreditfaktura.
create function pg_temp.gross(p_kind text, p_qty numeric) returns bigint language sql as $$
  select (case when p_kind = 'credit' then -1 else 1 end * p_qty * 12500)::bigint
$$;
create function pg_temp.totals(p_gross bigint) returns jsonb language sql as $$
  select jsonb_build_object('total', p_gross, 'vat', p_gross / 5, 'rot', 0, 'payable', p_gross)
$$;
-- Verifikationsrad från ett belopp med tecken: positivt debet, negativt kredit.
create function pg_temp.line(p_account text, p_amount bigint, p_text text default null) returns jsonb language sql as $$
  select jsonb_build_object('account', p_account, 'debit', greatest(p_amount, 0), 'credit', greatest(-p_amount, 0))
         || case when p_text is null then '{}'::jsonb else jsonb_build_object('text', p_text) end
$$;
create function pg_temp.posting(p_gross bigint) returns jsonb language sql as $$
  select jsonb_build_object('text', 'Faktura {number} Prov', 'lines', jsonb_build_array(
    pg_temp.line('1510', p_gross), pg_temp.line('3001', -(p_gross - p_gross / 5)), pg_temp.line('2611', -(p_gross / 5))))
$$;
create function pg_temp.draft(p_key text, p_kind text, p_qty numeric, p_credits text default null, p_replaces text default null, p_offset text default null) returns void language sql as $$
  with x as (
    insert into invoices (org_id, series, kind, document, total_ore, vat_ore, payable_ore, due_on, credits_invoice_id, replaces_invoice_id, offset_from_credit_id)
    values ((select v from prov where k = 'a'), 'F', p_kind,
            pg_temp.doc(p_kind, p_qty, (select number from invoices where id = (select v from prov where k = p_credits))),
            pg_temp.gross(p_kind, p_qty), pg_temp.gross(p_kind, p_qty) / 5, pg_temp.gross(p_kind, p_qty), '2026-11-24',
            (select v from prov where k = p_credits), (select v from prov where k = p_replaces), (select v from prov where k = p_offset))
    returning id)
  insert into prov select p_key, id from x
$$;
create function pg_temp.issue(p_key text) returns text language sql as $$
  select issue_invoice(i.id, i.document, pg_temp.totals(i.payable_ore), pg_temp.posting(i.payable_ore),
                       '{"kind":"user","id":"a-agare@prov.se","name":"a-agare@prov.se"}'::jsonb)->>'number'
    from invoices i where i.id = (select v from prov where k = p_key)
$$;
-- Rätta belopp, första steget: kreditfaktura för hela originalet, utfärdad direkt.
create function pg_temp.credit(p_key text, p_orig text, p_qty numeric) returns text language plpgsql as $$
declare
  v_number text;
begin
  perform pg_temp.draft(p_key, 'credit', p_qty, p_orig);
  v_number := pg_temp.issue(p_key);
  perform mark_invoice_credited((select v from prov where k = p_orig), (select v from prov where k = p_key), '{"kind":"system","name":"prov"}'::jsonb);
  return v_number;
end;
$$;
create function pg_temp.pay(p_key text, p_amount bigint) returns jsonb language sql as $$
  select register_payment((select v from prov where k = p_key), p_amount, 'bankgiro', '2026-10-25', '', '',
    jsonb_build_object('text', 'Inbetalning', 'lines', jsonb_build_array(pg_temp.line('1930', p_amount), pg_temp.line('1510', -p_amount))),
    '{"kind":"system","name":"prov"}'::jsonb)
$$;
-- Rätta belopp, andra steget: det ersättande utkastet utfärdas med kvittningen.
create function pg_temp.replace(p_key text, p_offset bigint) returns jsonb language sql as $$
  select issue_replacement_invoice(i.id,
    case when p_offset = 0 then i.document
         else jsonb_set(i.document, '{se,offset}', jsonb_build_object('invoiceNumber', o.number, 'creditNumber', c.number, 'amountOre', p_offset)) end,
    pg_temp.totals(i.payable_ore), pg_temp.posting(i.payable_ore),
    jsonb_build_object('text', 'Kvittning faktura ' || o.number || ' mot faktura {number}', 'lines', jsonb_build_array(
      pg_temp.line('1510', p_offset, 'Faktura ' || o.number || ', betalning flyttad'),
      pg_temp.line('1510', -p_offset, 'Faktura {number}, kvittad betalning'))),
    '{"kind":"user","id":"a-agare@prov.se","name":"a-agare@prov.se"}'::jsonb)
  from invoices i
  join invoices o on o.id = i.replaces_invoice_id
  left join invoices c on c.id = i.offset_from_credit_id
  where i.id = (select v from prov where k = p_key)
$$;
-- Saldo på ett konto i organisation A.
create function pg_temp.balance(p_account text) returns bigint language sql as $$
  select coalesce(sum(l.debit_ore - l.credit_ore), 0)::bigint from journal_lines l
   where l.org_id = (select v from prov where k = 'a') and l.account = p_account
$$;
-- Kundreskontran: vad som är kvar att betala (negativt = att återbetala) på
-- fakturor som bär en fordran. Ska alltid vara lika med 1510.
create function pg_temp.ledger() returns bigint language sql as $$
  select coalesce(sum(payable_ore - paid_ore), 0)::bigint from invoices
   where org_id = (select v from prov where k = 'a') and status not in ('draft', 'void', 'credited') and kind = 'invoice'
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000028b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000028a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', '5590000001'));

-- ------------------------------------------------------------ fall 1: lägre belopp

select pg_temp.draft('i1', 'invoice', 10);
do $$ begin if pg_temp.issue('i1') <> '1' then raise exception 'Faktura 1 fick fel nummer.'; end if; end $$;
insert into prov select 'p1', (pg_temp.pay('i1', 125000)->>'paymentId')::uuid;
do $$ begin if pg_temp.credit('c1', 'i1', 10) <> '2' then raise exception 'Kreditfaktura 2 fick fel nummer.'; end if; end $$;
select pg_temp.draft('r1', 'invoice', 8, null, 'i1', 'c1');

do $$
declare
  v_msg text;
begin
  if (select status from invoices where id = (select v from prov where k = 'i1')) <> 'credited' then
    raise exception 'Faktura 1 blev inte krediterad.';
  end if;
  -- Kundens tillgodo efter krediten: 1 250 kr på 1510 innan den nya fakturan finns.
  if pg_temp.balance('1510') <> -125000 then raise exception '1510 efter krediten: %', pg_temp.balance('1510'); end if;
  -- Det ersättande utkastet kan inte utfärdas förbi kvittningen.
  begin
    perform pg_temp.issue('r1');
    raise exception 'Det ersättande utkastet kunde utfärdas med issue_invoice()';
  exception when feature_not_supported then null;
  end;
  -- Kvittningen på dokumentet måste vara det som är betalt.
  begin
    perform pg_temp.replace('r1', 100000);
    raise exception 'Fel kvittningsbelopp gick igenom';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%stämmer inte%' then raise exception 'Fel skäl för fel belopp: %', v_msg; end if;
  end;
  -- En kvittning kan inte registreras vid sidan av.
  begin
    insert into payments (org_id, amount_ore, method, paid_on, offsets_payment_id, offset_credit_id)
      values ((select v from prov where k = 'a'), 0, 'offset', '2026-10-25', (select v from prov where k = 'p1'), (select v from prov where k = 'c1'));
    raise exception 'En kvittning kunde skapas direkt i tabellen';
  exception when feature_not_supported then null;
  end;
end $$;

-- Organisation B kan inte utfärda A:s ersättande faktura.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000028b1","role":"authenticated","email":"b-agare@prov.se"}';
do $$
begin
  begin
    perform issue_replacement_invoice((select v from prov where k = 'r1'), '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'B kunde utfärda A:s faktura';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000028a1","role":"authenticated","email":"a-agare@prov.se"}';

do $$
declare
  v_res  jsonb := pg_temp.replace('r1', 125000);
  v_r    invoices%rowtype;
  v_o    invoices%rowtype;
  v_pay  payments%rowtype;
  v_n    int;
  v_text text;
begin
  if v_res->>'number' <> '3' then raise exception 'Den nya fakturan fick nummer %, inte 3.', v_res->>'number'; end if;
  select * into v_r from invoices where id = (select v from prov where k = 'r1');
  select * into v_o from invoices where id = (select v from prov where k = 'i1');
  if v_r.status <> 'paid' or v_r.paid_ore <> 125000 or v_r.payable_ore <> 100000 then
    raise exception 'Faktura 3: status %, betalt %, att betala %.', v_r.status, v_r.paid_ore, v_r.payable_ore;
  end if;
  if v_r.document#>>'{se,offset,invoiceNumber}' <> '1' or (v_r.document#>>'{se,offset,amountOre}')::bigint <> 125000 then
    raise exception 'Kvittningen är inte fryst i dokumentet.';
  end if;
  if v_o.paid_ore <> 0 or v_o.status <> 'credited' then raise exception 'Faktura 1 efter kvittningen: %, betalt %.', v_o.status, v_o.paid_ore; end if;
  -- En kvittning: 0 kr, hänvisar till betalningen och kreditfakturan, -1 250 på 1 och +1 250 på 3.
  select * into v_pay from payments where method = 'offset' and org_id = v_r.org_id;
  if v_pay.amount_ore <> 0 or v_pay.offsets_payment_id <> (select v from prov where k = 'p1') or v_pay.offset_credit_id <> (select v from prov where k = 'c1') then
    raise exception 'Kvittningen hänvisar fel.';
  end if;
  if (select amount_ore from payment_allocations where payment_id = v_pay.id and invoice_id = v_o.id) <> -125000
     or (select amount_ore from payment_allocations where payment_id = v_pay.id and invoice_id = v_r.id) <> 125000 then
    raise exception 'Kvittningens fördelning är fel.';
  end if;
  -- Verifikationen: 1510 mot 1510, inga bankrader, raderna namnger fakturorna.
  select count(*) into v_n from journal_lines l join journal_entries e on e.id = l.entry_id
   where e.source_type = 'offset' and e.source_id = v_r.id and l.account = '1510';
  if v_n <> 2 then raise exception 'Kvittningens verifikation har % rader på 1510.', v_n; end if;
  select count(*) into v_n from journal_lines l join journal_entries e on e.id = l.entry_id
   where e.source_type = 'offset' and e.source_id = v_r.id and l.account <> '1510';
  if v_n <> 0 then raise exception 'Kvittningen bokförde andra konton än 1510.'; end if;
  select e.text into v_text from journal_entries e where e.source_type = 'offset' and e.source_id = v_r.id;
  if v_text <> 'Kvittning faktura 1 mot faktura 3' then raise exception 'Kvittningens text: %', v_text; end if;
  if not exists (select 1 from journal_lines l join journal_entries e on e.id = l.entry_id
                  where e.source_type = 'offset' and e.source_id = v_r.id and l.text = 'Faktura 3, kvittad betalning') then
    raise exception 'Kvittningens rad saknar den nya fakturans nummer.';
  end if;
  -- Saldon: 250 kr att återbetala, både i huvudboken och i reskontran; banken har 1 250.
  if pg_temp.balance('1510') <> -25000 or pg_temp.ledger() <> -25000 then
    raise exception '1510 % och reskontran % efter kvittningen, inte -25000.', pg_temp.balance('1510'), pg_temp.ledger();
  end if;
  if pg_temp.balance('1930') <> 125000 then raise exception '1930 efter kvittningen: %', pg_temp.balance('1930'); end if;
  if pg_temp.balance('3001') <> -80000 then raise exception '3001 efter kvittningen: %', pg_temp.balance('3001'); end if;
  -- Händelser på båda fakturorna, och betald på den nya.
  if (select count(*) from events where type = 'invoice.offset' and aggregate_id in (v_r.id, v_o.id)) <> 2 then
    raise exception 'invoice.offset saknas på någon av fakturorna.';
  end if;
  if (select data->>'fromNumber' from events where type = 'invoice.offset' and aggregate_id = v_r.id) <> '1'
     or (select data->>'toNumber' from events where type = 'invoice.offset' and aggregate_id = v_o.id) <> '3' then
    raise exception 'invoice.offset hänvisar fel.';
  end if;
  if not exists (select 1 from events where type = 'invoice.paid' and aggregate_id = v_r.id) then
    raise exception 'invoice.paid saknas på faktura 3.';
  end if;
  -- Kopplingen är låst och en kvittning kan inte ändras.
  begin
    update invoices set replaces_invoice_id = null where id = v_r.id;
    raise exception 'replaces_invoice_id kunde ändras efter utfärdandet';
  exception when feature_not_supported then null;
  end;
  begin
    update payments set method = 'manual' where id = v_pay.id;
    raise exception 'En kvittning kunde göras om till en vanlig betalning';
  exception when feature_not_supported or check_violation then null;
  end;
end $$;

-- Ett original ersätts bara en gång.
do $$
begin
  begin
    perform pg_temp.draft('r1b', 'invoice', 8, null, 'i1', 'c1');
    raise exception 'Faktura 1 kunde ersättas två gånger';
  exception when unique_violation then null;
  end;
end $$;

-- Återbetalningen: 250 kr ut från banken, 1510 och reskontran går till noll.
select register_payment((select v from prov where k = 'r1'), -25000, 'bankgiro', '2026-10-26', '', 'Återbetalning',
  jsonb_build_object('text', 'Återbetalning faktura 3', 'lines', jsonb_build_array(pg_temp.line('1930', -25000), pg_temp.line('1510', 25000))),
  '{"kind":"system","name":"prov"}'::jsonb);
do $$
begin
  if (select paid_ore from invoices where id = (select v from prov where k = 'r1')) <> 100000
     or (select status from invoices where id = (select v from prov where k = 'r1')) <> 'paid' then
    raise exception 'Faktura 3 efter återbetalningen är inte betald med 1 000 kr.';
  end if;
  if pg_temp.balance('1510') <> 0 or pg_temp.ledger() <> 0 then raise exception '1510 % och reskontran % efter återbetalningen.', pg_temp.balance('1510'), pg_temp.ledger(); end if;
  if pg_temp.balance('1930') <> 100000 then raise exception '1930 efter återbetalningen: %', pg_temp.balance('1930'); end if;
  -- Pengarna är räknade en gång: inbetalt minus återbetalt, kvittningen är 0 kr.
  if (select sum(amount_ore) from payments where org_id = (select v from prov where k = 'a')) <> 100000 then
    raise exception 'Betalningarna summerar inte till 1 000 kr.';
  end if;
  if (select sum(paid_ore) from invoices where org_id = (select v from prov where k = 'a')) <> 100000 then
    raise exception 'Fakturornas betalt summerar inte till 1 000 kr.';
  end if;
end $$;

-- ------------------------------------------------------------ fall 2: högre belopp

select pg_temp.draft('i4', 'invoice', 10);
do $$ begin if pg_temp.issue('i4') <> '4' then raise exception 'Faktura 4 fick fel nummer.'; end if; end $$;
select pg_temp.pay('i4', 50000);
-- Ett steg i en betalplan är fakturerat med faktura 4.
with p as (insert into payment_plans (org_id) values ((select v from prov where k = 'a')) returning id),
     s as (insert into payment_plan_steps (org_id, plan_id, label, invoice_id)
           select (select v from prov where k = 'a'), p.id, 'Slutfaktura', (select v from prov where k = 'i4') from p returning id)
insert into prov select 'step', id from s;
do $$ begin if pg_temp.credit('c4', 'i4', 10) <> '5' then raise exception 'Kreditfaktura 5 fick fel nummer.'; end if; end $$;
select pg_temp.draft('r4', 'invoice', 12, null, 'i4', 'c4');

do $$
declare
  v_res jsonb := pg_temp.replace('r4', 50000);
  v_r   invoices%rowtype;
begin
  if v_res->>'number' <> '6' then raise exception 'Den nya fakturan fick nummer %, inte 6.', v_res->>'number'; end if;
  select * into v_r from invoices where id = (select v from prov where k = 'r4');
  if v_r.status <> 'partially_paid' or v_r.paid_ore <> 50000 or v_r.payable_ore <> 150000 then
    raise exception 'Faktura 6: status %, betalt %, att betala %.', v_r.status, v_r.paid_ore, v_r.payable_ore;
  end if;
  if v_r.ocr is null or v_r.ocr <> ocr_for('6') then raise exception 'Faktura 6 fick inte sitt eget OCR-nummer.'; end if;
  if (select paid_ore from invoices where id = (select v from prov where k = 'i4')) <> 0 then raise exception 'Faktura 4 har kvar betalningen.'; end if;
  if (select invoice_id from payment_plan_steps where id = (select v from prov where k = 'step')) <> v_r.id then
    raise exception 'Betalplanens steg pekar inte på faktura 6.';
  end if;
  -- 1 000 kr kvar att betala, i huvudboken och i reskontran.
  if pg_temp.balance('1510') <> 100000 or pg_temp.ledger() <> 100000 then
    raise exception '1510 % och reskontran % efter fall 2, inte 100000.', pg_temp.balance('1510'), pg_temp.ledger();
  end if;
end $$;

select pg_temp.pay('r4', 100000);
do $$
begin
  if (select status from invoices where id = (select v from prov where k = 'r4')) <> 'paid' then raise exception 'Faktura 6 blev inte betald.'; end if;
  if pg_temp.balance('1510') <> 0 or pg_temp.ledger() <> 0 then raise exception '1510 % efter fall 2.', pg_temp.balance('1510'); end if;
  if pg_temp.balance('1930') <> 250000 then raise exception '1930 efter fall 2: %', pg_temp.balance('1930'); end if;
end $$;

-- ------------------------------------------------------------ fall 3: obetald, ingen kvittning

select pg_temp.draft('i7', 'invoice', 10);
do $$ begin if pg_temp.issue('i7') <> '7' then raise exception 'Faktura 7 fick fel nummer.'; end if; end $$;
select pg_temp.draft('r7', 'invoice', 9, null, 'i7');
do $$
declare
  v_msg text;
begin
  -- Originalet måste vara krediterat innan det ersätts.
  begin
    perform pg_temp.replace('r7', 0);
    raise exception 'En okrediterad faktura kunde ersättas';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%inte krediterad%' then raise exception 'Fel skäl för okrediterad: %', v_msg; end if;
  end;
end $$;
do $$ begin if pg_temp.credit('c7', 'i7', 10) <> '8' then raise exception 'Kreditfaktura 8 fick fel nummer.'; end if; end $$;
do $$
declare
  v_res jsonb := pg_temp.replace('r7', 0);
begin
  if v_res->>'number' <> '9' or v_res ? 'offset' then raise exception 'Faktura 9 utan kvittning: %', v_res; end if;
  if (select status from invoices where id = (select v from prov where k = 'r7')) <> 'issued'
     or (select paid_ore from invoices where id = (select v from prov where k = 'r7')) <> 0 then
    raise exception 'Faktura 9 är inte en vanlig obetald faktura.';
  end if;
  if exists (select 1 from journal_entries where source_type = 'offset' and source_id = (select v from prov where k = 'r7')) then
    raise exception 'Faktura 9 fick en kvittning utan betalning.';
  end if;
  if pg_temp.balance('1510') <> 112500 or pg_temp.ledger() <> 112500 then
    raise exception '1510 % och reskontran % efter fall 3.', pg_temp.balance('1510'), pg_temp.ledger();
  end if;
end $$;

-- ------------------------------------------------------------ serierna

do $$
declare
  v_nums int[];
  v_vers int[];
begin
  select array_agg(number::int order by number::int) into v_nums from invoices
    where org_id = (select v from prov where k = 'a') and number is not null;
  if v_nums <> array[1, 2, 3, 4, 5, 6, 7, 8, 9] then raise exception 'Fakturaserien är bruten: %', v_nums; end if;
  select array_agg(number order by number) into v_vers from journal_entries where org_id = (select v from prov where k = 'a');
  if v_vers <> (select array_agg(n order by n) from generate_series(1, cardinality(v_vers)) n) then
    raise exception 'Verifikationsserien är bruten: %', v_vers;
  end if;
  -- Varje verifikation balanserar.
  if exists (select 1 from journal_lines where org_id = (select v from prov where k = 'a') group by entry_id having sum(debit_ore) <> sum(credit_ore)) then
    raise exception 'En verifikation balanserar inte.';
  end if;
end $$;

do $$ begin raise notice 'Prov 0028: alla gick igenom'; end $$;

rollback;
