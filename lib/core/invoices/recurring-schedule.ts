import { invoiceDocumentSchema, type InvoiceDocument } from "../documents/invoice";
import { addDays } from "../rules";

/**
 * Recurring invoices (01: monthly agreements). The pure part: when the next
 * one is due, and the draft a template becomes on a given day. The store
 * (recurring.ts) and the daily cron use these.
 */

export const RECURRING_INTERVALS = ["monthly", "quarterly", "yearly"] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];
export const RECURRING_INTERVAL_LABEL: Record<RecurringInterval, string> = { monthly: "Varje månad", quarterly: "Varje kvartal", yearly: "Varje år" };
const MONTHS: Record<RecurringInterval, number> = { monthly: 1, quarterly: 3, yearly: 12 };

const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The date one interval later. A day the target month lacks becomes its
 * last day (31 jan → 28 feb), and the last day of a month stays the last
 * day (28 feb → 31 mar), so an agreement billed at month end stays there.
 */
export function nextOccurrence(date: string, interval: RecurringInterval): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) throw new RangeError(`Datum skrivs ÅÅÅÅ-MM-DD, fick "${date}".`);
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const index = year * 12 + (month - 1) + MONTHS[interval];
  const ty = Math.floor(index / 12);
  const tm = (index % 12) + 1;
  const last = lastDay(ty, tm);
  const td = day === lastDay(year, month) ? last : Math.min(day, last);
  return `${ty}-${String(tm).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}

/**
 * The draft a template becomes when it runs: issued today, due after the
 * template's terms, for the period from the occurrence to the day before
 * the next one (BG-14, printed as the invoicing period). No number, no OCR.
 */
export function recurringDocument(template: InvoiceDocument, occurrence: string, interval: RecurringInterval, issueDate: string): InvoiceDocument {
  return invoiceDocumentSchema.parse({
    ...template,
    kind: "invoice",
    number: null,
    issueDate,
    dueDate: addDays(issueDate, template.paymentMeans.termsDays),
    deliveryDate: null,
    period: { start: occurrence, end: addDays(nextOccurrence(occurrence, interval), -1) },
    references: { ...template.references, precedingInvoiceNumber: null, planStep: null },
    paymentMeans: { ...template.paymentMeans, ocr: null },
  });
}

/** A template from an invoice: the document without what is per invoice. */
export function templateFromInvoice(doc: InvoiceDocument): InvoiceDocument {
  return invoiceDocumentSchema.parse({
    ...doc,
    kind: "invoice",
    number: null,
    deliveryDate: null,
    period: null,
    references: { ...doc.references, precedingInvoiceNumber: null, planStep: null },
    paymentMeans: { ...doc.paymentMeans, ocr: null },
    // Change orders and ROT belong to one job, not to an agreement.
    se: { ...doc.se, rot: null },
    lines: doc.lines.map((l) => ({ ...l, changeOrderId: null })),
  });
}
