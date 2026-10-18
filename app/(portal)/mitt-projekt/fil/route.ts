import type { NextRequest } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { projectIdFromKey, resolvePortalFile } from "@/lib/portal/files";
import { getProject } from "@/lib/portal/store";
import { getQuoteForPortal } from "@/lib/quotes/store";
import { renderQuotePdf, quoteFileName } from "@/lib/pdf/render";

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
    const pdf = await renderQuotePdf(quote);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${quoteFileName(quote)}"`,
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
