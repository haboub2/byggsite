import type { NextRequest } from "next/server";
import { getInvoiceByToken } from "@/lib/core/invoices/public";
import { renderInvoicePdf, invoiceFileName } from "@/lib/pdf/render-invoice";

/** The PDF for the public invoice page. The token is the only key. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const inv = await getInvoiceByToken(token);
  if (!inv) return new Response("Fakturan finns inte.", { status: 404 });
  const pdf = await renderInvoicePdf(inv);
  const download = request.nextUrl.searchParams.has("ladda-ner");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${invoiceFileName(inv)}"`,
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
