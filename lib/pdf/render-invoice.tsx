import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { InvoicePdf } from "./InvoicePdf";
import { getSellerDefaults } from "../core/invoices/seller";
import { invoiceTotals } from "../core/invoices/totals";
import { isOpen, type InvoiceRecord } from "../core/invoices/store";
import { fetchSwishQrPng } from "../core/payments/swish";
import { site } from "../placeholder";

/** The invoice as PDF bytes. An issued invoice renders its frozen document;
 *  a draft renders what is saved so far, marked UTKAST. An open invoice with
 *  a Swish number gets the QR code (amount, number and OCR locked). */
export async function renderInvoicePdf(inv: InvoiceRecord): Promise<Buffer> {
  const { signer } = await getSellerDefaults();
  const swish = inv.document.paymentMeans.swish;
  const qr = swish && isOpen(inv) ? await fetchSwishQrPng({ payee: swish, amountOre: inv.payableOre - inv.paidOre, message: inv.ocr ?? inv.number ?? "" }) : null;
  return renderToBuffer(<InvoicePdf document={inv.document} totals={invoiceTotals(inv.document)} signer={signer} swishQr={qr} />);
}

export function invoiceFileName(inv: InvoiceRecord): string {
  const who = inv.document.buyer.name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const word = inv.kind === "credit" ? "Kreditfaktura" : "Faktura";
  return `${word}-${inv.number ?? "utkast"}-${site.brand}${who ? `-${who}` : ""}.pdf`;
}
