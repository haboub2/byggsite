import { requireRole } from "@/lib/admin";
import { listInterest } from "@/lib/interest";
import { interestCsv } from "@/lib/interest-schema";
import { downloadHeaders } from "@/lib/core/export/route-helpers";
import { todayIso } from "@/lib/quotes/schema";

/** GET: every interest registration as CSV for Excel. Site admins only. */
export async function GET() {
  const check = await requireRole("site");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  try {
    const text = interestCsv(await listInterest());
    return new Response(text, { headers: downloadHeaders("text/csv; charset=utf-8", `intresseanmalningar-${todayIso()}.csv`) });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte skapa CSV-filen.", { status: 500 });
  }
}
