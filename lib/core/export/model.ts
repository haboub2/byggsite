import type { Customer } from "../customers/schema";
import type { InvoiceRecord } from "../invoices/store";
import type { LedgerEntry, PeriodLock } from "../ledger/period";
import type { PaymentMethod } from "../ledger/posting";
import type { OrgSettings } from "../org/settings";
import type { NumberSeries } from "../org/settings-store";
import type { RecurringRecord } from "../invoices/recurring";
import type { PaymentPlan } from "../plans/schema";
import type { RotClaim } from "../rot/store";
import type { Actor } from "../events";

/**
 * Everything the full export reads for one organisation (docs/fakturering.md,
 * grundkrav 6), as plain records. The loader (load.ts) fills it from the
 * database or the demo store; csv.ts, archive.ts and json.ts turn it into
 * files without touching either, so the tests can build it in memory.
 */

export type ExportOrg = { id: string; name: string; orgNr: string; slug: string };

/** A customer, also one that has been removed from the register. */
export type ExportCustomer = Customer & { deletedAt: string | null };

export type ExportPayment = {
  id: string;
  /** Negative for a refund. */
  amountOre: number;
  currency: string;
  method: PaymentMethod;
  paidOn: string;
  reference: string;
  note: string;
  bankTransactionId: string | null;
  createdBy: string | null;
  createdAt: string;
  /** The invoices the payment settled; usually one. */
  allocations: { invoiceId: string; amountOre: number }[];
};

export type ExportJournalEntry = LedgerEntry & { sourceId: string | null; reversedBy: string | null; createdAt: string | null };

export type ExportReminder = { id: string; invoiceId: string; level: number; feeOre: number; interestOre: number; sentTo: string; sentAt: string; createdBy: string | null };

export type ExportBankTransaction = {
  id: string;
  source: string;
  externalId: string;
  bookedOn: string;
  amountOre: number;
  currency: string;
  reference: string;
  counterpart: string;
  status: string;
  importedAt: string;
};

export type ExportEvent = { id: string; aggregateType: string; aggregateId: string; type: string; data: Record<string, unknown>; actor: Actor; at: string };

export type ExportData = {
  org: ExportOrg;
  settings: OrgSettings;
  numberSeries: NumberSeries[];
  accounts: { number: string; name: string; active: boolean }[];
  customers: ExportCustomer[];
  invoices: InvoiceRecord[];
  payments: ExportPayment[];
  journal: ExportJournalEntry[];
  periodLocks: PeriodLock[];
  reminders: ExportReminder[];
  recurring: RecurringRecord[];
  paymentPlans: PaymentPlan[];
  rotClaims: RotClaim[];
  bankTransactions: ExportBankTransaction[];
  events: ExportEvent[];
};

/** Issued invoices and credit notes, the ones with a number: what the CSV and the PDF archive hold. */
export function issuedInvoices<T extends Pick<InvoiceRecord, "status" | "number" | "series" | "issuedOn" | "createdAt">>(invoices: T[]): T[] {
  return invoices.filter((inv) => inv.status !== "draft" && inv.number).sort(byNumber);
}

/** Series, then number as a number (10002 before 10010), then date. */
export function byNumber(a: Pick<InvoiceRecord, "series" | "number" | "issuedOn" | "createdAt">, b: Pick<InvoiceRecord, "series" | "number" | "issuedOn" | "createdAt">): number {
  return (
    a.series.localeCompare(b.series) ||
    (a.number ?? "").length - (b.number ?? "").length ||
    (a.number ?? "").localeCompare(b.number ?? "") ||
    (a.issuedOn ?? "").localeCompare(b.issuedOn ?? "") ||
    a.createdAt.localeCompare(b.createdAt)
  );
}

/** An optional date interval, inclusive, ISO dates. */
export type DateRange = { from?: string; to?: string };

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && ISO_DATE.test(v);
}

/** `fran` and `till` from the query string; anything that is not a date is ignored. */
export function parseDateRange(params: { get(name: string): string | null }): DateRange {
  const from = params.get("fran");
  const to = params.get("till");
  return { from: isIsoDate(from) ? from : undefined, to: isIsoDate(to) ? to : undefined };
}

export function inRange(date: string | null, range: DateRange = {}): boolean {
  if (!range.from && !range.to) return true;
  if (!date) return false;
  const d = date.slice(0, 10);
  return (!range.from || d >= range.from) && (!range.to || d <= range.to);
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bankgiro: "Bankgiro",
  swish: "Swish",
  card: "Kort",
  manual: "Manuell",
  rot: "ROT (Skatteverket)",
};
