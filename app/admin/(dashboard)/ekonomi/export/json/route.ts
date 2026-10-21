import { fileSlug } from "@/lib/core/export/csv";
import { buildJsonExport, serializeJsonExport, EXPORT_SCHEMA_VERSION } from "@/lib/core/export/json";
import { loadExportData, logExport, openPersonalNumbers } from "@/lib/core/export/load";
import { downloadHeaders, exportCaller } from "@/lib/core/export/route-helpers";
import { hasAccess } from "@/lib/core/org/roles";
import { todayIso } from "@/lib/quotes/schema";

export const maxDuration = 120;

/**
 * GET: everything the organisation has in the invoicing core as one JSON
 * file (lib/core/export/json.ts), the file to take along when leaving.
 * Any member, accountants included. Personal numbers are masked (0023),
 * except for owner/admin: their export opens them in plain text, so the
 * file is complete without the encryption key, and the event says how many
 * were opened. Logged as export.json.
 */
export async function GET() {
  const caller = await exportCaller();
  if (!caller) return new Response("Saknar behörighet.", { status: 403 });
  const orgId = caller.check.orgId;
  const plain = hasAccess(caller.check.role, "admin");

  let text: string;
  let fileName: string;
  let facts: Record<string, number>;
  try {
    const data = await loadExportData(orgId);
    let opened = 0;
    if (plain) {
      const result = await openPersonalNumbers(data);
      data.personalNumbers = result.opened;
      opened = result.count;
    }
    const json = buildJsonExport(data);
    text = serializeJsonExport(json);
    fileName = `${fileSlug(data.org.name)}-export-${todayIso()}.json`;
    facts = { customers: json.customers.length, invoices: json.invoices.length, payments: json.payments.length, journal: json.journal.length, events: json.events.length, personalNumbersOpened: opened };
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa exporten.", { status: 500 });
  }
  await logExport(orgId, "export.json", { schemaVersion: EXPORT_SCHEMA_VERSION, file: fileName, personalNumbers: plain ? "plain" : "masked", ...facts }, caller.actor);
  return new Response(text, { headers: downloadHeaders("application/json; charset=utf-8", fileName) });
}
