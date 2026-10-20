import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { invoiceDocumentSchema, validateForIssue, type InvoiceDocument, type InvoiceKind } from "../documents/invoice";
import { invoiceTotals } from "./totals";
import { postInvoice, postPayment, type PaymentMethod, type Posting } from "../ledger/posting";
import { ocrFor } from "../ocr";
import { makeEvent, type Actor, type CoreEvent, type EventType } from "../events";
import { todayIso } from "../../quotes/schema";
import { currentOrgId, readOrgId } from "../org/current";
import { currentChart } from "../org/settings-store";

/**
 * The invoices table (supabase/migrations/0014_core.sql) and the functions
 * around it (issue_invoice, register_payment, mark_invoice_sent,
 * mark_invoice_credited in 0014/0015). Read with the admin's session so RLS
 * decides; the state changes go through the database functions so each one
 * is a single transaction. Demo mode replays the same rules in memory,
 * including the ledger, so the admin can be used without Supabase.
 */

import { INVOICE_LIST_TABS, INVOICE_STATUSES, INVOICE_STATUS_LABEL, type InvoiceListTab, type InvoiceStatus } from "./store-types";
export { INVOICE_LIST_TABS, INVOICE_STATUSES, INVOICE_STATUS_LABEL, INVOICE_TAB_LABEL, type InvoiceListTab, type InvoiceStatus } from "./store-types";

export type InvoiceRecord = {
  id: string;
  orgId: string;
  series: string;
  number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  customerId: string | null;
  quoteId: string | null;
  projectId: string | null;
  creditsInvoiceId: string | null;
  document: InvoiceDocument;
  totalOre: number;
  vatOre: number;
  rotOre: number;
  payableOre: number;
  paidOre: number;
  issuedOn: string | null;
  dueOn: string | null;
  ocr: string | null;
  sha256: string | null;
  sentAt: string | null;
  paidAt: string | null;
  remindedAt: string | null;
  reminders: number;
  publicToken: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentRecord = {
  id: string;
  amountOre: number;
  method: PaymentMethod;
  paidOn: string;
  reference: string;
  note: string;
  createdBy: string | null;
  createdAt: string;
};

type Row = {
  id: string;
  org_id?: string;
  series: string;
  number: string | null;
  kind: InvoiceKind;
  status: InvoiceStatus;
  customer_id: string | null;
  quote_id: string | null;
  project_id: string | null;
  credits_invoice_id: string | null;
  document: InvoiceDocument;
  total_ore: number;
  vat_ore: number;
  rot_ore: number;
  payable_ore: number;
  paid_ore: number;
  issued_on: string | null;
  due_on: string | null;
  ocr: string | null;
  sha256: string | null;
  sent_at: string | null;
  paid_at: string | null;
  reminded_at: string | null;
  reminders: number;
  public_token?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

const fromRow = (r: Row): InvoiceRecord => ({
  id: r.id,
  orgId: r.org_id ?? "",
  series: r.series,
  number: r.number,
  kind: r.kind,
  status: INVOICE_STATUSES.includes(r.status) ? r.status : "draft",
  customerId: r.customer_id,
  quoteId: r.quote_id,
  projectId: r.project_id,
  creditsInvoiceId: r.credits_invoice_id,
  document: invoiceDocumentSchema.parse(r.document),
  totalOre: Number(r.total_ore),
  vatOre: Number(r.vat_ore),
  rotOre: Number(r.rot_ore),
  payableOre: Number(r.payable_ore),
  paidOre: Number(r.paid_ore),
  issuedOn: r.issued_on,
  dueOn: r.due_on,
  ocr: r.ocr,
  sha256: r.sha256,
  sentAt: r.sent_at,
  paidAt: r.paid_at,
  remindedAt: r.reminded_at,
  reminders: r.reminders,
  publicToken: r.public_token ?? null,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** A row from the invoices table (or the demo store) as a record, for the full export's paged reads. */
export function invoiceFromRow(row: Record<string, unknown>): InvoiceRecord {
  return fromRow(row as unknown as Row);
}

/** Denormalised columns for a draft, recomputed on every save so lists and the dashboard never parse documents. */
function draftColumns(document: InvoiceDocument) {
  const t = invoiceTotals(document);
  return {
    document,
    total_ore: t.gross,
    vat_ore: t.vat,
    rot_ore: t.rot?.deduction ?? 0,
    payable_ore: t.payable,
    due_on: document.dueDate,
    issued_on: null,
    customer_id: document.buyer.customerId,
  };
}

/** Unpaid and waiting for the customer. A credit note is never "open": it settles the original. */
export function isOpen(inv: Pick<InvoiceRecord, "status" | "kind">): boolean {
  return inv.kind !== "credit" && (inv.status === "issued" || inv.status === "sent" || inv.status === "partially_paid");
}

export function isOverdue(inv: Pick<InvoiceRecord, "status" | "kind" | "dueOn">, today = todayIso()): boolean {
  return isOpen(inv) && !!inv.dueOn && inv.dueOn < today;
}

export function invoiceLabel(inv: Pick<InvoiceRecord, "kind" | "number">): string {
  const word = inv.kind === "credit" ? "Kreditfaktura" : "Faktura";
  return inv.number ? `${word} ${inv.number}` : `${word}, utkast`;
}

export type InvoiceFilters = { tab?: InvoiceListTab; q?: string; customerId?: string; projectId?: string };

export function parseInvoiceFilters(params: Record<string, string | string[] | undefined>): InvoiceFilters {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const tab = one("flik");
  return {
    tab: INVOICE_LIST_TABS.includes(tab as InvoiceListTab) ? (tab as InvoiceListTab) : undefined,
    q: one("q")?.trim().slice(0, 100) || undefined,
    customerId: one("kund") || undefined,
  };
}

export function invoiceFiltersToQuery(f: InvoiceFilters): string {
  const p = new URLSearchParams();
  if (f.tab) p.set("flik", f.tab);
  if (f.q) p.set("q", f.q);
  if (f.customerId) p.set("kund", f.customerId);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function inTab(inv: InvoiceRecord, tab: InvoiceListTab | undefined, today: string): boolean {
  switch (tab) {
    case undefined:
      return true;
    case "draft":
      return inv.status === "draft";
    case "open":
      return isOpen(inv);
    case "overdue":
      return isOverdue(inv, today);
    case "paid":
      return inv.status === "paid";
    case "credited":
      return inv.status === "credited" || inv.kind === "credit";
  }
}

function matchesText(inv: InvoiceRecord, q: string): boolean {
  const hay = [inv.number ?? "", inv.document.buyer.name, inv.document.title, inv.document.buyer.email, inv.ocr ?? ""].join(" ").toLowerCase();
  return hay.includes(q.toLowerCase());
}

/* ---------- demo store ---------- */
type DemoState = {
  invoices: Row[];
  seq: number;
  verSeq: Record<number, number>;
  events: (CoreEvent & { id: string })[];
  payments: (PaymentRecord & { invoiceId: string })[];
  journal: (Posting & { id: string; number: string })[];
};
const g = globalThis as unknown as { __binaafyInvoices?: DemoState };
const demo = (): DemoState =>
  (g.__binaafyInvoices ??= { invoices: [], seq: 10001, verSeq: {}, events: [], payments: [], journal: [] });

function demoEvent(aggregateType: CoreEvent["aggregateType"], aggregateId: string, type: EventType, data: CoreEvent["data"], actor: Actor) {
  demo().events.push({ id: crypto.randomUUID(), ...makeEvent({ orgId: "demo", aggregateType, aggregateId, type, data, actor }) });
}

function demoJournal(posting: Posting): string {
  const year = Number(posting.date.slice(0, 4));
  const n = (demo().verSeq[year] = (demo().verSeq[year] ?? 0) + 1);
  const number = `${year}-${n}`;
  demo().journal.push({ id: crypto.randomUUID(), number, ...posting });
  return number;
}

/* ---------- reads ---------- */

async function loadAll(): Promise<InvoiceRecord[]> {
  if (isDemo()) return demo().invoices.map(fromRow);
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("invoices").select("*");
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(2000);
  if (error) throw new Error(`Kunde inte hämta fakturor: ${error.message}`);
  return (data as Row[]).map(fromRow);
}

export async function listInvoices(f: InvoiceFilters = {}): Promise<InvoiceRecord[]> {
  const today = todayIso();
  return (await loadAll())
    .filter((inv) => inTab(inv, f.tab, today))
    .filter((inv) => !f.customerId || inv.customerId === f.customerId)
    .filter((inv) => !f.projectId || inv.projectId === f.projectId)
    .filter((inv) => !f.q || matchesText(inv, f.q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export type InvoiceCounts = Record<InvoiceListTab | "all", number> & { openOre: number; overdueOre: number };

export async function countInvoices(f: Omit<InvoiceFilters, "tab"> = {}): Promise<InvoiceCounts> {
  const all = await listInvoices({ ...f, tab: undefined });
  const today = todayIso();
  const counts: InvoiceCounts = { all: all.length, draft: 0, open: 0, overdue: 0, paid: 0, credited: 0, openOre: 0, overdueOre: 0 };
  for (const inv of all) {
    for (const tab of INVOICE_LIST_TABS) if (inTab(inv, tab, today)) counts[tab]++;
    if (isOpen(inv)) counts.openOre += inv.payableOre - inv.paidOre;
    if (isOverdue(inv, today)) counts.overdueOre += inv.payableOre - inv.paidOre;
  }
  return counts;
}

export async function getInvoice(id: string): Promise<InvoiceRecord | null> {
  if (isDemo()) {
    const r = demo().invoices.find((x) => x.id === id);
    return r ? fromRow(r) : null;
  }
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("invoices").select("*").eq("id", id);
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(`Kunde inte hämta fakturan: ${error.message}`);
  return data ? fromRow(data as Row) : null;
}

export async function listInvoiceEvents(invoiceId: string): Promise<CoreEvent[]> {
  if (isDemo()) {
    const paymentIds = new Set(demo().payments.filter((p) => p.invoiceId === invoiceId).map((p) => p.id));
    return demo()
      .events.filter((e) => (e.aggregateType === "invoice" && e.aggregateId === invoiceId) || (e.aggregateType === "payment" && paymentIds.has(e.aggregateId)))
      .sort((a, b) => b.at.localeCompare(a.at));
  }
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("events").select("org_id, aggregate_type, aggregate_id, type, data, actor, created_at");
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q
    .or(`and(aggregate_type.eq.invoice,aggregate_id.eq.${invoiceId}),and(aggregate_type.eq.payment,data->>invoice.eq.${invoiceId})`)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Kunde inte hämta händelser: ${error.message}`);
  return (data ?? []).map((r) => ({
    orgId: r.org_id as string,
    aggregateType: r.aggregate_type as CoreEvent["aggregateType"],
    aggregateId: r.aggregate_id as string,
    type: r.type as EventType,
    data: (r.data ?? {}) as CoreEvent["data"],
    actor: r.actor as Actor,
    at: r.created_at as string,
  }));
}

export async function listInvoicePayments(invoiceId: string): Promise<PaymentRecord[]> {
  if (isDemo()) return demo().payments.filter((p) => p.invoiceId === invoiceId);
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("payment_allocations").select("amount_ore, payments(id, method, paid_on, reference, note, created_by, created_at)").eq("invoice_id", invoiceId);
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Kunde inte hämta betalningar: ${error.message}`);
  type Joined = { amount_ore: number; payments: { id: string; method: PaymentMethod; paid_on: string; reference: string; note: string; created_by: string | null; created_at: string } | null };
  return ((data ?? []) as unknown as Joined[])
    .filter((r) => r.payments)
    .map((r) => ({
      id: r.payments!.id,
      amountOre: Number(r.amount_ore),
      method: r.payments!.method,
      paidOn: r.payments!.paid_on,
      reference: r.payments!.reference,
      note: r.payments!.note,
      createdBy: r.payments!.created_by,
      createdAt: r.payments!.created_at,
    }));
}

/* ---------- drafts ---------- */

export async function createInvoice(
  input: { document: InvoiceDocument; quoteId?: string | null; projectId?: string | null; creditsInvoiceId?: string | null },
  createdBy: string | null
): Promise<string> {
  const document = invoiceDocumentSchema.parse({ ...input.document, number: null });
  const cols = draftColumns(document);
  const actor: Actor = createdBy ? { kind: "user", id: createdBy, name: createdBy } : { kind: "system", name: "system" };
  if (isDemo()) {
    const now = new Date().toISOString();
    const row: Row = {
      id: crypto.randomUUID(),
      series: document.series,
      number: null,
      kind: document.kind,
      status: "draft",
      quote_id: input.quoteId ?? null,
      project_id: input.projectId ?? null,
      credits_invoice_id: input.creditsInvoiceId ?? null,
      ...cols,
      paid_ore: 0,
      ocr: null,
      sha256: null,
      sent_at: null,
      paid_at: null,
      reminded_at: null,
      reminders: 0,
      public_token: randomBytes(16).toString("hex"),
      created_by: createdBy,
      created_at: now,
      updated_at: now,
    };
    demo().invoices.push(row);
    demoEvent("invoice", row.id, "invoice.created", { kind: document.kind, quote: document.references.quoteNumber }, actor);
    return row.id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      org_id: await currentOrgId(),
      series: document.series,
      kind: document.kind,
      quote_id: input.quoteId ?? null,
      project_id: input.projectId ?? null,
      credits_invoice_id: input.creditsInvoiceId ?? null,
      ...cols,
      created_by: createdBy,
    })
    .select("id, org_id")
    .single();
  if (error) throw new Error(`Kunde inte skapa fakturan: ${error.message}`);
  await supabase.from("events").insert({
    org_id: data.org_id,
    aggregate_type: "invoice",
    aggregate_id: data.id,
    type: "invoice.created",
    data: { kind: document.kind, quote: document.references.quoteNumber },
    actor,
  });
  return data.id as string;
}

export async function updateInvoiceDraft(id: string, document: InvoiceDocument): Promise<void> {
  const parsed = invoiceDocumentSchema.parse({ ...document, number: null });
  const cols = draftColumns(parsed);
  if (isDemo()) {
    const r = demo().invoices.find((x) => x.id === id);
    if (!r) throw new Error("Fakturan finns inte.");
    if (r.status !== "draft") throw new Error("Fakturan är utfärdad och kan inte ändras.");
    Object.assign(r, cols, { updated_at: new Date().toISOString() });
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("invoices").update(cols).eq("id", id).eq("org_id", await currentOrgId()).eq("status", "draft").select("id");
  if (error) throw new Error(`Kunde inte spara: ${error.message}`);
  if (!data?.length) throw new Error("Kunde inte spara: fakturan är utfärdad, finns inte eller saknar behörighet.");
}

export async function deleteDraft(id: string): Promise<void> {
  if (isDemo()) {
    const r = demo().invoices.find((x) => x.id === id);
    if (r && r.status !== "draft") throw new Error("Utfärdade fakturor tas inte bort. Skapa en kreditfaktura.");
    demo().invoices = demo().invoices.filter((x) => x.id !== id);
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("invoices").delete().eq("id", id).eq("org_id", await currentOrgId()).eq("status", "draft");
  if (error) throw new Error(`Kunde inte ta bort: ${error.message}`);
}

/* ---------- state changes, each one transaction in the database ---------- */

export class IssueError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "IssueError";
  }
}

/** Utfärda: number, frozen document, hash, OCR, journal entry, event.
 *  `prepare` lets the caller refresh the seller block from the settings right before freezing. */
export async function issueInvoice(id: string, actor: Actor, prepare?: (doc: InvoiceDocument) => InvoiceDocument): Promise<{ number: string; ocr: string }> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("Fakturan finns inte.");
  if (inv.status !== "draft") throw new Error(`${invoiceLabel(inv)} är redan utfärdad.`);
  const doc: InvoiceDocument = { ...(prepare ? prepare(inv.document) : inv.document), number: null };
  const problems = validateForIssue(doc);
  if (problems.length) throw new IssueError(problems);
  const totals = invoiceTotals(doc);
  const posting = postInvoice(doc, totals, id, isDemo() ? undefined : await currentChart());
  const totalsJson = { total: totals.gross, vat: totals.vat, rot: totals.rot?.deduction ?? 0, payable: totals.payable };

  if (isDemo()) {
    const r = demo().invoices.find((x) => x.id === id)!;
    const number = String(demo().seq++);
    const ocr = ocrFor(number);
    const frozen: InvoiceDocument = { ...doc, number, paymentMeans: { ...doc.paymentMeans, ocr } };
    const entryNumber = demoJournal({ ...posting, text: posting.text.replace("{number}", number) });
    Object.assign(r, {
      number,
      status: "issued",
      document: frozen,
      ocr,
      issued_on: doc.issueDate,
      due_on: doc.dueDate,
      total_ore: totals.gross,
      vat_ore: totals.vat,
      rot_ore: totals.rot?.deduction ?? 0,
      payable_ore: totals.payable,
      sha256: createHash("sha256").update(JSON.stringify(frozen)).digest("hex"),
      updated_at: new Date().toISOString(),
    });
    demoEvent("invoice", id, "invoice.issued", { number, payable: totals.payable, entry: entryNumber }, actor);
    if (doc.kind === "credit" && inv.creditsInvoiceId) await markCredited(inv.creditsInvoiceId, id, actor);
    return { number, ocr };
  }

  const supabase = await getDb();
  const { data, error } = await supabase.rpc("issue_invoice", {
    p_invoice: id,
    p_document: doc,
    p_totals: totalsJson,
    p_posting: posting,
    p_actor: actor,
  });
  if (error) throw new Error(`Kunde inte utfärda: ${error.message}`);
  const result = data as { number: string; ocr: string };
  if (doc.kind === "credit" && inv.creditsInvoiceId) await markCredited(inv.creditsInvoiceId, id, actor);
  return result;
}

async function markCredited(invoiceId: string, creditId: string, actor: Actor): Promise<void> {
  if (isDemo()) {
    const orig = demo().invoices.find((x) => x.id === invoiceId);
    const credit = demo().invoices.find((x) => x.id === creditId);
    if (!orig || !credit) return;
    if (-credit.payable_ore >= orig.payable_ore - orig.paid_ore) orig.status = "credited";
    demoEvent("invoice", invoiceId, "invoice.credited", { number: orig.number, creditNumber: credit.number, amount: -credit.payable_ore }, actor);
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("mark_invoice_credited", { p_invoice: invoiceId, p_credit: creditId, p_actor: actor });
  if (error) throw new Error(`Kreditfakturan är utfärdad men originalet kunde inte markeras: ${error.message}`);
}

export async function markSent(id: string, to: string, actor: Actor): Promise<void> {
  if (isDemo()) {
    const r = demo().invoices.find((x) => x.id === id);
    if (!r) throw new Error("Fakturan finns inte.");
    if (r.status === "draft") throw new Error("Utfärda fakturan innan den skickas.");
    r.sent_at ??= new Date().toISOString();
    if (r.status === "issued") r.status = "sent";
    r.updated_at = new Date().toISOString();
    demoEvent("invoice", id, "invoice.sent", { number: r.number, to }, actor);
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.rpc("mark_invoice_sent", { p_invoice: id, p_to: to, p_actor: actor });
  if (error) throw new Error(`Kunde inte markera som skickad: ${error.message}`);
}

export async function registerPayment(
  id: string,
  input: { amountOre: number; method: PaymentMethod; paidOn: string; reference?: string; note?: string },
  actor: Actor
): Promise<{ status: InvoiceStatus; paidOre: number }> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("Fakturan finns inte.");
  if (!isOpen(inv) && inv.status !== "paid") throw new Error(`${invoiceLabel(inv)} kan inte ta emot betalningar i status ${INVOICE_STATUS_LABEL[inv.status]}.`);
  if (!Number.isSafeInteger(input.amountOre) || input.amountOre === 0) throw new Error("Beloppet måste vara ett tal, inte noll.");
  const paymentId = crypto.randomUUID();
  const posting = postPayment({
    paymentId,
    amount: input.amountOre,
    method: input.method,
    date: input.paidOn,
    text: `Inbetalning ${invoiceLabel(inv).toLowerCase()} ${inv.document.buyer.name}`,
    dimensions: { projectId: inv.projectId, customerId: inv.customerId },
  }, isDemo() ? undefined : await currentChart());

  if (isDemo()) {
    const r = demo().invoices.find((x) => x.id === id)!;
    const paid = r.paid_ore + input.amountOre;
    const status: InvoiceStatus = paid >= r.payable_ore ? "paid" : paid > 0 ? "partially_paid" : r.status === "paid" ? "issued" : r.status;
    demo().payments.push({
      id: paymentId,
      invoiceId: id,
      amountOre: input.amountOre,
      method: input.method,
      paidOn: input.paidOn,
      reference: input.reference ?? "",
      note: input.note ?? "",
      createdBy: actor.kind === "user" ? actor.name : null,
      createdAt: new Date().toISOString(),
    });
    demoJournal(posting);
    const changed = status !== r.status;
    Object.assign(r, { paid_ore: paid, status, paid_at: status === "paid" ? (r.paid_at ?? new Date().toISOString()) : null, updated_at: new Date().toISOString() });
    demoEvent("payment", paymentId, "payment.received", { invoice: id, number: r.number, amount: input.amountOre, method: input.method, paidOn: input.paidOn }, actor);
    if (changed && (status === "paid" || status === "partially_paid"))
      demoEvent("invoice", id, `invoice.${status}`, { number: r.number, paid, payable: r.payable_ore, amount: input.amountOre, method: input.method }, actor);
    return { status, paidOre: paid };
  }

  const supabase = await getDb();
  const { data, error } = await supabase.rpc("register_payment", {
    p_invoice: id,
    p_amount: input.amountOre,
    p_method: input.method,
    p_paid_on: input.paidOn,
    p_reference: input.reference ?? "",
    p_note: input.note ?? "",
    p_posting: posting,
    p_actor: actor,
  });
  if (error) throw new Error(`Kunde inte registrera betalningen: ${error.message}`);
  const result = data as { status: InvoiceStatus; paid: number };
  return { status: result.status, paidOre: Number(result.paid) };
}

/** The invoices a customer sees in the portal for a project: issued ones, newest first.
 *  RLS (invoices_portal_member) lets a project member read them with their session. */
export async function listInvoicesForPortal(projectId: string): Promise<InvoiceRecord[]> {
  const all = await listInvoices({ projectId });
  return all.filter((inv) => inv.status !== "draft" && inv.status !== "void").sort((a, b) => (b.issuedOn ?? "").localeCompare(a.issuedOn ?? ""));
}

/** A credit note draft that mirrors an issued invoice. Issue it like any invoice. */
export async function createCreditNote(id: string, createdBy: string | null): Promise<string> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("Fakturan finns inte.");
  if (inv.status === "draft") throw new Error("Ett utkast tas bort i stället för att krediteras.");
  if (inv.kind === "credit") throw new Error("En kreditfaktura krediteras inte.");
  const today = todayIso();
  const doc: InvoiceDocument = {
    ...inv.document,
    kind: "credit",
    number: null,
    issueDate: today,
    dueDate: today,
    deliveryDate: null,
    title: `Kreditering av faktura ${inv.number}`,
    note: `Kreditfaktura avseende faktura ${inv.number}${inv.document.title ? `, ${inv.document.title}` : ""}.`,
    references: { ...inv.document.references, precedingInvoiceNumber: inv.number },
    paymentMeans: { ...inv.document.paymentMeans, ocr: null },
  };
  return createInvoice({ document: doc, quoteId: inv.quoteId, projectId: inv.projectId, creditsInvoiceId: inv.id }, createdBy);
}

/** The demo ledger, for the SIE export and the dashboard while there is no database. */
export function demoJournalEntries(): (Posting & { id: string; number: string })[] {
  return isDemo() ? demo().journal : [];
}
