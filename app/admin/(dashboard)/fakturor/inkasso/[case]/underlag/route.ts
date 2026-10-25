import { requireRole } from "@/lib/admin";
import { collectionPackage } from "@/lib/core/collections/store";

/**
 * The package for the collection agency as a zip: the invoice, the reminders
 * and the inkassokrav as PDF, the summary with interest to today and the CSV
 * row. Staff and up; the CSV has the debtor's full personal number only for
 * owner/admin, the PDFs always mask it.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ case: string }> }) {
  const check = await requireRole("write");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const fullPersonalNumber = (await requireRole("admin")).ok;

  const { case: caseId } = await params;
  try {
    const { fileName, zip } = await collectionPackage(caseId, { fullPersonalNumber });
    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa underlaget.", { status: 404 });
  }
}
