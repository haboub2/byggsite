import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdf } from "./InvoicePdf";
import { getOrgSettings } from "../core/org/settings-store";
import { invoiceTotals } from "../core/invoices/totals";
import { isOpen, type InvoiceRecord } from "../core/invoices/store";
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
  const qr = swish && isOpen(inv) && options.swishQr !== false ? await fetchSwishQrPng({ payee: swish, amountOre: inv.payableOre - inv.paidOre, message: inv.ocr ?? inv.number ?? "" }) : null;
  return renderToBuffer(<InvoicePdf document={inv.document} totals={invoiceTotals(inv.document)} signer={signer} swishQr={qr} logo={profile?.logo ?? null} />);
}

export { invoiceFileName } from "./invoice-file-name";
