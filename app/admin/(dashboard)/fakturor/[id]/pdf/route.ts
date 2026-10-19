import type { NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { getInvoice } from "@/lib/core/invoices/store";
import { renderInvoicePdf, invoiceFileName } from "@/lib/pdf/render-invoice";

/** The invoice as PDF: inline for preview, `?ladda-ner=1` to download. Admins only.
 *  Issued invoices render their frozen document, so the file is always the same. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await checkAdmin();
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });

  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) return new Response("Fakturan finns inte.", { status: 404 });

  const pdf = await renderInvoicePdf(inv);
  const download = request.nextUrl.searchParams.has("ladda-ner");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${invoiceFileName(inv)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
