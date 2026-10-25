-- Prov för 0031 (inkassokrav och inkassoärenden). Körs i Supabase
-- SQL-editor efter 0031, eller i PGlite. Allt sker i en transaktion som
-- rullas tillbaka: två provanvändare, två provorganisationer, inget blir
-- kvar. Ett fel avbryter med ett tydligt meddelande; "Prov 0031: alla gick
-- igenom" betyder att allt höll. Datumen räknas från dagens datum, så provet
-- fungerar vilken dag som helst.
--
--   A1  owner i organisation A, där fakturorna 1–4 utfärdas
--   B1  owner i organisation B, som inte får röra A:s fakturor eller ärenden
--
--   1  förfallen: påminnelse, inkasso, skickad till inkassobolag, delbetald, betald → ärendet stängs
--   2  inte förfallen: varken inkassokrav eller inkasso
--   3  förfallen: inkassokrav, därefter inga påminnelser och inte inkasso före fristen
--   4  förfallen: påminnelse, inkasso, återkallat, påminnelse igen, nytt ärende, krediterad → stängs

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000031a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000031b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

-- Ett fakturadokument som issue_invoice() tar emot: en rad, 10 tim à 100 kr + 25 % moms, förfallodag p_due.
create function pg_temp.doc(p_due date) returns jsonb language sql as $$
  select jsonb_build_object(
    'schemaVersion', 1, 'kind', 'invoice', 'series', 'F', 'number', null, 'currency', 'SEK',
    'issueDate', (p_due - 30)::text, 'dueDate', p_due::text, 'deliveryDate', null, 'period', null,
    'title', 'Provfaktura', 'note', '',
    'references', jsonb_build_object('quoteNumber', null, 'projectId', null, 'planStep', null, 'precedingInvoiceNumber', null, 'ourReference', ''),
    'seller', jsonb_build_object('name', 'Prov A AB', 'orgNr', '559000-0001', 'vatNr', 'SE559000000101', 'street', 'Gatan 1', 'postalCode', '11122', 'city', 'Stockholm', 'countryCode', 'SE', 'email', '', 'phone', '', 'fSkatt', true),
    'buyer', jsonb_build_object('name', 'Kund AB', 'type', 'foretag', 'orgNr', '556000-0002', 'vatNr', '', 'street', 'Vägen 2', 'postalCode', '12345', 'city', 'Täby', 'countryCode', 'SE', 'email', '', 'phone', '', 'customerId', null, 'reference', ''),
    'lines', jsonb_build_array(jsonb_build_object('id', 'l1', 'description', 'Arbete', 'quantity', 10, 'unit', 'tim', 'unitPriceOre', 10000, 'vatCategory', 'S', 'vatRate', 25, 'kind', 'labor', 'section', '', 'changeOrderId', null)),
    'paymentMeans', jsonb_build_object('bankgiro', '123-4567', 'plusgiro', '', 'iban', '', 'bic', '', 'swish', '', 'ocr', null, 'termsText', '30 dagar netto', 'termsDays', 30),
    'se', jsonb_build_object('reverseCharge', false, 'rot', null, 'lateInterestText', ''))
$$;
create function pg_temp.today() returns date language sql as $$ select (now() at time zone 'Europe/Stockholm')::date $$;
create function pg_temp.draft_and_issue(p_key text, p_due date) returns text language plpgsql as $$
declare
  v_id uuid;
begin
  insert into invoices (org_id, series, kind, document, total_ore, vat_ore, payable_ore, due_on)
    values ((select v from prov where k = 'a'), 'F', 'invoice', pg_temp.doc(p_due), 125000, 25000, 125000, p_due)
    returning id into v_id;
  insert into prov values (p_key, v_id);
  return issue_invoice(v_id, pg_temp.doc(p_due), '{"total":125000,"vat":25000,"rot":0,"payable":125000}'::jsonb,
    '{"text":"Faktura {number} Prov","lines":[{"account":"1510","debit":125000,"credit":0},{"account":"3001","debit":0,"credit":100000},{"account":"2611","debit":0,"credit":25000}]}'::jsonb,
    '{"kind":"user","id":"a-agare@prov.se","name":"a-agare@prov.se"}'::jsonb)->>'number';
end;
$$;
create function pg_temp.remind(p_key text) returns jsonb language sql as $$
  select register_reminder((select v from prov where k = p_key), 6000, 100, 'kund@prov.se',
    '{"text":"Påminnelse","lines":[{"account":"1510","debit":6100,"credit":0},{"account":"3591","debit":0,"credit":6000},{"account":"8313","debit":0,"credit":100}]}'::jsonb,
    '{"kind":"system","name":"prov"}'::jsonb)
$$;
create function pg_temp.pay(p_key text, p_amount bigint) returns jsonb language sql as $$
  select register_payment((select v from prov where k = p_key), p_amount, 'bankgiro', pg_temp.today(), '', '',
    jsonb_build_object('text', 'Inbetalning', 'lines', jsonb_build_array(
      jsonb_build_object('account', '1930', 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account', '1510', 'debit', 0, 'credit', p_amount))),
    '{"kind":"system","name":"prov"}'::jsonb)
$$;
create function pg_temp.open_case(p_key text, p_capital bigint) returns jsonb language sql as $$
  select open_collection_case((select v from prov where k = p_key), p_capital, 1234, 6000, '', 'Prov',
    '{"kind":"user","id":"a-agare@prov.se","name":"a-agare@prov.se"}'::jsonb)
$$;
create function pg_temp.demand(p_key text, p_fee bigint, p_pay_by date) returns jsonb language sql as $$
  select register_collection_demand((select v from prov where k = p_key), p_fee, 200, p_pay_by, 'kund@prov.se',
    jsonb_build_object('text', 'Inkassokrav', 'lines', jsonb_build_array(
      jsonb_build_object('account', '1510', 'debit', p_fee + 200, 'credit', 0),
      jsonb_build_object('account', '3591', 'debit', 0, 'credit', p_fee),
      jsonb_build_object('account', '8313', 'debit', 0, 'credit', 200))),
    '{"kind":"user","id":"a-agare@prov.se","name":"a-agare@prov.se"}'::jsonb)
$$;
-- Kör p_sql och kräv att det faller med ett meddelande som innehåller p_like (eller med p_state).
create function pg_temp.fails(p_what text, p_sql text, p_like text, p_state text default null) returns void language plpgsql as $$
declare
  v_msg text;
  v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
    if p_state is not null and v_state <> p_state then
      raise exception '%: fel kod % (%), väntade %', p_what, v_state, v_msg, p_state;
    end if;
    if p_like is not null and v_msg not like '%' || p_like || '%' then
      raise exception '%: fel skäl: %', p_what, v_msg;
    end if;
    return;
  end;
  raise exception '%: gick igenom', p_what;
end;
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000031b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000031a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', '5590000001'));

do $$
begin
  if pg_temp.draft_and_issue('i1', pg_temp.today() - 20) <> '1'
     or pg_temp.draft_and_issue('i2', pg_temp.today() + 10) <> '2'
     or pg_temp.draft_and_issue('i3', pg_temp.today() - 20) <> '3'
     or pg_temp.draft_and_issue('i4', pg_temp.today() - 40) <> '4' then
    raise exception 'Utfärdandet gav fel nummer.';
  end if;
end $$;

-- ------------------------------------------------------------ faktura 1: inkasso till betald

do $$
declare
  v_inv invoices%rowtype;
  v_case collection_cases%rowtype;
  v_ref text;
  v_action text;
begin
  perform pg_temp.fails('Inkasso utan påminnelse', $q$ select pg_temp.open_case('i1', 125000) $q$, 'påminnelse');
  perform pg_temp.remind('i1');
  perform pg_temp.fails('Fel kapital', $q$ select pg_temp.open_case('i1', 100000) $q$, 'Kapitalet');

  v_ref := pg_temp.open_case('i1', 125000)->>'reference';
  if v_ref <> '1-1' then raise exception 'Ärendenumret är % och inte 1-1.', v_ref; end if;
  select * into v_inv from invoices where id = (select v from prov where k = 'i1');
  select * into v_case from collection_cases where invoice_id = v_inv.id;
  if v_inv.collection_case_id is distinct from v_case.id or v_case.status <> 'prepared' or v_case.capital_ore <> 125000
     or v_case.interest_ore <> 1234 or v_case.fees_ore <> 6000 or v_case.interest_to <> pg_temp.today() then
    raise exception 'Ärendet eller fakturans koppling blev fel (%, %).', v_case.status, v_inv.collection_case_id;
  end if;
  select data->>'action' into v_action from events where aggregate_id = v_inv.id and type = 'invoice.collection';
  if v_action is distinct from 'prepared' then raise exception 'Händelsen invoice.collection saknas (%).', v_action; end if;

  -- Hos inkasso: inga påminnelser, ingen andra gång, inget inkassokrav.
  perform pg_temp.fails('Påminnelse hos inkasso', $q$ select pg_temp.remind('i1') $q$, 'hos inkasso', '0A000');
  perform pg_temp.fails('Två ärenden', $q$ select pg_temp.open_case('i1', 125000) $q$, 'redan hos inkasso');
  perform pg_temp.fails('Inkassokrav hos inkasso', $q$ select pg_temp.demand('i1', 18000, pg_temp.today() + 10) $q$, 'redan hos inkasso');
  -- Kolumnerna och tabellen ändras bara av funktionerna.
  perform pg_temp.fails('Koppla loss direkt', $q$ update invoices set collection_case_id = null where id = (select v from prov where k = 'i1') $q$, 'inkassofunktionerna', '0A000');
  perform pg_temp.fails('Inkassokrav direkt i fakturan', $q$ update invoices set collection_demanded_on = current_date where id = (select v from prov where k = 'i2') $q$, 'inkassofunktionerna', '0A000');
  perform pg_temp.fails('Ärende direkt i tabellen', $q$ insert into collection_cases (org_id, invoice_id, reference, capital_ore, interest_to) values ((select v from prov where k = 'a'), (select v from prov where k = 'i1'), 'x', 1, current_date) $q$, null, '42501');
  perform pg_temp.fails('Ändra ärende direkt', $q$ update collection_cases set status = 'closed' $q$, null, '42501');

  -- Skickat till inkassobolaget.
  perform pg_temp.fails('Skickat utan bolag', format($q$ select update_collection_case(%L, 'sent', '  ', '', '', '{"kind":"system","name":"prov"}'::jsonb) $q$, v_case.id), 'inkassobolag');
  perform update_collection_case(v_case.id, 'sent', 'Prov Inkasso AB', 'PI-77', '', '{"kind":"system","name":"prov"}'::jsonb);
  select * into v_case from collection_cases where id = v_case.id;
  if v_case.status <> 'sent' or v_case.sent_at is null or v_case.agency <> 'Prov Inkasso AB' or v_case.external_ref <> 'PI-77' then
    raise exception 'Skickat registrerades inte (%).', v_case.status;
  end if;

  -- Delbetalning: ärendet är kvar. Resten: betald, ärendet stängs i samma transaktion.
  perform pg_temp.pay('i1', 25000);
  select * into v_case from collection_cases where id = v_case.id;
  if v_case.status <> 'sent' then raise exception 'Delbetalningen stängde ärendet.'; end if;
  perform pg_temp.pay('i1', 100000);
  select * into v_inv from invoices where id = v_inv.id;
  select * into v_case from collection_cases where id = v_case.id;
  if v_inv.status <> 'paid' or v_inv.collection_case_id is not null then raise exception 'Betald faktura är kvar hos inkasso.'; end if;
  if v_case.status <> 'paid' or v_case.closed_at is null then raise exception 'Ärendet stängdes inte vid betalning (%).', v_case.status; end if;
  if not exists (select 1 from events where aggregate_id = v_inv.id and type = 'invoice.collection' and data->>'action' = 'paid' and data->>'reference' = '1-1') then
    raise exception 'Händelsen för betalt ärende saknas.';
  end if;
  perform pg_temp.fails('Ändra avslutat ärende', format($q$ select update_collection_case(%L, 'closed', '', '', 'x', '{"kind":"system","name":"prov"}'::jsonb) $q$, v_case.id), 'avslutat');
end $$;

-- Organisation B ser inte A:s ärenden och kan inte lämna A:s fakturor till inkasso.
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000031b1","role":"authenticated","email":"b-agare@prov.se"}';
do $$
begin
  if (select count(*) from collection_cases) <> 0 then raise exception 'B ser A:s inkassoärenden.'; end if;
  perform pg_temp.fails('B lämnar A:s faktura till inkasso', $q$ select pg_temp.open_case('i4', 125000) $q$, null, '42501');
  perform pg_temp.fails('B skickar inkassokrav på A:s faktura', $q$ select pg_temp.demand('i3', 18000, pg_temp.today() + 10) $q$, null, '42501');
end $$;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000031a1","role":"authenticated","email":"a-agare@prov.se"}';

-- ------------------------------------------------------------ faktura 2 och 3: inkassokrav

do $$
declare
  v_inv invoices%rowtype;
  v_rem reminders%rowtype;
  v_n int;
begin
  perform pg_temp.fails('Inkassokrav före förfallodagen', $q$ select pg_temp.demand('i2', 18000, pg_temp.today() + 10) $q$, 'inte förfallen');
  perform pg_temp.fails('Inkasso före förfallodagen', $q$ select pg_temp.open_case('i2', 125000) $q$, 'inte förfallen');
  perform pg_temp.fails('Fem dagars frist', $q$ select pg_temp.demand('i3', 18000, pg_temp.today() + 5) $q$, 'åtta dagar');
  perform pg_temp.fails('För hög inkassoavgift', $q$ select pg_temp.demand('i3', 20000, pg_temp.today() + 10) $q$, '180 kr');
  perform pg_temp.fails('Inkassokrav direkt i påminnelsetabellen', $q$ insert into reminders (org_id, invoice_id, kind, pay_by) values ((select v from prov where k = 'a'), (select v from prov where k = 'i3'), 'demand', current_date + 10) $q$, 'register_collection_demand', '0A000');

  perform pg_temp.demand('i3', 18000, pg_temp.today() + 8);
  select * into v_inv from invoices where id = (select v from prov where k = 'i3');
  select * into v_rem from reminders where invoice_id = v_inv.id;
  if v_inv.reminders <> 1 or v_inv.collection_demanded_on <> pg_temp.today() or v_inv.collection_demand_pay_by <> pg_temp.today() + 8 then
    raise exception 'Inkassokravet syns inte på fakturan.';
  end if;
  if v_rem.kind <> 'demand' or v_rem.fee_ore <> 18000 or v_rem.interest_ore <> 200 or v_rem.pay_by <> pg_temp.today() + 8 then
    raise exception 'Inkassokravet registrerades fel i påminnelsetabellen.';
  end if;
  -- Bokfört som påminnelserna: kundfordran mot 3591 och 8313.
  select count(*) into v_n from journal_lines l join journal_entries e on e.id = l.entry_id
    where e.source_type = 'reminder' and e.source_id = v_rem.id
      and ((l.account = '1510' and l.debit_ore = 18200) or (l.account = '3591' and l.credit_ore = 18000) or (l.account = '8313' and l.credit_ore = 200));
  if v_n <> 3 then raise exception 'Inkassokravet bokfördes inte som påminnelseavgift (% rader).', v_n; end if;
  if not exists (select 1 from events where aggregate_id = v_inv.id and type = 'invoice.collection' and data->>'action' = 'demand' and data->>'payBy' = (pg_temp.today() + 8)::text) then
    raise exception 'Händelsen för inkassokravet saknas.';
  end if;

  perform pg_temp.fails('Påminnelse efter inkassokrav', $q$ select pg_temp.remind('i3') $q$, 'inkassokrav', '0A000');
  perform pg_temp.fails('Två inkassokrav', $q$ select pg_temp.demand('i3', 18000, pg_temp.today() + 10) $q$, 'redan fått ett inkassokrav');
  perform pg_temp.fails('Inkasso före kravets frist', $q$ select pg_temp.open_case('i3', 125000) $q$, 'ger kunden tid');
end $$;

-- ------------------------------------------------------------ faktura 4: återkallat och krediterad

do $$
declare
  v_inv invoices%rowtype;
  v_first uuid;
  v_case collection_cases%rowtype;
begin
  perform pg_temp.remind('i4');
  v_first := (pg_temp.open_case('i4', 125000)->>'id')::uuid;
  perform pg_temp.fails('Avsluta utan orsak', format($q$ select update_collection_case(%L, 'closed', '', '', ' ', '{"kind":"system","name":"prov"}'::jsonb) $q$, v_first), 'varför');
  perform update_collection_case(v_first, 'closed', '', '', 'Kunden har bestridit fakturan, återkallat', '{"kind":"system","name":"prov"}'::jsonb);
  select * into v_inv from invoices where id = (select v from prov where k = 'i4');
  select * into v_case from collection_cases where id = v_first;
  if v_inv.collection_case_id is not null or v_case.status <> 'closed' or v_case.note not like '%återkallat%' then
    raise exception 'Återkallat ärende kopplades inte loss (%).', v_case.status;
  end if;
  -- Ur inkasso kan fakturan påminnas igen och få ett nytt ärende med nästa löpnummer.
  perform pg_temp.remind('i4');
  if (pg_temp.open_case('i4', 125000)->>'reference') <> '4-2' then raise exception 'Andra ärendet fick fel nummer.'; end if;
  -- Krediteras fakturan (mark_invoice_credited sätter status) stängs ärendet.
  update invoices set status = 'credited' where id = v_inv.id;
  select * into v_inv from invoices where id = v_inv.id;
  if v_inv.collection_case_id is not null then raise exception 'Krediterad faktura är kvar hos inkasso.'; end if;
  if (select status from collection_cases where invoice_id = v_inv.id and reference = '4-2') <> 'closed' then
    raise exception 'Ärendet stängdes inte vid kreditering.';
  end if;
  if (select count(*) from collection_cases where invoice_id = v_inv.id) <> 2 then raise exception 'Fel antal ärenden på faktura 4.'; end if;
end $$;

do $$ begin raise notice 'Prov 0031: alla gick igenom'; end $$;

rollback;
