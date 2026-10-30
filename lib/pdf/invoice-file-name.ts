import type { InvoiceKind } from "../core/documents/invoice";

/** A name part for a file: accents dropped, everything but letters and digits to "-", at most `max` characters. */
export const fileSafe = (v: string, max: number) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);

/** "Faktura-10001-Binaafy-AB-Anna-Andersson.pdf": the seller is the name on
 *  the invoice's frozen document, so the file follows the invoice's own
 *  organisation (as the mail's "från" does) and never changes once issued.
 *  Without server-only imports, so the export archive and its tests can name
 *  files the way the e-mail does. */
export function invoiceFileName(inv: { kind: InvoiceKind; number: string | null; document: { seller: { name: string }; buyer: { name: string } } }): string {
  const word = inv.kind === "credit" ? "Kreditfaktura" : inv.kind === "correction" ? "Andringsfaktura" : "Faktura";
  return [word, inv.number ?? "utkast", fileSafe(inv.document.seller.name, 30), fileSafe(inv.document.buyer.name, 40)].filter(Boolean).join("-") + ".pdf";
}
