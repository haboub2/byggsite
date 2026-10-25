import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { INVOICE_KIND_LABEL, invoiceDocumentSchema, validateForIssue, type InvoiceDocument, type InvoiceKind, type InvoiceOffset } from "../documents/invoice";
import { invoiceTotals } from "./totals";
import { postInvoice, postOffset, postPayment, reversal, type PaymentMethod, type PaymentSource, type Posting } from "../ledger/posting";
import { correctionDocument, type CorrectionEdits } from "./correction";
import { ocrFor } from "../ocr";
import { formatOre } from "../money";
import { makeEvent, type Actor, type CoreEvent, type EventType } from "../events";
import { todayIso } from "../../quotes/schema";
import { currentOrgId, readOrgId } from "../org/current";
import { currentChart } from "../org/settings-store";
import { fiscalYearLabel, type OrgSettings } from "../org/settings";
import { getCustomer } from "../customers/store";
import { recipientsText, resolveRecipients, type Recipients } from "./recipients";
import { demoMovePlanInvoice } from "../plans/store";

/**
 * The invoices table (supabase/migrations/0014_core.sql) and the functions
 * around it (issue_invoice, register_payment, mark_invoice_sent,
 * mark_invoice_credited in 0014/0015; void_invoice and
 * issue_correction_invoice in 0025; issue_replacement_invoice in 0028). Read with the admin's session so RLS
 * decides; the state changes go through the database functions so each one
 * is a single transaction. Demo mode replays the same rules in memory,
 * including the ledger, so the admin can be used without Supabase.
 */

import { INVOICE_LIST_TABS, INVOICE_STATUSES, INVOICE_STATUS_LABEL, countInvoiceList, inTab, isOpen, type InvoiceCounts, type InvoiceListTab, type InvoiceStatus } from "./store-types";
export { INVOICE_LIST_TABS, INVOICE_STATUSES, INVOICE_STATUS_LABEL, INVOICE_TAB_LABEL, countsAsInvoiced, isBooked, isOpen, refundDue, type InvoiceCounts, type InvoiceListTab, type InvoiceStatus } from "./store-types";

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
  /** Set when the invoice was voided (makulerad) with void_invoice. */
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  /** On an original: its latest change invoice. */
  correctedBy: string | null;
  /** On a change invoice: the original it corrects. */
  correctsInvoiceId: string | null;
  /** On an invoice from Rätta belopp: the credited original it replaces (0028). */
  replacesInvoiceId: string | null;
  /** On an invoice from Rätta belopp: the credit note its original's payments are offset against (0028). */
  offsetFromCreditId: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PaymentRecord = {
  id: string;
  /** On this invoice; an offset moves a payment with -X on the original and +X on its replacement. */
  amountOre: number;
  method: PaymentSource;
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
  voided_at?: string | null;
  voided_by?: string | null;
  void_reason?: string | null;
  corrected_by?: string | null;
  corrects_invoice_id?: string | null;
  replaces_invoice_id?: string | null;
  offset_from_credit_id?: string | null;
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
  voidedAt: r.voided_at ?? null,
  voidedBy: r.voided_by ?? null,
  voidReason: r.void_reason ?? null,
  correctedBy: r.corrected_by ?? null,
  correctsInvoiceId: r.corrects_invoice_id ?? null,
  replacesInvoiceId: r.replaces_invoice_id ?? null,
  offsetFromCreditId: r.offset_from_credit_id ?? null,
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

export function isOverdue(inv: Pick<InvoiceRecord, "status" | "kind" | "dueOn">, today = todayIso()): boolean {
  return isOpen(inv) && !!inv.dueOn && inv.dueOn < today;
}

export function invoiceLabel(inv: Pick<InvoiceRecord, "kind" | "number">): string {
  const word = INVOICE_KIND_LABEL[inv.kind] ?? "Faktura";
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
  // Numbered per fiscal year, as the database does since 0030; the demo has one organisation's settings.
  const settings = Object.values((globalThis as unknown as { __binaafyOrgSettings?: Record<string, OrgSettings> }).__binaafyOrgSettings ?? {})[0];
  const year = fiscalYearLabel(posting.date, settings?.fiscalYearStart);
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

export async function countInvoices(f: Omit<InvoiceFilters, "tab"> = {}): Promise<InvoiceCounts> {
  return countInvoiceList(await listInvoices({ ...f, tab: undefined }), todayIso());
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
  type Joined = { amount_ore: number; payments: { id: string; method: PaymentSource; paid_on: string; reference: string; note: string; created_by: string | null; created_at: string } | null };
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
  input: {
    document: InvoiceDocument;
    quoteId?: string | null;
    projectId?: string | null;
    creditsInvoiceId?: string | null;
    /** Rätta belopp: the credited original this draft replaces, and the credit note its payments are offset against. */
    replacesInvoiceId?: string | null;
    offsetFromCreditId?: string | null;
  },
  createdBy: string | null
): Promise<string> {
  // Only sent when set, so drafts are created as before against a database without 0028.
  const replacement = input.replacesInvoiceId ? { replaces_invoice_id: input.replacesInvoiceId, offset_from_credit_id: input.offsetFromCreditId ?? null } : {};
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
      voided_at: null,
      voided_by: null,
      void_reason: null,
      corrected_by: null,
      corrects_invoice_id: null,
      replaces_invoice_id: null,
      offset_from_credit_id: null,
      ...replacement,
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
      ...replacement,
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
  const blocked = await deleteBlocker(id);
  if (blocked) throw new Error(blocked);
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

let offsetColumns = false;
/**
 * Whether the database has 0028 (replaces_invoice_id and the offset), so
 * Rätta belopp can link the draft and move payments. Checked once per
 * process until it is there; demo mode always has it.
 */
export async function supportsOffset(): Promise<boolean> {
  if (isDemo() || offsetColumns) return true;
  const supabase = await getDb();
  const { error } = await supabase.from("invoices").select("replaces_invoice_id").limit(1);
  offsetColumns = !error;
  return offsetColumns;
}

/**
 * Why a draft cannot be deleted, or null. A draft from Rätta belopp on a
 * paid invoice carries that payment: the original is credited and the money
 * moves to this invoice when it is issued, so deleting it would strand the
 * payment on a credited invoice.
 */
export async function deleteBlocker(id: string): Promise<string | null> {
  const inv = await getInvoice(id);
  if (!inv?.replacesInvoiceId || inv.status !== "draft") return null;
  const original = await getInvoice(inv.replacesInvoiceId);
  if (!original || original.paidOre === 0) return null;
  return `Utkastet ersätter faktura ${original.number}, som kunden har betalat ${formatOre(original.paidOre, { decimals: 0, currency: true })} på. Betalningen flyttas hit när utkastet utfärdas, så det kan inte tas bort. Rätta raderna och utfärda det.`;
}

/* ---------- state changes, each one transaction in the database ---------- */

export class IssueError extends Error {
  constructor(public readonly problems: string[]) {
    super(problems.join(" "));
    this.name = "IssueError";
  }
}

/** Utfärda: number, frozen document, hash, OCR, journal entry, event.
 *  `prepare` lets the caller refresh the seller block from the settings right before freezing.
 *  A draft from Rätta belopp is issued with issue_replacement_invoice (0028), which in the same
 *  transaction moves the original's payments here (se.offset on the document, an offset entry). */
export async function issueInvoice(id: string, actor: Actor, prepare?: (doc: InvoiceDocument) => InvoiceDocument): Promise<{ number: string; ocr: string }> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("Fakturan finns inte.");
  if (inv.status !== "draft") throw new Error(`${invoiceLabel(inv)} är redan utfärdad.`);
  const replacing = inv.replacesInvoiceId ? await replacementOf(inv) : null;
  const prepared = prepare ? prepare(inv.document) : inv.document;
  const se = await withRecipients(prepared, inv.customerId);
  if (replacing?.offset) se.offset = replacing.offset;
  else delete se.offset;
  const doc: InvoiceDocument = { ...prepared, number: null, se };
  const problems = validateForIssue(doc);
  if (problems.length) throw new IssueError(problems);
  const chart = isDemo() ? undefined : await currentChart();
  const totals = invoiceTotals(doc);
  const posting = postInvoice(doc, totals, id, chart);
  const totalsJson = { total: totals.gross, vat: totals.vat, rot: totals.rot?.deduction ?? 0, payable: totals.payable };
  const offsetPosting = replacing?.offset
    ? postOffset(
        {
          invoiceId: id,
          amount: replacing.offset.amountOre,
          date: doc.issueDate,
          fromNumber: replacing.offset.invoiceNumber,
          toNumber: "{number}",
          creditNumber: replacing.offset.creditNumber,
          dimensions: { projectId: doc.references.projectId, customerId: doc.buyer.customerId },
        },
        chart
      )
    : null;

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
    if (replacing) demoReplace(r, replacing.original.id, replacing.offset, offsetPosting, actor);
    return { number, ocr };
  }

  const supabase = await getDb();
  const { data, error } = replacing
    ? await supabase.rpc("issue_replacement_invoice", {
        p_invoice: id,
        p_document: doc,
        p_totals: totalsJson,
        p_posting: posting,
        // Only used when the original has payments; the function checks it against them.
        p_offset_posting: offsetPosting ?? { text: "", lines: [] },
        p_actor: actor,
      })
    : await supabase.rpc("issue_invoice", {
        p_invoice: id,
        p_document: doc,
        p_totals: totalsJson,
        p_posting: posting,
        p_actor: actor,
      });
  if (error) throw new Error(`Kunde inte utfärda: ${error.message}`);
  const result = data as { number: string; ocr: string };
  if (doc.kind === "credit" && inv.creditsInvoiceId) await markCredited(inv.creditsInvoiceId, id, actor);
  return { number: result.number, ocr: result.ocr };
}

/**
 * The credited original a Rätta belopp draft replaces, and the payment that
 * moves from it when the draft is issued (null when nothing was paid). The
 * database checks the same in issue_replacement_invoice.
 */
export async function replacementOf(inv: Pick<InvoiceRecord, "replacesInvoiceId" | "offsetFromCreditId">): Promise<{ original: InvoiceRecord; offset: InvoiceOffset | null }> {
  const original = inv.replacesInvoiceId ? await getInvoice(inv.replacesInvoiceId) : null;
  if (!original) throw new Error("Fakturan som ersätts finns inte.");
  if (original.status !== "credited") throw new Error(`Faktura ${original.number} är inte krediterad. Kreditera den innan den ersätts.`);
  if (original.paidOre === 0) return { original, offset: null };
  const credit = inv.offsetFromCreditId ? await getInvoice(inv.offsetFromCreditId) : null;
  if (!credit?.number || credit.creditsInvoiceId !== original.id)
    throw new Error(`Faktura ${original.number} har betalningar, men kreditfakturan som de kvittas mot saknas.`);
  return { original, offset: { invoiceNumber: original.number ?? "", creditNumber: credit.number, amountOre: original.paidOre } };
}

/** Demo mode's issue_replacement_invoice after the issue: plan links, and the offset when the original was paid. */
function demoReplace(r: Row, originalId: string, offset: InvoiceOffset | null, offsetPosting: Posting | null, actor: Actor): void {
  const orig = demo().invoices.find((x) => x.id === originalId)!;
  demoMovePlanInvoice(orig.id, r.id, r.document.lines.flatMap((l) => (l.changeOrderId ? [l.changeOrderId] : [])));
  if (!offset || !offsetPosting) return;
  const number = r.number ?? "";
  const now = new Date().toISOString();
  const note = `Kvittning: betalning flyttad från faktura ${orig.number} till faktura ${number} (kreditfaktura ${offset.creditNumber})`;
  // One offset per payment on the original: -X there, +X here, no money.
  const perPayment = new Map<string, number>();
  for (const p of demo().payments) if (p.invoiceId === orig.id) perPayment.set(p.id, (perPayment.get(p.id) ?? 0) + p.amountOre);
  for (const amount of perPayment.values()) {
    if (amount === 0) continue;
    const base = { id: crypto.randomUUID(), method: "offset" as const, paidOn: r.issued_on ?? todayIso(), reference: orig.number ?? "", note, createdBy: actor.kind === "user" ? actor.name : null, createdAt: now };
    demo().payments.push({ ...base, invoiceId: orig.id, amountOre: -amount }, { ...base, invoiceId: r.id, amountOre: amount });
  }
  const moved = offset.amountOre;
  const status: InvoiceStatus = moved >= r.payable_ore ? "paid" : moved > 0 ? "partially_paid" : r.status;
  Object.assign(orig, { paid_ore: orig.paid_ore - moved, updated_at: now });
  Object.assign(r, { paid_ore: moved, status, paid_at: status === "paid" ? now : null, updated_at: now });
  const entry = demoJournal({
    ...offsetPosting,
    text: offsetPosting.text.replace("{number}", number),
    lines: offsetPosting.lines.map((l) => (l.text ? { ...l, text: l.text.replace("{number}", number) } : l)),
  });
  demoEvent("invoice", orig.id, "invoice.offset", { number: orig.number, toNumber: number, to: r.id, creditNumber: offset.creditNumber, amount: moved, entry }, actor);
  demoEvent("invoice", r.id, "invoice.offset", { number, fromNumber: orig.number, from: orig.id, creditNumber: offset.creditNumber, amount: moved, payable: r.payable_ore, entry }, actor);
  if (status === "paid" || status === "partially_paid")
    demoEvent("invoice", r.id, `invoice.${status}`, { number, paid: moved, payable: r.payable_ore, amount: moved, method: "offset" }, actor);
}

/** The document's `se` with the customer's current mailing lists frozen in (lib/core/invoices/recipients.ts). */
async function withRecipients(doc: InvoiceDocument, customerId: string | null): Promise<InvoiceDocument["se"]> {
  const id = customerId ?? doc.buyer.customerId;
  const customer = id ? await getCustomer(id) : null;
  const recipients = resolveRecipients(customer, doc.buyer.email);
  const se = { ...doc.se };
  if (recipients.to.length || recipients.cc.length) se.recipients = recipients;
  else delete se.recipients;
  return se;
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

/**
 * Mark as sent and log invoice.sent. `to` is the recipient list of a mailing
 * (logged in full) or free text for one handed over some other way ("post").
 */
export async function markSent(id: string, to: string | Recipients, actor: Actor): Promise<void> {
  const recipients = typeof to === "string" ? null : to;
  const toText = typeof to === "string" ? to : recipientsText(to);
  if (isDemo()) {
    const r = demo().invoices.find((x) => x.id === id);
    if (!r) throw new Error("Fakturan finns inte.");
    if (r.status === "draft") throw new Error("Utfärda fakturan innan den skickas.");
    if (r.status === "void") throw new Error(`${invoiceLabel(fromRow(r))} är makulerad och skickas inte.`);
    r.sent_at ??=new Date().toISOString();
    if (r.status === "issued") r.status = "sent";
    r.updated_at = new Date().toISOString();
    demoEvent("invoice", id, "invoice.sent", { number: r.number, to: toText, ...(recipients ? { recipients } : {}) }, actor);
    return;
  }
  const supabase = await getDb();
  // p_recipients only when there is a list, so marking by hand also works against the function before 0026.
  const { error } = await supabase.rpc("mark_invoice_sent", { p_invoice: id, p_to: toText, p_actor: actor, ...(recipients ? { p_recipients: recipients } : {}) });
  if (error) throw new Error(`Kunde inte markera som skickad: ${error.message}`);
}

export async function registerPayment(
  id: string,
  input: { amountOre: number; method: PaymentMethod; paidOn: string; reference?: string; note?: string },
  actor: Actor
): Promise<{ status: InvoiceStatus; paidOre: number }> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("Fakturan finns inte.");
  if (inv.kind === "correction") {
    // The original keeps the receivable; a payment on its change invoice is stopped (also in register_payment, 0025).
    throw new Error(`${invoiceLabel(inv)} tar inte emot betalningar. Registrera betalningen på faktura ${inv.document.references.precedingInvoiceNumber ?? ""}.`);
  }
  if (!isOpen(inv) && inv.status !== "paid") throw new Error(`${invoiceLabel(inv)} kan inte ta emot betalningar i status ${INVOICE_STATUS_LABEL[inv.status]}.`);
  if (!Number.isSafeInteger(input.amountOre) || input.amountOre === 0) throw new Error("Beloppet måste vara ett tal, inte noll.");
  const paymentId = crypto.randomUUID();
  const posting = postPayment({
    paymentId,
    amount: input.amountOre,
    method: input.method,
    date: input.paidOn,
    text: `${input.amountOre < 0 ? "Återbetalning" : "Inbetalning"} ${invoiceLabel(inv).toLowerCase()} ${inv.document.buyer.name}`,
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

/** A credit note draft that mirrors an issued invoice (with the details of its latest change invoice). Issue it like any invoice. */
export async function createCreditNote(id: string, createdBy: string | null): Promise<string> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("Fakturan finns inte.");
  if (inv.status === "draft") throw new Error("Ett utkast tas bort i stället för att krediteras.");
  if (inv.status === "void") throw new Error(`${invoiceLabel(inv)} är makulerad och krediteras inte.`);
  if (inv.kind === "credit") throw new Error("En kreditfaktura krediteras inte.");
  if (inv.kind === "correction") throw new Error(`${invoiceLabel(inv)} har inga egna belopp. Kreditera faktura ${inv.document.references.precedingInvoiceNumber ?? ""} i stället.`);
  const today = todayIso();
  const doc: InvoiceDocument = {
    ...(await effectiveDocument(inv)),
    correctionNote: undefined,
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

/**
 * The document as it stands after any change invoices: the latest change
 * invoice's, or the invoice's own. Amounts are the same either way; names,
 * addresses and references follow the correction.
 */
export async function effectiveDocument(inv: InvoiceRecord): Promise<InvoiceDocument> {
  return (await correctionBase(inv)).document;
}

/* ---------- corrections (0025) ---------- */

/**
 * Makulera: an issued invoice that never reached the customer and has no
 * payments, ROT claim, credit note, change invoice or reminder. Keeps its
 * number, gets a reversing entry dated today ("Makulering av faktura N",
 * BFNAR 2013:2 punkt 2.17–2.18) and is locked as void.
 */
export async function voidInvoice(id: string, reason: string, actor: Actor): Promise<{ number: string; entryNumber: string }> {
  const why = reason.trim();
  if (!why) throw new Error("Ange varför fakturan makuleras.");
  if (why.length > 500) throw new Error("Orsaken får vara högst 500 tecken.");
  if (isDemo()) {
    const r = demo().invoices.find((x) => x.id === id);
    if (!r) throw new Error("Fakturan finns inte.");
    const label = invoiceLabel(fromRow(r));
    if (r.kind !== "invoice") throw new Error(`${label} kan inte makuleras.`);
    if (r.status === "draft") throw new Error("Ett utkast tas bort i stället för att makuleras.");
    if (r.status === "void") throw new Error(`${label} är redan makulerad.`);
    if (r.paid_ore !== 0 || demo().payments.some((p) => p.invoiceId === id)) throw new Error(`${label} har registrerade betalningar och kan inte makuleras. Rätta den med kreditfaktura.`);
    const credit = demo().invoices.find((x) => x.credits_invoice_id === id);
    if (credit) throw new Error(`${label} har en kreditfaktura (${credit.number ?? "utkast"}) och kan inte makuleras.`);
    if (r.corrected_by) throw new Error(`${label} är rättad med en ändringsfaktura och kan inte makuleras.`);
    if (r.reminders > 0) throw new Error(`${label} har påminnelser och kan inte makuleras.`);
    if (r.status !== "issued" || r.sent_at) throw new Error(`${label} är skickad till kunden och kan inte makuleras. Rätta den med ändringsfaktura eller kreditfaktura.`);
    const issued = demo().journal.find((e) => e.source.type === "invoice" && e.source.id === id);
    if (!issued) throw new Error(`Utfärdandets verifikation för ${label.toLowerCase()} saknas.`);
    const entryNumber = demoJournal({ ...reversal(issued, todayIso(), why), text: `Makulering av faktura ${r.number}` });
    Object.assign(r, { status: "void", voided_at: new Date().toISOString(), voided_by: actor.name, void_reason: why, updated_at: new Date().toISOString() });
    demoEvent("invoice", id, "invoice.voided", { number: r.number, reason: why, entry: entryNumber, reverses: issued.number }, actor);
    return { number: r.number ?? "", entryNumber };
  }
  const supabase = await getDb();
  const { data, error } = await supabase.rpc("void_invoice", { p_invoice: id, p_reason: why, p_actor: actor });
  if (error) throw new Error(`Kunde inte makulera: ${error.message}`);
  const result = data as { number: string; entryNumber: string; entryId?: string };
  // The function's own number is the calendar year's; with a broken fiscal year 0030 renumbers the entry, so read it back.
  if (result.entryId) {
    const { data: entry } = await supabase.from("journal_entries").select("fiscal_year, number").eq("id", result.entryId).maybeSingle();
    if (entry) return { number: result.number, entryNumber: `${entry.fiscal_year}-${entry.number}` };
  }
  return { number: result.number, entryNumber: result.entryNumber };
}

/** What a change invoice for `inv` starts from: the latest version of the details, and the earlier change invoice's number. */
export async function correctionBase(inv: InvoiceRecord): Promise<{ document: InvoiceDocument; previousNumber: string | null }> {
  if (!inv.correctedBy) return { document: inv.document, previousNumber: null };
  const latest = await getInvoice(inv.correctedBy);
  return latest ? { document: latest.document, previousNumber: latest.number } : { document: inv.document, previousNumber: null };
}

/** Why `inv` cannot get a change invoice, or null when it can. */
export function correctionBlocker(inv: Pick<InvoiceRecord, "kind" | "status" | "number">): string | null {
  if (inv.kind === "credit") return "En kreditfaktura rättas inte med ändringsfaktura.";
  if (inv.kind === "correction") return "Rätta originalfakturan, inte ändringsfakturan.";
  if (inv.status === "draft") return "Ett utkast ändras direkt.";
  if (inv.status === "void") return `Faktura ${inv.number} är makulerad och kan inte rättas.`;
  if (inv.status === "credited") return `Faktura ${inv.number} är krediterad och kan inte rättas med ändringsfaktura.`;
  return null;
}

/**
 * Rätta uppgifter: issue a change invoice with the next number that repeats
 * the invoice with corrected details, refers to it and keeps its OCR and due
 * date. No journal entry; the original keeps the amounts and the payments
 * and is marked corrected_by.
 */
export async function issueCorrection(id: string, edits: CorrectionEdits, actor: Actor): Promise<{ id: string; number: string; changes: string[] }> {
  const inv = await getInvoice(id);
  if (!inv) throw new Error("Fakturan finns inte.");
  const blocked = correctionBlocker(inv);
  if (blocked) throw new Error(blocked);
  const base = await correctionBase(inv);
  const { document, changes } = correctionDocument(base.document, edits, { originalNumber: inv.number ?? "", previousNumber: base.previousNumber, issueDate: todayIso() });
  const parsed = invoiceDocumentSchema.parse(document);

  if (isDemo()) {
    const r = demo().invoices.find((x) => x.id === id)!;
    const number = String(demo().seq++);
    const frozen: InvoiceDocument = { ...parsed, number, dueDate: r.due_on ?? parsed.dueDate, paymentMeans: { ...parsed.paymentMeans, ocr: r.ocr } };
    const now = new Date().toISOString();
    const row: Row = {
      ...r,
      id: crypto.randomUUID(),
      number,
      kind: "correction",
      status: "issued",
      credits_invoice_id: null,
      corrects_invoice_id: r.id,
      corrected_by: null,
      document: frozen,
      paid_ore: 0,
      issued_on: frozen.issueDate,
      sha256: createHash("sha256").update(JSON.stringify(frozen)).digest("hex"),
      sent_at: null,
      paid_at: null,
      reminded_at: null,
      reminders: 0,
      public_token: randomBytes(16).toString("hex"),
      created_by: actor.name,
      created_at: now,
      updated_at: now,
    };
    demo().invoices.push(row);
    Object.assign(r, { corrected_by: row.id, updated_at: now });
    const text = changes.join("; ");
    demoEvent("invoice", r.id, "invoice.corrected", { number: r.number, correctionNumber: number, correction: row.id, previous: base.previousNumber, changes: text }, actor);
    demoEvent("invoice", row.id, "invoice.corrected", { number, corrects: r.number, original: r.id, previous: base.previousNumber, changes: text }, actor);
    return { id: row.id, number, changes };
  }

  const supabase = await getDb();
  const { data, error } = await supabase.rpc("issue_correction_invoice", { p_original: id, p_document: parsed, p_changes: changes.join("; "), p_actor: actor });
  if (error) throw new Error(`Kunde inte utfärda ändringsfakturan: ${error.message}`);
  const result = data as { id: string; number: string };
  return { id: result.id, number: result.number, changes };
}

/** The demo ledger, for the SIE export and the dashboard while there is no database. */
export function demoJournalEntries(): (Posting & { id: string; number: string })[] {
  return isDemo() ? demo().journal : [];
}
