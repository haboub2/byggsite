-- Prov för 0025 (rättelser: makulera och ändringsfaktura). Körs i Supabase
-- SQL-editor efter 0025. Allt sker i en transaktion som rullas tillbaka: två
-- provanvändare, två provorganisationer, inget blir kvar. Ett fel avbryter
-- med ett tydligt meddelande; "Prov 0025: alla gick igenom" betyder att allt
-- höll.
--
--   A1  owner i organisation A, där fakturorna 1–5 utfärdas
--   B1  owner i organisation B, som inte får röra A:s fakturor

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000025a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000025b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

-- Ett fakturadokument som issue_invoice() tar emot: en rad, 10 tim à 100 kr + 25 % moms.
create function pg_temp.doc(p_name text) returns jsonb language sql as $$
  select jsonb_build_object(
    'schemaVersion', 1, 'kind', 'invoice', 'series', 'F', 'number', null, 'currency', 'SEK',
    'issueDate', '2026-10-22', 'dueDate', '2026-11-21', 'deliveryDate', null, 'period', null,
    'title', 'Provfaktura', 'note', '',
    'references', jsonb_build_object('quoteNumber', null, 'projectId', null, 'planStep', null, 'precedingInvoiceNumber', null, 'ourReference', ''),
    'seller', jsonb_build_object('name', 'Prov A AB', 'orgNr', '559000-0001', 'vatNr', 'SE559000000101', 'street', 'Gatan 1', 'postalCode', '11122', 'city', 'Stockholm', 'countryCode', 'SE', 'email', '', 'phone', '', 'fSkatt', true),
    'buyer', jsonb_build_object('name', p_name, 'type', 'privat', 'orgNr', '', 'vatNr', '', 'street', 'Vägen 2', 'postalCode', '12345', 'city', 'Täby', 'countryCode', 'SE', 'email', '', 'phone', '', 'customerId', null, 'reference', ''),
    'lines', jsonb_build_array(jsonb_build_object('id', 'l1', 'description', 'Arbete', 'quantity', 10, 'unit', 'tim', 'unitPriceOre', 10000, 'vatCategory', 'S', 'vatRate', 25, 'kind', 'labor', 'section', '', 'changeOrderId', null)),
    'paymentMeans', jsonb_build_object('bankgiro', '123-4567', 'plusgiro', '', 'iban', '', 'bic', '', 'swish', '', 'ocr', null, 'termsText', '30 dagar netto', 'termsDays', 30),
    'se', jsonb_build_object('reverseCharge', false, 'rot', null, 'lateInterestText', ''))
$$;
create function pg_temp.posting() returns jsonb language sql as $$
  select '{"text":"Faktura {number} Prov","lines":[{"account":"1510","debit":125000,"credit":0},{"account":"3001","debit":0,"credit":100000},{"account":"2611","debit":0,"credit":25000}]}'::jsonb
$$;
create function pg_temp.draft(p_key text, p_name text) returns void language sql as $$
  with x as (
    insert into invoices (org_id, series, kind, document, total_ore, vat_ore, payable_ore, due_on)
    values ((select v from prov where k = 'a'), 'F', 'invoice', pg_temp.doc(p_name), 125000, 25000, 125000, '2026-11-21')
    returning id)
  insert into prov select p_key, id from x
$$;
create function pg_temp.issue(p_key text) returns text language sql as $$
  select issue_invoice((select v from prov where k = p_key), pg_temp.doc('Anna Andersson'),
                       '{"total":125000,"vat":25000,"rot":0,"payable":125000}'::jsonb, pg_temp.posting(),
                       '{"kind":"user","id":"a-agare@prov.se","name":"a-agare@prov.se"}'::jsonb)->>'number'
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000025b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000025a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', '5590000001'));

-- Faktura 1 utfärdad, 2 utfärdad och skickad, 3 utfärdad och betald.
select pg_temp.draft('i1', 'Anna Andersson'), pg_temp.draft('i2', 'Anna Andersson'), pg_temp.draft('i3', 'Anna Andersson');
do $$
begin
  if pg_temp.issue('i1') <> '1' or pg_temp.issue('i2') <> '2' or pg_temp.issue('i3') <> '3' then
    raise exception 'Utfärdandet gav fel nummer.';
  end if;
end $$;
select mark_invoice_sent((select v from prov where k = 'i2'), 'anna@prov.se', '{"kind":"system","name":"prov"}'::jsonb);
select register_payment((select v from prov where k = 'i3'), 125000, 'bankgiro', '2026-10-22', '', '',
  '{"text":"Inbetalning","lines":[{"account":"1930","debit":125000,"credit":0},{"account":"1510","debit":0,"credit":125000}]}'::jsonb,
  '{"kind":"system","name":"prov"}'::jsonb);

-- ------------------------------------------------------------ makulera

do $$
declare
  v_msg text;
begin
  -- Skickad faktura kan inte makuleras.
  begin
    perform void_invoice((select v from prov where k = 'i2'), 'Fel kund', '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'En skickad faktura kunde makuleras';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%är skickad%' then raise exception 'Fel skäl för skickad faktura: %', v_msg; end if;
  end;
  -- Betald faktura kan inte makuleras.
  begin
    perform void_invoice((select v from prov where k = 'i3'), 'Fel kund', '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'En betald faktura kunde makuleras';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%betalningar%' then raise exception 'Fel skäl för betald faktura: %', v_msg; end if;
  end;
  -- Orsak krävs.
  begin
    perform void_invoice((select v from prov where k = 'i1'), '  ', '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'Makulering utan orsak gick igenom';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%varför%' then raise exception 'Fel skäl utan orsak: %', v_msg; end if;
  end;
  -- Statusen kan inte sättas direkt i tabellen.
  begin
    update invoices set status = 'void' where id = (select v from prov where k = 'i1');
    raise exception 'Status void kunde sättas direkt';
  exception when feature_not_supported then null;
  end;
end $$;

-- Organisation B kan inte makulera A:s faktura.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000025b1","role":"authenticated","email":"b-agare@prov.se"}';
do $$
begin
  begin
    perform void_invoice((select v from prov where k = 'i1'), 'Intrång', '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'B kunde makulera A:s faktura';
  exception when insufficient_privilege then null;
  end;
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000025a1","role":"authenticated","email":"a-agare@prov.se"}';

select void_invoice((select v from prov where k = 'i1'), 'Fel kund, fakturan skulle till en annan beställare', '{"kind":"user","id":"a-agare@prov.se","name":"a-agare@prov.se"}'::jsonb);

do $$
declare
  v_inv   invoices%rowtype;
  v_n     int;
  v_net   int;
  v_text  text;
  v_reason text;
begin
  select * into v_inv from invoices where id = (select v from prov where k = 'i1');
  if v_inv.status <> 'void' or v_inv.number <> '1' then raise exception 'Fakturan blev inte makulerad med numret kvar (%/%).', v_inv.status, v_inv.number; end if;
  if v_inv.voided_at is null or v_inv.voided_by <> 'a-agare@prov.se' or v_inv.void_reason not like 'Fel kund%' then
    raise exception 'Tid, person eller orsak saknas på makuleringen.';
  end if;
  -- Rättelseposten vänder utfärdandet: samma konton, debet och kredit omvända, summan per konto noll.
  select count(*) into v_n from journal_entries e
    where e.source_type = 'reversal' and e.source_id = (select id from journal_entries where source_type = 'invoice' and source_id = v_inv.id);
  if v_n <> 1 then raise exception 'Rättelseposten saknas (%).', v_n; end if;
  select e.text into v_text from journal_entries e
    where e.source_type = 'reversal' and e.source_id = (select id from journal_entries where source_type = 'invoice' and source_id = v_inv.id);
  if v_text <> 'Makulering av faktura 1' then raise exception 'Rättelsepostens text: %', v_text; end if;
  select count(*) into v_n from (
    select l.account, sum(l.debit_ore - l.credit_ore) s
      from journal_lines l join journal_entries e on e.id = l.entry_id
      where (e.source_type = 'invoice' and e.source_id = v_inv.id)
         or (e.source_type = 'reversal' and e.source_id = (select id from journal_entries where source_type = 'invoice' and source_id = v_inv.id))
      group by l.account) x where s <> 0;
  if v_n <> 0 then raise exception 'Rättelseposten vänder inte utfärdandet (% konton kvar).', v_n; end if;
  select count(*) into v_n from journal_lines l join journal_entries e on e.id = l.entry_id
    where e.source_type = 'reversal' and e.source_id = (select id from journal_entries where source_type = 'invoice' and source_id = v_inv.id);
  if v_n <> 3 then raise exception 'Rättelseposten har % rader, inte 3.', v_n; end if;
  select data->>'reason' into v_reason from events where aggregate_id = v_inv.id and type = 'invoice.voided';
  if v_reason is null or v_reason not like 'Fel kund%' then raise exception 'Händelsen invoice.voided saknar orsak.'; end if;
  -- En makulerad faktura är helt låst.
  begin
    update invoices set sent_at = now() where id = v_inv.id;
    raise exception 'En makulerad faktura kunde ändras';
  exception when feature_not_supported then null;
  end;
  begin
    perform mark_invoice_sent(v_inv.id, 'x@prov.se', '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'En makulerad faktura kunde markeras skickad';
  exception
    -- Frystriggern (0025), eller sedan 0026 mark_invoice_sent själv: "Faktura N är makulerad och skickas inte."
    when feature_not_supported then null;
    when raise_exception then
      if sqlerrm not like '%makulerad och skickas inte%' then raise; end if;
  end;
  begin
    perform void_invoice(v_inv.id, 'Igen', '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'En makulerad faktura kunde makuleras igen';
  exception when raise_exception then null;
  end;
end $$;

-- ------------------------------------------------------------ ändringsfaktura

create temp table prov_orig on commit drop as
  select document, sha256, status, total_ore, payable_ore, paid_ore, ocr, due_on from invoices where id = (select v from prov where k = 'i2');
grant select on prov_orig to authenticated;

do $$
declare
  v_doc jsonb := (select document from invoices where id = (select v from prov where k = 'i2'));
  v_msg text;
begin
  -- Beloppen får inte ändras.
  begin
    perform issue_correction_invoice((select v from prov where k = 'i2'),
      jsonb_set(v_doc, '{lines,0,quantity}', '11') || '{"correctionNote":"Ändringsfaktura."}'::jsonb, 'antal', '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'En ändringsfaktura kunde ändra antal';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%får inte ändra belopp%' then raise exception 'Fel skäl för ändrat antal: %', v_msg; end if;
  end;
  -- Makulerade fakturor rättas inte.
  begin
    perform issue_correction_invoice((select v from prov where k = 'i1'), v_doc || '{"correctionNote":"x"}'::jsonb, 'x', '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'En makulerad faktura kunde rättas';
  exception when raise_exception then null;
  end;
  -- Ingen ändringsfaktura vid sidan av funktionen.
  begin
    insert into invoices (org_id, series, kind, document, corrects_invoice_id)
      values ((select v from prov where k = 'a'), 'F', 'correction', v_doc, (select v from prov where k = 'i2'));
    raise exception 'En ändringsfaktura kunde skapas direkt i tabellen';
  exception when feature_not_supported then null;
  end;
end $$;

insert into prov select 'c1', (issue_correction_invoice(
  (select v from prov where k = 'i2'),
  jsonb_set((select document from invoices where id = (select v from prov where k = 'i2')), '{buyer,name}', '"Anna Anderson"')
    || jsonb_build_object('issueDate', '2026-10-23', 'correctionNote', 'Ändringsfaktura. Ersätter faktura 2. Ändrade uppgifter: kundens namn från ''Anna Andersson'' till ''Anna Anderson''.'),
  'kundens namn från ''Anna Andersson'' till ''Anna Anderson''',
  '{"kind":"user","id":"a-agare@prov.se","name":"a-agare@prov.se"}'::jsonb)->>'id')::uuid;

do $$
declare
  v_c  invoices%rowtype;
  v_o  invoices%rowtype;
  v_p  prov_orig%rowtype;
  v_n  int;
  v_msg text;
begin
  select * into v_c from invoices where id = (select v from prov where k = 'c1');
  select * into v_o from invoices where id = (select v from prov where k = 'i2');
  select * into v_p from prov_orig;
  if v_c.kind <> 'correction' or v_c.status <> 'issued' or v_c.number <> '4' then
    raise exception 'Ändringsfakturan: %/%/%', v_c.kind, v_c.status, v_c.number;
  end if;
  if v_c.corrects_invoice_id <> v_o.id or v_c.document#>>'{references,precedingInvoiceNumber}' <> '2' then
    raise exception 'Ändringsfakturan hänvisar inte till faktura 2.';
  end if;
  if v_c.document->>'kind' <> 'correction' or v_c.document->>'number' <> '4' or v_c.document#>>'{buyer,name}' <> 'Anna Anderson' then
    raise exception 'Ändringsfakturans dokument: %', v_c.document;
  end if;
  if v_c.ocr is distinct from v_o.ocr or v_c.document#>>'{paymentMeans,ocr}' is distinct from v_o.ocr
     or v_c.due_on <> v_o.due_on or v_c.document->>'dueDate' <> v_o.due_on::text then
    raise exception 'Ändringsfakturan har inte originalets OCR och förfallodag.';
  end if;
  if v_c.issued_on <> '2026-10-23' or v_c.sha256 is null then raise exception 'Ändringsfakturans datum eller hash.'; end if;
  -- Originalet är oförändrat, utom länken till ändringsfakturan.
  if v_o.document is distinct from v_p.document or v_o.sha256 is distinct from v_p.sha256 or v_o.status <> v_p.status
     or v_o.total_ore <> v_p.total_ore or v_o.payable_ore <> v_p.payable_ore or v_o.ocr is distinct from v_p.ocr then
    raise exception 'Originalet ändrades av ändringsfakturan.';
  end if;
  if v_o.corrected_by is distinct from v_c.id then raise exception 'Originalet saknar corrected_by.'; end if;
  -- Ingen bokföring för ändringsfakturan, men händelsen på båda.
  select count(*) into v_n from journal_entries where source_id = v_c.id;
  if v_n <> 0 then raise exception 'Ändringsfakturan bokfördes (%).', v_n; end if;
  select count(*) into v_n from events where type = 'invoice.corrected' and aggregate_id in (v_c.id, v_o.id);
  if v_n <> 2 then raise exception 'Händelsen invoice.corrected: %', v_n; end if;
  -- Betalningar hör till originalet.
  begin
    perform register_payment(v_c.id, 125000, 'bankgiro', '2026-10-23', '', '',
      '{"text":"Inbetalning","lines":[{"account":"1930","debit":125000,"credit":0},{"account":"1510","debit":0,"credit":125000}]}'::jsonb,
      '{"kind":"system","name":"prov"}'::jsonb);
    raise exception 'En betalning gick in på ändringsfakturan';
  exception when raise_exception then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like '%Registrera betalningen på faktura 2%' then raise exception 'Fel skäl för betalning på ändringsfaktura: %', v_msg; end if;
  end;
  -- Ändringsfakturan är låst som andra utfärdade fakturor och kan skickas.
  begin
    update invoices set document = document || '{"title":"x"}' where id = v_c.id;
    raise exception 'Ändringsfakturan kunde ändras';
  exception when feature_not_supported then null;
  end;
  perform mark_invoice_sent(v_c.id, 'anna@prov.se', '{"kind":"system","name":"prov"}'::jsonb);
  -- corrected_by kan inte sättas om direkt.
  begin
    update invoices set corrected_by = null where id = v_o.id;
    raise exception 'corrected_by kunde ändras direkt';
  exception when feature_not_supported then null;
  end;
end $$;

-- En andra rättelse utgår från ändringsfakturan och pekar om originalet.
insert into prov select 'c2', (issue_correction_invoice(
  (select v from prov where k = 'i2'),
  jsonb_set((select document from invoices where id = (select v from prov where k = 'c1')) - 'correctionNote', '{buyer,street}', '"Vägen 3"')
    || '{"correctionNote":"Ändringsfaktura. Ersätter faktura 2 och ändringsfaktura 4."}'::jsonb,
  'kundens gatuadress från ''Vägen 2'' till ''Vägen 3''',
  '{"kind":"system","name":"prov"}'::jsonb)->>'id')::uuid;

-- Nummerserien är obruten: 1–5, och nästa vanliga faktura får 6.
select pg_temp.draft('i6', 'Bo Berg');
do $$
declare
  v_nums int[];
begin
  if pg_temp.issue('i6') <> '6' then raise exception 'Faktura efter ändringsfakturorna fick inte nummer 6.'; end if;
  select array_agg(number::int order by number::int) into v_nums from invoices
    where org_id = (select v from prov where k = 'a') and number is not null;
  if v_nums <> array[1, 2, 3, 4, 5, 6] then raise exception 'Nummerserien är bruten: %', v_nums; end if;
  if (select corrected_by from invoices where id = (select v from prov where k = 'i2')) <> (select v from prov where k = 'c2') then
    raise exception 'Originalet pekar inte på den senaste ändringsfakturan.';
  end if;
  if (select document#>>'{buyer,name}' from invoices where id = (select v from prov where k = 'c2')) <> 'Anna Anderson' then
    raise exception 'Den andra rättelsen tappade den första.';
  end if;
end $$;

do $$ begin raise notice 'Prov 0025: alla gick igenom'; end $$;

rollback;
