-- Prov för 0030, del 3: verifikationsserien V per räkenskapsår. Körs i
-- Supabase SQL-editor efter 0030 (eller i PGlite). Allt sker i en
-- transaktion som rullas tillbaka. "Prov 0030 räkenskapsår: alla gick
-- igenom" betyder att allt höll.
--
--   A  räkenskapsår 1 juli – 30 juni (sätts efter första verifikationen)
--   B  kalenderår, som förut

begin;

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-8000-0000000031a1', 'a-agare@prov.se', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000031b1', 'b-agare@prov.se', 'authenticated', 'authenticated');

create temp table prov (k text primary key, v uuid) on commit drop;
grant all on prov to authenticated;

-- Ett fakturadokument som issue_invoice() tar emot, med fakturadatum p_date.
create function pg_temp.doc(p_date date) returns jsonb language sql as $$
  select jsonb_build_object(
    'schemaVersion', 1, 'kind', 'invoice', 'series', 'F', 'number', null, 'currency', 'SEK',
    'issueDate', p_date::text, 'dueDate', (p_date + 30)::text, 'deliveryDate', null, 'period', null,
    'title', 'Provfaktura', 'note', '',
    'references', jsonb_build_object('quoteNumber', null, 'projectId', null, 'planStep', null, 'precedingInvoiceNumber', null, 'ourReference', ''),
    'seller', jsonb_build_object('name', 'Prov AB', 'orgNr', '559000-0001', 'vatNr', 'SE559000000101', 'street', 'Gatan 1', 'postalCode', '11122', 'city', 'Stockholm', 'countryCode', 'SE', 'email', '', 'phone', '', 'fSkatt', true),
    'buyer', jsonb_build_object('name', 'Kund AB', 'type', 'foretag', 'orgNr', '556677-8899', 'vatNr', '', 'street', 'Vägen 2', 'postalCode', '12345', 'city', 'Täby', 'countryCode', 'SE', 'email', '', 'phone', '', 'customerId', null, 'reference', ''),
    'lines', jsonb_build_array(jsonb_build_object('id', 'l1', 'description', 'Arbete', 'quantity', 10, 'unit', 'tim', 'unitPriceOre', 10000, 'vatCategory', 'S', 'vatRate', 25, 'kind', 'labor', 'section', '', 'changeOrderId', null)),
    'paymentMeans', jsonb_build_object('bankgiro', '123-4567', 'plusgiro', '', 'iban', '', 'bic', '', 'swish', '', 'ocr', null, 'termsText', '30 dagar netto', 'termsDays', 30),
    'se', jsonb_build_object('reverseCharge', false, 'rot', null, 'lateInterestText', ''))
$$;

-- Utkast och utfärdande i organisationen p_org med fakturadatum p_date; ger fakturans id.
create function pg_temp.issue(p_org text, p_key text, p_date date) returns uuid language plpgsql as $$
declare
  v_id uuid;
begin
  insert into invoices (org_id, series, kind, document, total_ore, vat_ore, payable_ore, due_on)
    values ((select v from prov where k = p_org), 'F', 'invoice', pg_temp.doc(p_date), 125000, 25000, 125000, p_date + 30)
    returning id into v_id;
  insert into prov values (p_key, v_id);
  perform issue_invoice(v_id, pg_temp.doc(p_date), '{"total":125000,"vat":25000,"rot":0,"payable":125000}'::jsonb,
    '{"text":"Faktura {number}","lines":[{"account":"1510","debit":125000,"credit":0},{"account":"3001","debit":0,"credit":100000},{"account":"2611","debit":0,"credit":25000}]}'::jsonb,
    '{"kind":"system","name":"prov"}'::jsonb);
  return v_id;
end $$;

-- Verifikationens etikett "år-nummer" för fakturans utfärdande.
create function pg_temp.entry(p_key text) returns text language sql as $$
  select fiscal_year::text || '-' || number::text from journal_entries
  where source_type = 'invoice' and source_id = (select v from prov where k = p_key)
$$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000031b1","role":"authenticated","email":"b-agare@prov.se"}';
insert into prov values ('b', create_organization('Prov B AB', ''));
select pg_temp.issue('b', 'b1', '2026-07-05');
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000031a1","role":"authenticated","email":"a-agare@prov.se"}';
insert into prov values ('a', create_organization('Prov A AB', ''));

-- En verifikation medan A fortfarande har kalenderår.
select pg_temp.issue('a', 'a0', '2026-05-10');
-- A byter till räkenskapsår 1 juli – 30 juni.
update org_settings set data = data || '{"fiscalYearStart":"07-01"}'::jsonb where org_id = (select v from prov where k = 'a');

select pg_temp.issue('a', 'a1', '2026-06-20');
select pg_temp.issue('a', 'a2', '2026-07-05');
select register_payment((select v from prov where k = 'a2'), 125000, 'bankgiro', '2026-08-01', '', '',
  '{"text":"Inbetalning","lines":[{"account":"1930","debit":125000,"credit":0},{"account":"1510","debit":0,"credit":125000}]}'::jsonb,
  '{"kind":"system","name":"prov"}'::jsonb);
select pg_temp.issue('a', 'a3', '2026-06-25');
select pg_temp.issue('a', 'a4', '2027-06-30');
select pg_temp.issue('a', 'a5', '2027-07-01');

do $$
declare
  v_a uuid := (select v from prov where k = 'a');
  v_b uuid := (select v from prov where k = 'b');
  v_bad text;
  v_n int;
begin
  -- Räkenskapsårets etikett är året det slutar.
  if fiscal_year_of(v_a, '2026-06-30') <> 2026 or fiscal_year_of(v_a, '2026-07-01') <> 2027 or fiscal_year_of(v_a, '2027-06-30') <> 2027 then
    raise exception 'fiscal_year_of räknar fel för brutet räkenskapsår.';
  end if;
  if fiscal_year_of(v_b, '2026-07-01') <> 2026 or fiscal_year_of(v_b, '2026-12-31') <> 2026 then
    raise exception 'fiscal_year_of räknar fel för kalenderår.';
  end if;
  -- Befintlig verifikation orörd; serien börjar om den 1 juli.
  if pg_temp.entry('a0') <> '2026-1' then raise exception 'Verifikationen före bytet ändrades: %', pg_temp.entry('a0'); end if;
  if pg_temp.entry('a1') <> '2026-2' then raise exception 'Juni 2026 fick %, inte 2026-2.', pg_temp.entry('a1'); end if;
  if pg_temp.entry('a2') <> '2027-1' then raise exception 'Juli 2026 fick %, inte 2027-1.', pg_temp.entry('a2'); end if;
  if (select fiscal_year::text || '-' || number::text from journal_entries where org_id = v_a and source_type = 'payment') <> '2027-2' then
    raise exception 'Betalningen i augusti 2026 fick inte 2027-2.';
  end if;
  -- Inget hål i föregående räkenskapsår, fast juli och augusti först tog nummer i kalenderårets räknare.
  if pg_temp.entry('a3') <> '2026-3' then raise exception 'Juni 2026 efter juli fick %, inte 2026-3.', pg_temp.entry('a3'); end if;
  if pg_temp.entry('a4') <> '2027-3' then raise exception '30 juni 2027 fick %, inte 2027-3.', pg_temp.entry('a4'); end if;
  if pg_temp.entry('a5') <> '2028-1' then raise exception '1 juli 2027 fick %, inte 2028-1.', pg_temp.entry('a5'); end if;
  -- Kalenderårsorganisationen som förut.
  if pg_temp.entry('b1') <> '2026-1' then raise exception 'B fick %, inte 2026-1.', pg_temp.entry('b1'); end if;
  -- Räknarna står där serierna slutar.
  select string_agg(year::text || ':' || next::text, ',' order by year) into v_bad from number_counters where org_id = v_a and series = 'V';
  if v_bad <> '2026:4,2027:4,2028:2' then raise exception 'Räknarna för V i A: %', v_bad; end if;
  -- Varje utfärdande loggar verifikationens rättade nummer.
  select string_agg(e.data->>'number' || ' ' || coalesce(e.data->>'entry', '–'), ', ') into v_bad
    from events e join invoices i on i.id = e.aggregate_id
    where e.type = 'invoice.issued' and e.org_id = v_a
      and e.data->>'entry' is distinct from (select fiscal_year::text || '-' || number::text from journal_entries where source_type = 'invoice' and source_id = i.id);
  if v_bad is not null then raise exception 'Händelsen har fel verifikationsnummer: %', v_bad; end if;
  -- Makulering (dagens datum) hamnar i dagens räkenskapsår, och händelsen visar det.
  perform void_invoice((select v from prov where k = 'a5'), 'Prov', '{"kind":"system","name":"prov"}'::jsonb);
  select count(*) into v_n from journal_entries j
    where j.org_id = v_a and j.source_type = 'reversal'
      and j.fiscal_year = fiscal_year_of(v_a, j.entry_date)
      and (select data->>'entry' from events where type = 'invoice.voided' and aggregate_id = (select v from prov where k = 'a5')) = j.fiscal_year::text || '-' || j.number::text;
  if v_n <> 1 then raise exception 'Makuleringens verifikation eller händelse följer inte räkenskapsåret.'; end if;
end $$;

reset role;
do $$ begin raise notice 'Prov 0030 räkenskapsår: alla gick igenom'; end $$;

rollback;
