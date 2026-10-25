import type { NextRequest } from "next/server";
import { exportFileUrl, getExportJob, readDemoExportFile } from "@/lib/core/export/job-store";
import { isDownloadable } from "@/lib/core/export/jobs";
import { downloadHeaders, exportCaller } from "@/lib/core/export/route-helpers";
import { isDemo } from "@/lib/leads";

/**
 * GET ?del=0: a finished background export's file (or volume), for the
 * export page. The job is read with the user's session, so only members of
 * its organisation find it; the answer is a redirect to a link signed for
 * ten minutes. Demo mode streams the file from disk.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const caller = await exportCaller();
  if (!caller) return new Response("Saknar behörighet.", { status: 403 });
  const { id } = await params;
  const job = await getExportJob(id).catch(() => null);
  if (!job || job.orgId !== caller.check.orgId) return new Response("Exporten finns inte.", { status: 404 });
  if (!isDownloadable(job)) return new Response("Exporten är inte klar, eller så har länken gått ut.", { status: 410 });
  const index = Number(request.nextUrl.searchParams.get("del") ?? 0);
  const output = Number.isInteger(index) ? job.outputs[index] : undefined;
  if (!output) return new Response("Filen finns inte.", { status: 404 });

  if (isDemo()) return new Response(new Uint8Array(await readDemoExportFile(output.path)), { headers: downloadHeaders("application/zip", output.name) });
  try {
    return Response.redirect(await exportFileUrl(job, index), 303);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa länken.", { status: 500 });
  }
}
