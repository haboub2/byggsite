import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { getInvoice } from "@/lib/core/invoices/store";
import { renderDemandPdf } from "@/lib/core/collections/store";
import { defaultPayBy } from "@/lib/core/collections/collections";
import { todayIso } from "@/lib/quotes/schema";

/** The inkassokrav as PDF: the one that was sent, or before that a preview of one sent today
 *  (`?betala=ÅÅÅÅ-MM-DD`, default ten days). Any member; the personal number is masked. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("read");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });

  const { id } = await params;
  const inv = await getInvoice(id);
  if (!inv) return new Response("Fakturan finns inte.", { status: 404 });

  try {
    const pdf = await renderDemandPdf(inv, { payBy: request.nextUrl.searchParams.get("betala") || defaultPayBy(todayIso()) });
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Inkassokrav-${inv.number ?? "utkast"}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa inkassokravet.", { status: 409 });
  }
}
