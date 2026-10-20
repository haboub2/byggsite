/**
 * Invoice statuses and list tabs, without the store's server-only imports,
 * so the API schemas and tests can use them.
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
  void: "Annullerad",
};
/** The tabs in the list: statuses plus the derived "förfallen". */
export const INVOICE_LIST_TABS = ["draft", "open", "overdue", "paid", "credited"] as const;
export type InvoiceListTab = (typeof INVOICE_LIST_TABS)[number];
export const INVOICE_TAB_LABEL: Record<InvoiceListTab, string> = {
  draft: "Utkast",
  open: "Obetalda",
  overdue: "Förfallna",
  paid: "Betalda",
  credited: "Krediterade",
};
