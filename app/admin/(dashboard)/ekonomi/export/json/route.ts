import { fileSlug } from "@/lib/core/export/csv";
import { buildJsonExport, serializeJsonExport, EXPORT_SCHEMA_VERSION } from "@/lib/core/export/json";
import { loadExportData, logExport } from "@/lib/core/export/load";
import { downloadHeaders, exportCaller } from "@/lib/core/export/route-helpers";
import { todayIso } from "@/lib/quotes/schema";

export const maxDuration = 120;

/**
 * GET: everything the organisation has in the invoicing core as one JSON
 * file (lib/core/export/json.ts), the file to take along when leaving.
 * Any member, accountants included; RLS still hides what the role may not
 * read (the ROT buyers' personal numbers for anyone below admin). Logged as
 * export.json.
 */
export async function GET() {
  const caller = await exportCaller();
  if (!caller) return new Response("Saknar behörighet.", { status: 403 });
  const orgId = caller.check.orgId;

  let text: string;
  let fileName: string;
  let counts: Record<string, number>;
  try {
    const data = await loadExportData(orgId);
    const json = buildJsonExport(data);
    text = serializeJsonExport(json);
    fileName = `${fileSlug(data.org.name)}-export-${todayIso()}.json`;
    counts = { customers: json.customers.length, invoices: json.invoices.length, payments: json.payments.length, journal: json.journal.length, events: json.events.length };
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa exporten.", { status: 500 });
  }
  await logExport(orgId, "export.json", { schemaVersion: EXPORT_SCHEMA_VERSION, file: fileName, ...counts }, caller.actor);
  return new Response(text, { headers: downloadHeaders("application/json; charset=utf-8", fileName) });
}
