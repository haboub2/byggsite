import { buildInvoiceArchive } from "@/lib/core/export/archive";
import { fileSlug } from "@/lib/core/export/csv";
import { exportOrgName, loadInvoices, logExport } from "@/lib/core/export/load";
import { downloadHeaders, exportCaller } from "@/lib/core/export/route-helpers";
import { renderInvoicePdf } from "@/lib/pdf/render-invoice";
import { todayIso } from "@/lib/quotes/schema";

/** Rendering every invoice takes a while for a large organisation. */
export const maxDuration = 300;

/**
 * GET: every issued invoice and credit note as PDF in one zip, with
 * index.csv (lib/core/export/archive.ts). Any member, accountants included.
 * Logged as export.pdf_archive.
 */
export async function GET() {
  const caller = await exportCaller();
  if (!caller) return new Response("Saknar behörighet.", { status: 403 });
  const orgId = caller.check.orgId;

  let archive: Awaited<ReturnType<typeof buildInvoiceArchive>>;
  try {
    archive = await buildInvoiceArchive(await loadInvoices(orgId), (inv) => renderInvoicePdf(inv, { swishQr: false }));
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa PDF-arkivet.", { status: 500 });
  }
  const fileName = `${fileSlug(await exportOrgName(orgId).catch(() => caller.check.orgName))}-fakturor-pdf-${todayIso()}.zip`;
  await logExport(orgId, "export.pdf_archive", { invoices: archive.files.length - 1, bytes: archive.zip.length, file: fileName }, caller.actor);
  return new Response(new Uint8Array(archive.zip), { headers: downloadHeaders("application/zip", fileName) });
}
