import { apiGet } from "@/lib/api/route";
import { renderInvoicePdf, invoiceFileName } from "@/lib/pdf/render-invoice";
import { loadInvoice } from "../load";

/** GET /api/v1/invoices/{id}/pdf — the invoice as PDF (a draft is marked UTKAST). */
export const GET = apiGet("read", async ({ params }) => {
  const inv = await loadInvoice(params.id);
  const pdf = await renderInvoicePdf(inv);
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${invoiceFileName(inv)}"`, "cache-control": "no-store" },
  });
});
