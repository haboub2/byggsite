import "server-only";
import { asSystem, getDb } from "../db";
import { isDemo } from "../../leads";
import type { Customer } from "../customers/schema";
import { makeEvent, type Actor, type CoreEvent, type EventType } from "../events";
import { invoiceFromRow, type InvoiceRecord, type PaymentRecord } from "../invoices/store";
import { listRecurring } from "../invoices/recurring";
import { listAccounts, listJournalEntries, listPeriodLocks } from "../ledger/store";
import type { PaymentMethod } from "../ledger/posting";
import { DEMO_ORG_ID, listMyMemberships } from "../org/current";
import { getOrgSettings, listNumberSeries } from "../org/settings-store";
import { listBankTransactions } from "../payments/store";
import type { PaymentPlan, PaymentPlanStep } from "../plans/schema";
import { listClaims } from "../rot/store";
import type { ExportBankTransaction, ExportCustomer, ExportData, ExportEvent, ExportJournalEntry, ExportOrg, ExportPayment, ExportReminder } from "./model";

/**
 * Reads everything the full export needs for one organisation. The route
 * handlers have already checked the role (requireRole("read")); the reads
 * run with the user's session, so RLS decides as everywhere else, and are
 * filtered on the organisation explicitly. Each table is read in pages of
 * 1 000, the most Supabase returns per request, so nothing is cut off at a
 * list limit. Demo mode reads the in-memory stores.
 */

const PAGE = 1000;

type Row = Record<string, unknown>;

async function selectAll(table: string, columns: string, orgId: string, order: string[]): Promise<Row[]> {
  const supabase = await getDb();
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select(columns).eq("org_id", orgId);
    for (const column of order) q = q.order(column);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(`Kunde inte läsa ${table}: ${error.message}`);
    const rows = (data ?? []) as unknown as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number => Number(v ?? 0);
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/* ---------- demo stores (globalThis, as the stores keep them) ---------- */

type DemoInvoices = { invoices: Row[]; payments: (PaymentRecord & { invoiceId: string })[]; events: (CoreEvent & { id: string })[] };
const g = globalThis as unknown as {
  __binaafyCustomers?: Row[];
  __binaafyInvoices?: DemoInvoices;
  __binaafyPlans?: { plans: Row[]; steps: Row[] };
};

/* ---------- customers ---------- */

const customerFromRow = (r: Row): ExportCustomer => ({
  id: str(r.id),
  type: r.type as Customer["type"],
  name: str(r.name),
  company: str(r.company),
  orgNr: str(r.org_nr),
  vatNr: str(r.vat_nr),
  email: str(r.email),
  phone: str(r.phone),
  street: str(r.street),
  postalCode: str(r.postal_code),
  city: str(r.city),
  reference: str(r.reference),
  peppolId: str(r.peppol_id),
  defaultTermsDays: num(r.default_terms_days),
  notes: str(r.notes),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  deletedAt: strOrNull(r.deleted_at),
});

/** Every customer, removed ones included. */
export async function loadCustomers(orgId: string): Promise<ExportCustomer[]> {
  if (isDemo()) return (g.__binaafyCustomers ?? []).map(customerFromRow);
  return (await selectAll("customers", "*", orgId, ["created_at", "id"])).map(customerFromRow);
}

/* ---------- invoices ---------- */

/** Every invoice, drafts included; the CSV and the archive pick the issued ones. */
export async function loadInvoices(orgId: string): Promise<InvoiceRecord[]> {
  if (isDemo()) return (g.__binaafyInvoices?.invoices ?? []).map(invoiceFromRow);
  return (await selectAll("invoices", "*", orgId, ["created_at", "id"])).map(invoiceFromRow);
}

/* ---------- payments ---------- */

export async function loadPayments(orgId: string): Promise<ExportPayment[]> {
  if (isDemo()) {
    return (g.__binaafyInvoices?.payments ?? []).map((p) => ({
      id: p.id,
      amountOre: p.amountOre,
      currency: "SEK",
      method: p.method,
      paidOn: p.paidOn,
      reference: p.reference,
      note: p.note,
      bankTransactionId: null,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
      allocations: [{ invoiceId: p.invoiceId, amountOre: p.amountOre }],
    }));
  }
  const [payments, allocations] = await Promise.all([
    selectAll("payments", "id, amount_ore, currency, method, paid_on, reference, note, bank_transaction_id, created_by, created_at", orgId, ["paid_on", "id"]),
    selectAll("payment_allocations", "id, payment_id, invoice_id, amount_ore", orgId, ["created_at", "id"]),
  ]);
  const byPayment = new Map<string, { invoiceId: string; amountOre: number }[]>();
  for (const a of allocations) {
    const list = byPayment.get(str(a.payment_id)) ?? [];
    list.push({ invoiceId: str(a.invoice_id), amountOre: num(a.amount_ore) });
    byPayment.set(str(a.payment_id), list);
  }
  return payments.map((p) => ({
    id: str(p.id),
    amountOre: num(p.amount_ore),
    currency: str(p.currency) || "SEK",
    method: p.method as PaymentMethod,
    paidOn: str(p.paid_on),
    reference: str(p.reference),
    note: str(p.note),
    bankTransactionId: strOrNull(p.bank_transaction_id),
    createdBy: strOrNull(p.created_by),
    createdAt: str(p.created_at),
    allocations: byPayment.get(str(p.id)) ?? [],
  }));
}

/* ---------- the rest, for the JSON ---------- */

async function loadOrg(orgId: string): Promise<ExportOrg> {
  if (isDemo()) {
    const m = (await listMyMemberships())[0];
    return { id: DEMO_ORG_ID, name: m?.name ?? "Demo AB", orgNr: m?.orgNr ?? "", slug: m?.slug ?? "demo" };
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("organizations").select("id, name, org_nr, slug").eq("id", orgId).maybeSingle();
  if (error || !data) throw new Error(`Kunde inte läsa organisationen: ${error?.message ?? "finns inte"}`);
  return { id: str(data.id), name: str(data.name), orgNr: str(data.org_nr), slug: str(data.slug) };
}

async function loadJournal(orgId: string): Promise<ExportJournalEntry[]> {
  if (isDemo()) return (await listJournalEntries({ from: "1900-01-01", to: "9999-12-31" })).map((e) => ({ ...e, sourceId: null, reversedBy: null, createdAt: null }));
  const rows = await selectAll(
    "journal_entries",
    "id, series, fiscal_year, number, entry_date, text, source_type, source_id, reversed_by, created_at, journal_lines(id, account, debit_ore, credit_ore, text)",
    orgId,
    ["entry_date", "series", "fiscal_year", "number", "id"]
  );
  return rows.map((r) => ({
    id: str(r.id),
    series: str(r.series),
    fiscalYear: num(r.fiscal_year),
    number: num(r.number),
    date: str(r.entry_date),
    text: str(r.text),
    sourceType: str(r.source_type),
    sourceId: strOrNull(r.source_id),
    reversedBy: strOrNull(r.reversed_by),
    createdAt: strOrNull(r.created_at),
    lines: ((r.journal_lines ?? []) as Row[])
      .sort((a, b) => str(a.id).localeCompare(str(b.id)))
      .map((l) => ({ account: str(l.account), debit: num(l.debit_ore), credit: num(l.credit_ore), text: strOrNull(l.text) })),
  }));
}

async function loadAccounts(orgId: string): Promise<ExportData["accounts"]> {
  if (isDemo()) return (await listAccounts()).map((a) => ({ ...a, active: true }));
  return (await selectAll("accounts", "number, name, active", orgId, ["number"])).map((a) => ({ number: str(a.number), name: str(a.name), active: a.active !== false }));
}

async function loadReminders(orgId: string): Promise<ExportReminder[]> {
  if (isDemo()) return [];
  return (await selectAll("reminders", "id, invoice_id, level, fee_ore, interest_ore, sent_to, sent_at, created_by", orgId, ["sent_at", "id"])).map((r) => ({
    id: str(r.id),
    invoiceId: str(r.invoice_id),
    level: num(r.level),
    feeOre: num(r.fee_ore),
    interestOre: num(r.interest_ore),
    sentTo: str(r.sent_to),
    sentAt: str(r.sent_at),
    createdBy: strOrNull(r.created_by),
  }));
}

const stepFromRow = (r: Row): PaymentPlanStep => ({
  id: str(r.id),
  planId: str(r.plan_id),
  sort: num(r.sort),
  label: str(r.label),
  phaseId: strOrNull(r.phase_id),
  percent: numOrNull(r.percent),
  amountOre: numOrNull(r.amount_ore),
  laborShare: numOrNull(r.labor_share),
  dueRule: r.due_rule as PaymentPlanStep["dueRule"],
  dueOn: strOrNull(r.due_on),
  invoiceId: strOrNull(r.invoice_id),
  createdAt: str(r.created_at),
});

async function loadPaymentPlans(orgId: string): Promise<PaymentPlan[]> {
  const [plans, steps] = isDemo()
    ? [g.__binaafyPlans?.plans ?? [], g.__binaafyPlans?.steps ?? []]
    : await Promise.all([selectAll("payment_plans", "*", orgId, ["created_at", "id"]), selectAll("payment_plan_steps", "*", orgId, ["plan_id", "sort", "id"])]);
  return plans.map((p) => ({
    id: str(p.id),
    projectId: strOrNull(p.project_id),
    quoteId: strOrNull(p.quote_id),
    kind: p.kind === "phases" ? "phases" : "fixed",
    createdAt: str(p.created_at),
    steps: steps.filter((s) => s.plan_id === p.id).map(stepFromRow),
  }));
}

async function loadBankTransactions(orgId: string): Promise<ExportBankTransaction[]> {
  if (isDemo())
    return (await listBankTransactions()).map((t) => ({ id: t.id, source: t.source, externalId: t.externalId, bookedOn: t.bookedOn, amountOre: t.amountOre, currency: t.currency, reference: t.reference, counterpart: t.counterpart, status: t.status, importedAt: t.importedAt }));
  return (await selectAll("bank_transactions", "id, source, external_id, booked_on, amount_ore, currency, reference, counterpart, status, imported_at", orgId, ["booked_on", "id"])).map((t) => ({
    id: str(t.id),
    source: str(t.source),
    externalId: str(t.external_id),
    bookedOn: str(t.booked_on),
    amountOre: num(t.amount_ore),
    currency: str(t.currency) || "SEK",
    reference: str(t.reference),
    counterpart: str(t.counterpart),
    status: str(t.status),
    importedAt: str(t.imported_at),
  }));
}

async function loadEvents(orgId: string): Promise<ExportEvent[]> {
  if (isDemo())
    return (g.__binaafyInvoices?.events ?? []).map((e) => ({ id: e.id, aggregateType: e.aggregateType, aggregateId: e.aggregateId, type: e.type, data: e.data, actor: e.actor, at: e.at }));
  return (await selectAll("events", "id, aggregate_type, aggregate_id, type, data, actor, created_at", orgId, ["created_at", "id"])).map((e) => ({
    id: str(e.id),
    aggregateType: str(e.aggregate_type),
    aggregateId: str(e.aggregate_id),
    type: str(e.type),
    data: (e.data ?? {}) as Record<string, unknown>,
    actor: e.actor as Actor,
    at: str(e.created_at),
  }));
}

/** Everything, for the JSON export. */
export async function loadExportData(orgId: string): Promise<ExportData> {
  const settingsOrg = isDemo() ? DEMO_ORG_ID : orgId;
  const [org, settings, numberSeries, accounts, customers, invoices, payments, journal, periodLocks, reminders, recurring, paymentPlans, rotClaims, bankTransactions, events] = await Promise.all([
    loadOrg(orgId),
    getOrgSettings(settingsOrg),
    listNumberSeries(settingsOrg),
    loadAccounts(orgId),
    loadCustomers(orgId),
    loadInvoices(orgId),
    loadPayments(orgId),
    loadJournal(orgId),
    listPeriodLocks(),
    loadReminders(orgId),
    listRecurring(),
    loadPaymentPlans(orgId),
    listClaims(),
    loadBankTransactions(orgId),
    loadEvents(orgId),
  ]);
  return { org, settings, numberSeries, accounts, customers, invoices, payments, journal, periodLocks, reminders, recurring, paymentPlans, rotClaims, bankTransactions, events };
}

/** The organisation's name for file names. */
export async function exportOrgName(orgId: string): Promise<string> {
  return (await loadOrg(orgId)).name;
}

/**
 * Log a download in events (aggregate_type "export"). Readers (accountant,
 * readonly) may download but not insert events under RLS, so the row is
 * written as the system, for the organisation the route already checked.
 */
export async function logExport(orgId: string, type: Extract<EventType, `export.${string}`>, data: CoreEvent["data"], actor: Actor): Promise<void> {
  const aggregateId = crypto.randomUUID();
  if (isDemo()) {
    g.__binaafyInvoices?.events.push({ id: crypto.randomUUID(), ...makeEvent({ orgId: "demo", aggregateType: "export", aggregateId, type, data, actor }) });
    return;
  }
  try {
    await asSystem(async () => {
      const supabase = await getDb();
      const { error } = await supabase.from("events").insert({ org_id: orgId, aggregate_type: "export", aggregate_id: aggregateId, type, data, actor });
      if (error) throw new Error(error.message);
    }, orgId);
  } catch (err) {
    console.error(`[export] could not log ${type}:`, err instanceof Error ? err.message : err);
  }
}
