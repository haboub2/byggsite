import { site } from "../placeholder";
import type { InvoiceKind } from "../core/documents/invoice";

/** "Faktura-10001-Binaafy-Anna-Andersson.pdf". Without server-only imports, so
 *  the export archive and its tests can name files the way the e-mail does. */
export function invoiceFileName(inv: { kind: InvoiceKind; number: string | null; document: { buyer: { name: string } } }): string {
  const who = inv.document.buyer.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const word = inv.kind === "credit" ? "Kreditfaktura" : "Faktura";
  return `${word}-${inv.number ?? "utkast"}-${site.brand}${who ? `-${who}` : ""}.pdf`;
}
