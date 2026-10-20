import type { NextRequest } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { projectIdFromKey, resolvePortalFile } from "@/lib/portal/files";
import { getProject } from "@/lib/portal/store";
import { getQuoteForPortal } from "@/lib/quotes/store";
import { renderQuotePdf, quoteFileName } from "@/lib/pdf/render";
import { getQuoteProfile } from "@/lib/quotes/profile-store";
import { getInvoice } from "@/lib/core/invoices/store";
import { renderInvoicePdf, invoiceFileName } from "@/lib/pdf/render-invoice";
import { fetchSwishQrPng } from "@/lib/core/payments/swish";

/**
 * A portal file: /mitt-projekt/fil?p=projects/<id>/<file>  or  ?p=quote:<quote id>.
 * Checks that the caller may see the project (the store applies RLS, so a
 * customer only gets their own), then redirects to a signed URL — or streams
 * the file in demo mode. The quote PDF is rendered on the fly from the quote
 * tool so it never needs to be uploaded. Admins pass too (RLS lets them read).
 */
export async function GET(request: NextRequest) {
  const user = await getPortalUser();
  if (!user) return new Response("Logga in först.", { status: 401 });

  const key = request.nextUrl.searchParams.get("p") ?? "";
  const download = request.nextUrl.searchParams.has("ladda-ner");

  if (key.startsWith("quote:")) {
    const quoteId = key.slice(6);
    // The quote belongs to the project that references it; only a member (or admin) finds that project.
    const projectId = request.nextUrl.searchParams.get("projekt") ?? "";
    const project = projectId ? await getProject(projectId) : null;
    if (!project || project.quote_id !== quoteId) return new Response("Dokumentet finns inte.", { status: 404 });
    const quote = await getQuoteForPortal(quoteId).catch(() => null);
    if (!quote) return new Response("Offerten finns inte längre.", { status: 404 });
    const profile = await getQuoteProfile(quote.orgId);
    const pdf = await renderQuotePdf(quote, profile);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${quoteFileName(quote, profile.brand)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  if (key.startsWith("swish:")) {
    // The Swish QR for an open invoice on the caller's project.
    const invoiceId = key.slice(6);
    const projectId = request.nextUrl.searchParams.get("projekt") ?? "";
    const project = projectId ? await getProject(projectId) : null;
    const inv = project ? await getInvoice(invoiceId).catch(() => null) : null;
    if (!project || !inv || inv.projectId !== project.id || !inv.document.paymentMeans.swish) return new Response("Ingen Swish.", { status: 404 });
    const png = await fetchSwishQrPng({ payee: inv.document.paymentMeans.swish, amountOre: inv.payableOre - inv.paidOre, message: inv.ocr ?? inv.number ?? "" });
    if (!png) return new Response("QR-koden kunde inte hämtas.", { status: 502 });
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" } });
  }

  if (key.startsWith("invoice:")) {
    // An issued invoice on a project the caller is a member of. RLS lets a
    // member read it (invoices_portal_member); the project check is belt and braces.
    const invoiceId = key.slice(8);
    const projectId = request.nextUrl.searchParams.get("projekt") ?? "";
    const project = projectId ? await getProject(projectId) : null;
    const inv = project ? await getInvoice(invoiceId).catch(() => null) : null;
    if (!project || !inv || inv.projectId !== project.id || inv.status === "draft") return new Response("Fakturan finns inte.", { status: 404 });
    const pdf = await renderInvoicePdf(inv);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${invoiceFileName(inv)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const projectId = projectIdFromKey(key);
  if (!projectId) return new Response("Ogiltig fil.", { status: 400 });
  if (!(await getProject(projectId))) return new Response("Filen finns inte.", { status: 404 });

  const file = await resolvePortalFile(key);
  if (!file) return new Response("Filen finns inte.", { status: 404 });
  if ("redirect" in file) return Response.redirect(file.redirect, 302);
  return new Response(new Uint8Array(file.bytes), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": download ? `attachment; filename="${key.split("/").pop()}"` : "inline",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
