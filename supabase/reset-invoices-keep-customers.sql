-- Ta bort ALLA fakturor men behåll kunderna. KÖRS FÖR HAND i Supabase
-- SQL-editor av en owner, bara innan skarp drift eller på en testdatabas.
--
-- Tas bort: fakturor med rader, betalningar, kvittningar, banktransaktioner,
-- påminnelser, inkassoärenden, Swish-begäranden, ROT-begäran och ROT-köpare,
-- verifikationer, periodlås, exportjobb, idempotensnycklar och händelseloggen.
-- Nummerserierna ställs tillbaka (nästa faktura får första numret igen).
--
-- Lämnas kvar: organisationer, medlemmar, inställningar, kontoplan, KUNDER,
-- offerter, projekt och betalplaner (deras steg blir "ej fakturerade" igen),
-- återkommande mallar, API-nycklar, webhooks, intresseanmälningar.
--
-- Utfärdade fakturor, verifikationer och händelser skyddas av triggers som
-- vägrar ändring och radering; de stängs av i transaktionen och slås på igen.
-- Går något fel händer ingenting. Ta gärna en säkerhetskopia först
-- (Database → Backups).

begin;

alter table invoices        disable trigger user;
alter table payments        disable trigger user;
alter table journal_entries disable trigger user;
alter table journal_lines   disable trigger user;
alter table events          disable trigger user;

-- Det som hänger på fakturorna, i beroendeordning.
delete from webhook_deliveries;
delete from swish_payment_requests;
delete from rot_claim_items;
delete from rot_claims;
delete from rot_buyers;
update invoices set collection_case_id = null where collection_case_id is not null;
delete from collection_cases;
delete from payment_allocations;
update payments set offsets_payment_id = null where offsets_payment_id is not null;
delete from payments;
delete from bank_transactions;
delete from reminders;
delete from journal_lines;
delete from journal_entries;
delete from period_locks;
delete from invoice_lines;
update payment_plan_steps set invoice_id = null where invoice_id is not null;
update change_orders set invoice_id = null where invoice_id is not null;

-- Fakturornas egna länkar till varandra (kredit, ändring, ersättning, kvittning).
update invoices set
  credits_invoice_id    = null,
  corrects_invoice_id   = null,
  corrected_by          = null,
  replaces_invoice_id   = null,
  offset_from_credit_id = null;
delete from invoices;

delete from export_jobs;
delete from idempotency_keys;
delete from events;

-- Serierna börjar om (F och V). Ta bort raden om numreringen ska fortsätta.
delete from number_counters;

alter table invoices        enable trigger user;
alter table payments        enable trigger user;
alter table journal_entries enable trigger user;
alter table journal_lines   enable trigger user;
alter table events          enable trigger user;

commit;

-- Kontroll efteråt: fakturor och verifikationer 0, kunderna kvar.
select
  (select count(*) from invoices)        as fakturor,
  (select count(*) from journal_entries) as verifikationer,
  (select count(*) from payments)        as betalningar,
  (select count(*) from customers)       as kunder,
  (select count(*) from number_counters) as raknare;
