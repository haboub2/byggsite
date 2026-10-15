import type { NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { getQuote } from "@/lib/quotes/store";
import { renderQuotePdf, quoteFileName } from "@/lib/pdf/render";

/** The quote as PDF: inline for preview, `?ladda-ner=1` to download. Admins only. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await checkAdmin();
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });

  const { id } = await params;
  const quote = await getQuote(id);
  if (!quote) return new Response("Offerten finns inte.", { status: 404 });

  const pdf = await renderQuotePdf(quote);
  const download = request.nextUrl.searchParams.has("ladda-ner");
  const name = quoteFileName(quote);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
