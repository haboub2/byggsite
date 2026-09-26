import type { NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { listLeads, parseFilters, KIND_LABEL, DIVISION_LABEL, STATUS_LABEL } from "@/lib/leads";
import { formatDateTime } from "@/lib/admin-format";
import { toCsv } from "@/lib/csv";

/** CSV of the leads matching the inbox filters, for Excel. Admins only. */
export async function GET(request: NextRequest) {
  const check = await checkAdmin();
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });

  const filters = parseFilters(Object.fromEntries(request.nextUrl.searchParams));
  const { leads } = await listLeads(filters, { limit: 5000 });

  const header = [
    "Inkommen", "Status", "Verksamhet", "Typ", "Namn", "E-post", "Telefon", "Tjänst", "Budget",
    "Önskad start", "Meddelande", "Övrigt", "Anteckning", "Sida", "Kom från", "UTM-källa",
    "UTM-medium", "UTM-kampanj", "Samtycke",
  ];
  const rows = leads.map((l) => [
    formatDateTime(l.created_at),
    STATUS_LABEL[l.status],
    DIVISION_LABEL[l.division],
    KIND_LABEL[l.kind],
    l.name,
    l.email,
    l.phone,
    l.service,
    l.budget,
    l.timeline,
    l.message,
    Object.entries(l.details ?? {}).map(([k, v]) => `${k}: ${v}`).join(" | "),
    l.note,
    l.source?.page,
    l.source?.referrer,
    l.source?.utm_source,
    l.source?.utm_medium,
    l.source?.utm_campaign,
    l.consent_at ? formatDateTime(l.consent_at) : "",
  ]);

  // sv-SE formats dates as YYYY-MM-DD; Stockholm time, not UTC.
  const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(new Date());
  return new Response(toCsv(header, rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="binaafy-forfragningar-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
