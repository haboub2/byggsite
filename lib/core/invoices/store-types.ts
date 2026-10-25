/**
 * Invoice statuses, list tabs and the rules the lists count by, without the
 * store's server-only imports, so the API schemas and tests can use them.
 */

export const INVOICE_STATUSES = ["draft", "issued", "sent", "partially_paid", "paid", "credited", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Utkast",
  issued: "Utfärdad",
  sent: "Skickad",
  partially_paid: "Delbetald",
  paid: "Betald",
  credited: "Krediterad",
  void: "Makulerad",
};
/** The tabs in the list: statuses plus the derived "förfallen". */
export const INVOICE_LIST_TABS = ["draft", "open", "overdue", "paid", "credited"] as const;
export type InvoiceListTab = (typeof INVOICE_LIST_TABS)[number];
export const INVOICE_TAB_LABEL: Record<InvoiceListTab, string> = {
  draft: "Utkast",
  open: "Obetalda",
  overdue: "Förfallna",
  paid: "Betalda",
  credited: "Krediterade/makulerade",
};

type Listed = { status: string; kind: string };

/**
 * Issued and carrying its own amounts: not a draft, not voided, and not a
 * change invoice, which repeats its original's amounts while the original
 * keeps the receivable and the payments. What turnover, VAT and project
 * figures sum over.
 */
export function isBooked(inv: Listed): boolean {
  return inv.status !== "draft" && inv.status !== "void" && inv.kind !== "correction";
}

/** Unpaid and waiting for the customer. A credit note settles the original and a change invoice is paid as its original, so only invoices are open. */
export function isOpen(inv: Listed): boolean {
  return inv.kind === "invoice" && (inv.status === "issued" || inv.status === "sent" || inv.status === "partially_paid");
}

/**
 * Paid more than it asks for: after Rätta belopp moved a payment to a lower
 * invoice, or after an overpayment. The excess goes back to the customer
 * with Registrera återbetalning (a negative payment). A credited original
 * waiting for its replacement is not counted: its payment moves on issue.
 */
export function refundDue(inv: Listed & { payableOre: number; paidOre: number }): number {
  if (inv.kind !== "invoice" || inv.status === "draft" || inv.status === "void" || inv.status === "credited") return 0;
  return Math.max(0, inv.paidOre - inv.payableOre);
}

/**
 * An invoice that counts as invoiced on a project or payment plan: issued,
 * an invoice (not a credit note or change invoice), and not voided or
 * credited. After Rätta belopp only the replacing invoice counts, so the
 * plan never counts the original and its replacement both.
 */
export function countsAsInvoiced(inv: Listed): boolean {
  return inv.kind === "invoice" && inv.status !== "draft" && inv.status !== "void" && inv.status !== "credited";
}

export function isOverdue(inv: Listed & { dueOn: string | null }, today: string): boolean {
  return isOpen(inv) && !!inv.dueOn && inv.dueOn < today;
}

export function inTab(inv: Listed & { dueOn: string | null }, tab: InvoiceListTab | undefined, today: string): boolean {
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
      return inv.status === "credited" || inv.status === "void" || inv.kind === "credit";
  }
}

export type InvoiceCounts = Record<InvoiceListTab | "all", number> & { openOre: number; overdueOre: number; refundCount: number; refundOre: number };

/** The tab counts and the open, overdue and to-refund sums above the list. */
export function countInvoiceList(all: (Listed & { dueOn: string | null; payableOre: number; paidOre: number })[], today: string): InvoiceCounts {
  const counts: InvoiceCounts = { all: all.length, draft: 0, open: 0, overdue: 0, paid: 0, credited: 0, openOre: 0, overdueOre: 0, refundCount: 0, refundOre: 0 };
  for (const inv of all) {
    for (const tab of INVOICE_LIST_TABS) if (inTab(inv, tab, today)) counts[tab]++;
    if (isOpen(inv)) counts.openOre += inv.payableOre - inv.paidOre;
    if (isOverdue(inv, today)) counts.overdueOre += inv.payableOre - inv.paidOre;
    const refund = refundDue(inv);
    if (refund > 0) {
      counts.refundCount++;
      counts.refundOre += refund;
    }
  }
  return counts;
}
