import { ore, sumOre, type Ore } from "../money";
import type { InvoiceDocument } from "../documents/invoice";
import type { InvoiceTotals } from "../invoices/totals";

/**
 * The ledger under the invoice (docs/fakturering.md, grundkrav 2). Every
 * event that moves money becomes a balanced journal entry, computed here as
 * a pure function and written by the database in the same transaction as
 * the event. Nothing is shown as "bookkeeping" yet; the SIE export is a
 * serialisation of these entries, and a bookkeeping module later reads them.
 *
 * Sign convention inside this module: `entry(account, amount)` with a
 * positive amount is a debit, negative a credit. A credit note's totals are
 * already negative, so the same construction mirrors every line.
 */

export type AccountNumber = string;

export type ChartOfAccounts = {
  /** 1510 Kundfordringar */
  receivables: AccountNumber;
  /** 1513 Kundfordringar ROT, what Skatteverket will pay */
  rotReceivable: AccountNumber;
  /** 1930 Företagskonto */
  bank: AccountNumber;
  /** Sales per VAT rate: 3001 25 %, 3002 12 %, 3003 6 %, 3004 momsfri */
  sales: Record<25 | 12 | 6 | 0, AccountNumber>;
  /** 3231 Försäljning byggtjänster, omvänd betalningsskyldighet */
  salesReverseCharge: AccountNumber;
  /** Output VAT per rate: 2611, 2621, 2631 */
  vat: Record<25 | 12 | 6, AccountNumber>;
  /** 3740 Öres- och kronutjämning */
  rounding: AccountNumber;
  /** 3591 Påminnelseavgifter */
  reminderFee: AccountNumber;
  /** 8313 Ränteintäkter kundfordringar */
  lateInterest: AccountNumber;
};

/** BAS defaults. Editable per organisation in org_settings. */
export const DEFAULT_CHART: ChartOfAccounts = {
  receivables: "1510",
  rotReceivable: "1513",
  bank: "1930",
  sales: { 25: "3001", 12: "3002", 6: "3003", 0: "3004" },
  salesReverseCharge: "3231",
  vat: { 25: "2611", 12: "2621", 6: "2631" },
  rounding: "3740",
  reminderFee: "3591",
  lateInterest: "8313",
};

export const DEFAULT_ACCOUNT_NAMES: Record<AccountNumber, string> = {
  "1510": "Kundfordringar",
  "1513": "Kundfordringar ROT, Skatteverket",
  "1930": "Företagskonto",
  "2611": "Utgående moms 25 %",
  "2621": "Utgående moms 12 %",
  "2631": "Utgående moms 6 %",
  "3001": "Försäljning 25 %",
  "3002": "Försäljning 12 %",
  "3003": "Försäljning 6 %",
  "3004": "Försäljning momsfri",
  "3231": "Försäljning byggtjänster, omvänd betalningsskyldighet",
  "3591": "Påminnelseavgifter",
  "3740": "Öres- och kronutjämning",
  "8313": "Ränteintäkter kundfordringar",
};

export type Dimensions = { projectId?: string | null; customerId?: string | null };

export type JournalLine = {
  account: AccountNumber;
  debit: Ore;
  credit: Ore;
  text?: string;
  dimensions?: Dimensions;
};

export type PostingSource =
  | { type: "invoice"; id: string }
  | { type: "credit"; id: string }
  | { type: "payment"; id: string }
  | { type: "reminder"; id: string }
  | { type: "reversal"; id: string; reverses: string };

export type Posting = {
  /** Accounting date. */
  date: string;
  text: string;
  source: PostingSource;
  lines: JournalLine[];
};

export class UnbalancedPostingError extends Error {
  constructor(public readonly debit: Ore, public readonly credit: Ore) {
    super(`Verifikationen balanserar inte: debet ${debit} öre, kredit ${credit} öre.`);
    this.name = "UnbalancedPostingError";
  }
}

/** Throws unless debits equal credits and every line is a plain debit or credit. */
export function assertBalanced(lines: JournalLine[]): void {
  if (lines.length === 0) throw new UnbalancedPostingError(0, 0);
  for (const l of lines) {
    ore(l.debit);
    ore(l.credit);
    if (l.debit < 0 || l.credit < 0) throw new RangeError(`Konto ${l.account}: debet och kredit kan inte vara negativa.`);
    if (l.debit > 0 && l.credit > 0) throw new RangeError(`Konto ${l.account}: en rad är antingen debet eller kredit.`);
  }
  const debit = sumOre(lines.map((l) => l.debit));
  const credit = sumOre(lines.map((l) => l.credit));
  if (debit !== credit) throw new UnbalancedPostingError(debit, credit);
}

/** A line from a signed amount: positive debits the account, negative credits it. Zero is dropped. */
function entry(account: AccountNumber, amount: Ore, dimensions?: Dimensions, text?: string): JournalLine | null {
  ore(amount);
  if (amount === 0) return null;
  return { account, debit: amount > 0 ? amount : 0, credit: amount < 0 ? -amount : 0, ...(dimensions ? { dimensions } : {}), ...(text ? { text } : {}) };
}

function compact(lines: (JournalLine | null)[]): JournalLine[] {
  const out = lines.filter((l): l is JournalLine => l !== null);
  assertBalanced(out);
  return out;
}

function vatAccount(chart: ChartOfAccounts, rate: number): AccountNumber {
  if (rate === 25 || rate === 12 || rate === 6) return chart.vat[rate];
  throw new RangeError(`Ingen momskonto för satsen ${rate} %.`);
}

function salesAccount(chart: ChartOfAccounts, category: string, rate: number): AccountNumber {
  if (category === "AE") return chart.salesReverseCharge;
  if (rate === 25 || rate === 12 || rate === 6 || rate === 0) return chart.sales[rate];
  throw new RangeError(`Inget försäljningskonto för satsen ${rate} %.`);
}

/**
 * Issued invoice or credit note. Debit the receivable with what the customer
 * pays, debit the ROT receivable with what Skatteverket pays, credit sales
 * per rate and VAT per rate, and let rounding land on 3740. A credit note's
 * negative totals mirror all of it.
 */
export function postInvoice(doc: InvoiceDocument, totals: InvoiceTotals, invoiceId: string, chart: ChartOfAccounts = DEFAULT_CHART): Posting {
  const dims: Dimensions = { projectId: doc.references.projectId, customerId: doc.buyer.customerId };
  const label = doc.kind === "credit" ? "Kreditfaktura" : "Faktura";
  const lines = compact([
    entry(chart.receivables, totals.payable, dims),
    entry(chart.rotReceivable, totals.rot?.deduction ?? 0, dims),
    ...totals.vatBreakdown.map((row) => entry(salesAccount(chart, row.category, row.rate), -row.taxable, dims)),
    ...totals.vatBreakdown.filter((row) => row.vat !== 0).map((row) => entry(vatAccount(chart, row.rate), -row.vat, dims)),
    entry(chart.rounding, -totals.rounding, dims),
  ]);
  return {
    date: doc.issueDate,
    // A draft has no number yet; issue_invoice() in the database fills the placeholder.
    text: `${label} ${doc.number ?? "{number}"} ${doc.buyer.name}`.replace(/\s+/g, " ").trim(),
    source: { type: doc.kind === "credit" ? "credit" : "invoice", id: invoiceId },
    lines,
  };
}

export type PaymentMethod = "bankgiro" | "swish" | "card" | "manual" | "rot";

/**
 * Money in. A customer payment settles the receivable; a payout from
 * Skatteverket (method "rot") settles the ROT receivable. A negative amount
 * is a refund and mirrors.
 */
export function postPayment(
  input: { paymentId: string; amount: Ore; method: PaymentMethod; date: string; text?: string; dimensions?: Dimensions },
  chart: ChartOfAccounts = DEFAULT_CHART
): Posting {
  const settles = input.method === "rot" ? chart.rotReceivable : chart.receivables;
  return {
    date: input.date,
    text: input.text ?? (input.method === "rot" ? "Utbetalning ROT från Skatteverket" : "Inbetalning"),
    source: { type: "payment", id: input.paymentId },
    lines: compact([entry(chart.bank, input.amount, input.dimensions), entry(settles, -input.amount, input.dimensions)]),
  };
}

/** A reminder that adds a fee and/or interest to the receivable. */
export function postReminder(
  input: { reminderId: string; fee: Ore; interest: Ore; date: string; text?: string; dimensions?: Dimensions },
  chart: ChartOfAccounts = DEFAULT_CHART
): Posting {
  return {
    date: input.date,
    text: input.text ?? "Påminnelseavgift och dröjsmålsränta",
    source: { type: "reminder", id: input.reminderId },
    lines: compact([
      entry(chart.receivables, input.fee + input.interest, input.dimensions),
      entry(chart.reminderFee, -input.fee, input.dimensions),
      entry(chart.lateInterest, -input.interest, input.dimensions),
    ]),
  };
}

/** The only way to undo a posting: a new one with debit and credit swapped. */
export function reversal(original: Posting & { id: string }, date: string, reason: string): Posting {
  return {
    date,
    text: `Vändning av ${original.text}: ${reason}`,
    source: { type: "reversal", id: original.id, reverses: original.id },
    lines: original.lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit })),
  };
}

/** Net movement per account, debit positive. Handy for tests and for the dashboard's VAT box. */
export function balancesByAccount(postings: Posting[]): Record<AccountNumber, Ore> {
  const out: Record<AccountNumber, Ore> = {};
  for (const p of postings) for (const l of p.lines) out[l.account] = (out[l.account] ?? 0) + l.debit - l.credit;
  return out;
}
