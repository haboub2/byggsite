import "server-only";
import { getDb } from "../db";
import { isDemo } from "../../leads";
import { invoiceDocumentSchema, type InvoiceDocument } from "../documents/invoice";
import type { Actor } from "../events";
import { invoiceTotals } from "./totals";
import { createInvoice, getInvoice, issueInvoice } from "./store";
import { applySellerDefaults, getSellerDefaults } from "./seller";
import { nextOccurrence, recurringDocument, templateFromInvoice, RECURRING_INTERVALS, type RecurringInterval } from "./recurring-schedule";

/**
 * Recurring invoices (recurring_invoices in 0014), for the 01 division's
 * monthly agreements. A row is a template document plus when it next runs.
 * The daily cron calls runDueRecurring(): every active template due today or
 * earlier becomes a draft (or an issued invoice when auto_issue is set) and
 * moves one interval forward. Templates are not bookkeeping, so they may be
 * paused, changed and removed; the invoices they made stay.
 */

export type RecurringRecord = {
  id: string;
  customerId: string;
  name: string;
  template: InvoiceDocument;
  interval: RecurringInterval;
  nextOn: string;
  autoIssue: boolean;
  active: boolean;
  createdAt: string;
  /** Payable per invoice, öre, from the template. */
  payableOre: number;
};

type Row = {
  id: string;
  customer_id: string;
  name: string;
  template: InvoiceDocument;
  interval: RecurringInterval;
  next_on: string;
  auto_issue: boolean;
  active: boolean;
  created_at: string;
};

const fromRow = (r: Row): RecurringRecord => {
  const template = invoiceDocumentSchema.parse(r.template);
  return {
    id: r.id,
    customerId: r.customer_id,
    name: r.name,
    template,
    interval: RECURRING_INTERVALS.includes(r.interval) ? r.interval : "monthly",
    nextOn: r.next_on,
    autoIssue: r.auto_issue,
    active: r.active,
    createdAt: r.created_at,
    payableOre: invoiceTotals(template).payable,
  };
};

const g = globalThis as unknown as { __binaafyRecurring?: Row[] };
const demo = () => (g.__binaafyRecurring ??= []);

export async function listRecurring(): Promise<RecurringRecord[]> {
  if (isDemo()) return demo().map(fromRow).sort((a, b) => a.nextOn.localeCompare(b.nextOn));
  const supabase = await getDb();
  const { data, error } = await supabase.from("recurring_invoices").select("*").order("active", { ascending: false }).order("next_on");
  if (error) throw new Error(`Kunde inte hämta återkommande fakturor: ${error.message}`);
  return ((data ?? []) as Row[]).map(fromRow);
}

export type RecurringInput = { name: string; interval: RecurringInterval; nextOn: string; autoIssue: boolean };

/** A template from an invoice (draft or issued). The buyer must be in the customer register. */
export async function createRecurringFromInvoice(invoiceId: string, input: RecurringInput): Promise<string> {
  const inv = await getInvoice(invoiceId);
  if (!inv) throw new Error("Fakturan finns inte.");
  if (inv.kind === "credit") throw new Error("En kreditfaktura kan inte bli återkommande.");
  const customerId = inv.document.buyer.customerId ?? inv.customerId;
  if (!customerId) throw new Error("Fakturans köpare finns inte i kundregistret. Välj kunden på fakturan först.");
  if (!RECURRING_INTERVALS.includes(input.interval)) throw new Error("Okänt intervall.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextOn)) throw new Error("Ange nästa datum.");
  const template = templateFromInvoice(inv.document);
  const name = input.name.trim().slice(0, 120) || inv.document.title || inv.document.buyer.name;
  const row = { customer_id: customerId, name, template, interval: input.interval, next_on: input.nextOn, auto_issue: input.autoIssue, active: true };
  if (isDemo()) {
    const id = crypto.randomUUID();
    demo().push({ id, ...row, created_at: new Date().toISOString() });
    return id;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("recurring_invoices").insert(row).select("id").single();
  if (error) throw new Error(`Kunde inte spara: ${error.message}`);
  return data.id as string;
}

export async function setRecurringActive(id: string, active: boolean): Promise<void> {
  if (isDemo()) {
    const r = demo().find((x) => x.id === id);
    if (r) r.active = active;
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("recurring_invoices").update({ active }).eq("id", id);
  if (error) throw new Error(`Kunde inte spara: ${error.message}`);
}

export async function deleteRecurring(id: string): Promise<void> {
  if (isDemo()) {
    g.__binaafyRecurring = demo().filter((x) => x.id !== id);
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("recurring_invoices").delete().eq("id", id);
  if (error) throw new Error(`Kunde inte ta bort: ${error.message}`);
}

/** Move next_on from `from` to `to`, only if it still is `from`: a second run the same day skips the row. */
async function claim(id: string, from: string, to: string): Promise<boolean> {
  if (isDemo()) {
    const r = demo().find((x) => x.id === id);
    if (!r || r.next_on !== from) return false;
    r.next_on = to;
    return true;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("recurring_invoices").update({ next_on: to }).eq("id", id).eq("next_on", from).select("id");
  if (error) throw new Error(`Kunde inte flytta nästa datum: ${error.message}`);
  return Boolean(data?.length);
}

export type RecurringRun = {
  created: { recurring: string; name: string; invoiceId: string; number: string | null; occurrence: string; nextOn: string }[];
  failed: { recurring: string; name: string; error: string }[];
};

/**
 * Every active template with next_on on or before `today` makes one invoice
 * and moves one interval. A template far behind catches up one interval per
 * run, so a paused agreement never floods the customer in one morning.
 */
export async function runDueRecurring(today: string, actor: Actor): Promise<RecurringRun> {
  const due = (await listRecurring()).filter((r) => r.active && r.nextOn <= today);
  const out: RecurringRun = { created: [], failed: [] };
  if (!due.length) return out;
  const defaults = await getSellerDefaults();
  const createdBy = actor.kind === "user" ? actor.name : null;
  for (const r of due) {
    const nextOn = nextOccurrence(r.nextOn, r.interval);
    let invoiceId: string | null = null;
    try {
      if (!(await claim(r.id, r.nextOn, nextOn))) continue;
      const document = applySellerDefaults(recurringDocument(r.template, r.nextOn, r.interval, today), defaults);
      invoiceId = await createInvoice({ document, projectId: document.references.projectId }, createdBy);
      let number: string | null = null;
      if (r.autoIssue) number = (await issueInvoice(invoiceId, actor, (doc) => applySellerDefaults(doc, defaults))).number;
      out.created.push({ recurring: r.id, name: r.name, invoiceId, number, occurrence: r.nextOn, nextOn });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // No invoice made: give the date back so the next run tries again.
      if (!invoiceId) await claim(r.id, nextOn, r.nextOn).catch(() => false);
      out.failed.push({ recurring: r.id, name: r.name, error: invoiceId ? `Utkastet är skapat men kunde inte utfärdas: ${message}` : message });
    }
  }
  return out;
}
