-- Nollställ faktureringen inför skarp drift. KÖRS EN GÅNG, FÖR HAND, i
-- Supabase SQL-editor, av en owner. Tar bort ALLA fakturor, betalningar,
-- verifikationer, ROT-begäran, banktransaktioner, påminnelser, betalplaner,
-- händelser och kunder, och ställer tillbaka nummerserierna till start.
-- Organisationen, medlemskapen, kontoplanen, inställningarna, offerterna och
-- projekten lämnas kvar.
--
-- Utfärdade fakturor och verifikationer skyddas av triggers som vägrar
-- radering; de stängs av under körningen och slås på igen. Allt sker i en
-- transaktion: går något fel händer ingenting.
--
-- Är ni tveksamma: ta en säkerhetskopia (Database → Backups) först.

begin;

alter table invoices        disable trigger invoices_no_delete;
alter table invoices        disable trigger invoices_freeze;
alter table journal_entries disable trigger journal_entries_immutable;
alter table journal_lines   disable trigger journal_lines_immutable;
alter table events          disable trigger events_immutable;

delete from webhook_deliveries;
delete from rot_claim_items;
delete from rot_claims;
delete from rot_buyers;
delete from payment_allocations;
delete from payments;
delete from bank_transactions;
delete from reminders;
delete from journal_lines;
delete from journal_entries;
delete from period_locks;
delete from invoice_lines;
update payment_plan_steps set invoice_id = null;
update change_orders set invoice_id = null where invoice_id is not null;
delete from invoices;
delete from payment_plan_steps;
delete from payment_plans;
delete from recurring_invoices;
delete from idempotency_keys;
delete from events;
update quotes set customer_id = null where customer_id is not null;
delete from customers;

-- Serierna börjar om: F från 10001, V från 1 per år.
delete from number_counters;

alter table invoices        enable trigger invoices_no_delete;
alter table invoices        enable trigger invoices_freeze;
alter table journal_entries enable trigger journal_entries_immutable;
alter table journal_lines   enable trigger journal_lines_immutable;
alter table events          enable trigger events_immutable;

commit;

-- Kontroll efteråt: alla ska vara 0.
select
  (select count(*) from invoices)        as fakturor,
  (select count(*) from journal_entries) as verifikationer,
  (select count(*) from customers)       as kunder,
  (select count(*) from rot_claims)      as rot_begaran,
  (select count(*) from number_counters) as raknare;
