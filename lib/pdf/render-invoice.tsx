import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdf, type InvoicePdfProps } from "./InvoicePdf";
import { asSystem } from "../core/db";
import { getOrgSettings } from "../core/org/settings-store";
import { invoiceTotals } from "../core/invoices/totals";
import { paymentReference } from "../core/documents/invoice";
import { getInvoice, isOpen, replacementOf, type InvoiceRecord } from "../core/invoices/store";
import type { InvoiceDocument } from "../core/documents/invoice";
import { fetchSwishQrPng } from "../core/payments/swish";
import { getQuoteProfile } from "../quotes/profile-store";

/** The invoice as PDF bytes. An issued invoice renders its frozen document;
 *  a draft renders what is saved so far, marked UTKAST. An open invoice with
 *  a Swish number gets the QR code (amount, number and OCR locked), unless
 *  `swishQr` is false: the export archive keeps the document only, without
 *  a call to Swish per invoice. */
export async function renderInvoicePdf(inv: InvoiceRecord, options: { swishQr?: boolean } = {}): Promise<Buffer> {
  // The invoice's own organisation: the PDF is also rendered for portal
  // customers and the public page, who have no current organisation.
  // The logo is the organisation's current one (as on the quote); everything
  // else about the seller comes from the frozen document.
  const [settings, profile] = await Promise.all([getOrgSettings(inv.orgId || undefined).catch(() => null), getQuoteProfile(inv.orgId).catch(() => null)]);
  const signer = settings?.company.signer || inv.document.seller.name;
  const swish = inv.document.paymentMeans.swish;
  const qr = swish && isOpen(inv) && options.swishQr !== false ? await fetchSwishQrPng({ payee: swish, amountOre: inv.payableOre - inv.paidOre, message: paymentReference(inv.document).value || (inv.number ?? "") }) : null;
  const document = await withPendingOffset(inv);
  return renderToBuffer(<InvoicePdf document={document} totals={invoiceTotals(document)} signer={signer} swishQr={qr} logo={profile?.logo ?? null} stamp={await stampFor(inv)} />);
}

/** A Rätta belopp draft previews the offset it gets at issue; an issued invoice has it frozen. */
async function withPendingOffset(inv: InvoiceRecord): Promise<InvoiceDocument> {
  if (inv.status !== "draft" || !inv.replacesInvoiceId) return inv.document;
  const offset = (await replacementOf(inv).catch(() => null))?.offset;
  return offset ? { ...inv.document, se: { ...inv.document.se, offset } } : inv.document;
}

/** "Makulerad" or "Rättad genom faktura N" on the copy; the frozen document itself never changes. */
async function stampFor(inv: InvoiceRecord): Promise<InvoicePdfProps["stamp"]> {
  if (inv.status === "void") return { kind: "void", text: "Makulerad", detail: inv.voidedAt ? `Makulerad ${inv.voidedAt.slice(0, 10)}. Fakturan gäller inte och ska inte betalas.` : undefined };
  if (!inv.correctedBy) return null;
  // The change invoice belongs to the same organisation; read its number as system, since
  // the PDF is also rendered for the public page and the portal.
  const correction = await asSystem(() => getInvoice(inv.correctedBy!), inv.orgId || undefined).catch(() => null);
  return {
    kind: "corrected",
    text: correction?.number ? `Rättad genom faktura ${correction.number}` : "Rättad genom ändringsfaktura",
    detail: "Uppgifterna på den här fakturan är ersatta av ändringsfakturan. Beloppet är detsamma.",
  };
}

export { invoiceFileName } from "./invoice-file-name";
