import { CUSTOMER_TYPE_LABEL, INVOICE_KIND_LABEL } from "../documents/invoice";
import type { InvoiceRecord } from "../invoices/store";
import { INVOICE_STATUS_LABEL } from "../invoices/store-types";
import { byNumber, inRange, issuedInvoices, PAYMENT_METHOD_LABEL, type DateRange, type ExportCustomer, type ExportPayment } from "./model";

/**
 * CSV for customers, invoices and payments, the way Excel in Swedish opens
 * them with a double click: UTF-8 with a BOM (or å, ä, ö break), semicolon
 * between fields (the comma is the decimal sign), amounts in kronor with a
 * decimal comma and no thousands separator, dates as ÅÅÅÅ-MM-DD and CRLF
 * line ends. A field with a semicolon, a quote or a line break is quoted.
 * Text that Excel would run as a formula (=, @, or + and - not followed by a
 * number) gets a leading apostrophe.
 */

export const CSV_BOM = "﻿";
export const CSV_SEPARATOR = ";";
const EOL = "\r\n";

export type CsvKind = "kunder" | "fakturor" | "betalningar";
export const CSV_KINDS: CsvKind[] = ["kunder", "fakturor", "betalningar"];
export const CSV_KIND_LABEL: Record<CsvKind, string> = { kunder: "Kunder", fakturor: "Fakturor", betalningar: "Betalningar" };

/** Öre as kronor with a decimal comma: 123456 → "1234,56", -5 → "-0,05". Exact, no floats. */
export function csvAmount(ore: number): string {
  const sign = ore < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(ore));
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
}

/** Free text from a user: kept from being read as a formula. */
export function csvText(value: string | null | undefined): string {
  const s = value ?? "";
  if (/^[=@\t\r]/.test(s)) return `'${s}`;
  if (/^[+-]/.test(s) && !/^[+-][\d\s().-]*$/.test(s)) return `'${s}`;
  return s;
}

/** Quote a field when it needs it. */
export function csvField(value: string): string {
  return /[";\r\n]/.test(value) || /^\s|\s$/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export type CsvColumn<T> = { header: string; value: (row: T) => string };

/** The whole file: BOM, header row, one line per row, CRLF after every line. */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvField(c.header)), ...rows.map((r) => columns.map((c) => csvField(c.value(r))))];
  return CSV_BOM + lines.map((l) => l.join(CSV_SEPARATOR)).join(EOL) + EOL;
}

/** A timestamp as the date in Sweden. */
export function swedishDate(iso: string | null): string {
  if (!iso) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso.slice(0, 10) : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

/* ---------- customers ---------- */

export const customerColumns: CsvColumn<ExportCustomer>[] = [
  { header: "Namn", value: (c) => csvText(c.name) },
  { header: "Företag", value: (c) => csvText(c.company) },
  { header: "Kundtyp", value: (c) => CUSTOMER_TYPE_LABEL[c.type] ?? c.type },
  { header: "Organisationsnummer", value: (c) => csvText(c.orgNr) },
  { header: "Momsregistreringsnummer", value: (c) => csvText(c.vatNr) },
  { header: "E-post", value: (c) => csvText(c.email) },
  { header: "Telefon", value: (c) => csvText(c.phone) },
  { header: "Gatuadress", value: (c) => csvText(c.street) },
  { header: "Postnummer", value: (c) => csvText(c.postalCode) },
  { header: "Ort", value: (c) => csvText(c.city) },
  { header: "Er referens", value: (c) => csvText(c.reference) },
  { header: "Peppol-id", value: (c) => csvText(c.peppolId) },
  { header: "Betalningsvillkor (dagar)", value: (c) => String(c.defaultTermsDays) },
  { header: "Anteckningar", value: (c) => csvText(c.notes) },
  { header: "Skapad", value: (c) => swedishDate(c.createdAt) },
  { header: "Borttagen", value: (c) => swedishDate(c.deletedAt) },
  { header: "Kund-id", value: (c) => c.id },
];

/** Every customer, removed ones too (with the date), by name. */
export function customersCsv(customers: ExportCustomer[]): string {
  return toCsv(customerColumns, [...customers].sort((a, b) => a.name.localeCompare(b.name, "sv") || a.id.localeCompare(b.id)));
}

/* ---------- invoices ---------- */

type CsvInvoice = Pick<
  InvoiceRecord,
  "id" | "series" | "number" | "kind" | "status" | "customerId" | "document" | "totalOre" | "vatOre" | "rotOre" | "payableOre" | "paidOre" | "issuedOn" | "dueOn" | "ocr" | "createdAt"
>;

/**
 * The amounts a row adds to a sum over the file: a change invoice repeats its
 * original's amounts and a voided invoice is reversed in the ledger, so both
 * carry 0 (the PDF archive and the JSON file keep their documents).
 */
const own = (i: CsvInvoice, ore: number) => (i.kind === "correction" || i.status === "void" ? 0 : ore);

export const invoiceColumns: CsvColumn<CsvInvoice>[] = [
  { header: "Fakturanummer", value: (i) => i.number ?? "" },
  { header: "Typ", value: (i) => (i.kind === "correction" ? csvText(`Ändringsfaktura till ${i.document.references.precedingInvoiceNumber ?? ""}`) : INVOICE_KIND_LABEL[i.kind]) },
  { header: "Fakturadatum", value: (i) => i.issuedOn ?? "" },
  { header: "Förfallodag", value: (i) => i.dueOn ?? "" },
  { header: "Kund", value: (i) => csvText(i.document.buyer.name) },
  { header: "Organisationsnummer", value: (i) => csvText(i.document.buyer.orgNr) },
  { header: "Netto", value: (i) => csvAmount(own(i, i.totalOre - i.vatOre)) },
  { header: "Moms", value: (i) => csvAmount(own(i, i.vatOre)) },
  { header: "Totalt", value: (i) => csvAmount(own(i, i.totalOre)) },
  { header: "ROT-avdrag", value: (i) => csvAmount(own(i, i.rotOre)) },
  { header: "Att betala", value: (i) => csvAmount(own(i, i.payableOre)) },
  { header: "Betalt", value: (i) => csvAmount(own(i, i.paidOre)) },
  // What the customer still owes, as the invoice list counts it: a credit note settles another invoice and is never open.
  { header: "Kvar", value: (i) => csvAmount(i.kind !== "invoice" || i.status === "credited" || i.status === "void" ? 0 : i.payableOre - i.paidOre) },
  { header: "Status", value: (i) => INVOICE_STATUS_LABEL[i.status] ?? i.status },
  { header: "OCR", value: (i) => i.ocr ?? "" },
  { header: "Valuta", value: (i) => i.document.currency },
  { header: "Faktura-id", value: (i) => i.id },
  { header: "Kund-id", value: (i) => i.customerId ?? "" },
];

/** Issued invoices and credit notes (never drafts) by number; the range filters on the invoice date. */
export function invoicesCsv(invoices: CsvInvoice[], range: DateRange = {}): string {
  return toCsv(invoiceColumns, issuedInvoices(invoices).filter((i) => inRange(i.issuedOn, range)));
}

/* ---------- payments ---------- */

type PaymentRow = { payment: ExportPayment; invoiceId: string | null; amountOre: number };

/** One line per payment and invoice it settled; the range filters on the payment date. */
export function paymentsCsv(payments: ExportPayment[], invoices: CsvInvoice[], range: DateRange = {}): string {
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const rows: PaymentRow[] = [...payments]
    .filter((p) => inRange(p.paidOn, range))
    .sort((a, b) => a.paidOn.localeCompare(b.paidOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .flatMap((payment): PaymentRow[] =>
      payment.allocations.length
        ? [...payment.allocations]
            .sort((a, b) => {
              const ia = byId.get(a.invoiceId);
              const ib = byId.get(b.invoiceId);
              return ia && ib ? byNumber(ia, ib) : a.invoiceId.localeCompare(b.invoiceId);
            })
            .map((a) => ({ payment, invoiceId: a.invoiceId, amountOre: a.amountOre }))
        : [{ payment, invoiceId: null, amountOre: payment.amountOre }]
    );
  const columns: CsvColumn<PaymentRow>[] = [
    { header: "Betaldatum", value: (r) => r.payment.paidOn },
    { header: "Fakturanummer", value: (r) => (r.invoiceId ? (byId.get(r.invoiceId)?.number ?? "") : "") },
    { header: "Kund", value: (r) => csvText(r.invoiceId ? (byId.get(r.invoiceId)?.document.buyer.name ?? "") : "") },
    { header: "Belopp", value: (r) => csvAmount(r.amountOre) },
    { header: "Källa", value: (r) => PAYMENT_METHOD_LABEL[r.payment.method] ?? r.payment.method },
    { header: "Referens", value: (r) => csvText(r.payment.reference) },
    { header: "Anteckning", value: (r) => csvText(r.payment.note) },
    { header: "Valuta", value: (r) => r.payment.currency },
    { header: "Betalnings-id", value: (r) => r.payment.id },
    { header: "Faktura-id", value: (r) => r.invoiceId ?? "" },
  ];
  return toCsv(columns, rows);
}

/** "binaafy-ab-fakturor-2026-01-01-2026-10-20.csv" */
export function csvFileName(orgName: string, kind: CsvKind | "index", range: DateRange = {}, today: string): string {
  const slug = fileSlug(orgName);
  const span = range.from || range.to ? `-${range.from ?? "start"}-${range.to ?? today}` : `-${today}`;
  return `${slug}-${kind}${span}.csv`;
}

/** "Binaafy AB" → "binaafy-ab": ASCII, for file names in every unzipper and browser. */
export function fileSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "organisation"
  );
}
