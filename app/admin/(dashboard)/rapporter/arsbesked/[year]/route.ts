import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { todayIso } from "@/lib/quotes/schema";
import { listEmployees } from "@/lib/core/hr/store";
import { listYearClosings, summaryForYear } from "@/lib/core/payroll/authorities-store";
import { renderYearSummaryPdf } from "@/lib/pdf/render-authorities";

/**
 * Årsbesked per person for a year, as PDF (one page each, or ?person=id):
 * the summary saved at the year-end once it is done, otherwise the closed
 * runs so far. For those who read payroll.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ year: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const year = Number((await params).year);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return new Response("Okänt år.", { status: 404 });
  const person = request.nextUrl.searchParams.get("person");
  const [closing, employees] = await Promise.all([listYearClosings().then((all) => all.find((c) => c.year === year) ?? null), listEmployees()]);
  const summary = closing?.summary ?? (await summaryForYear(year));
  const masked = new Map(employees.map((e) => [e.id, e.pnrMasked]));
  const rows = summary.filter((r) => !person || r.employeeId === person).map((r) => ({ ...r, pnrMasked: masked.get(r.employeeId) ?? "" }));
  if (!rows.length) return new Response("Inga lönebesked det året.", { status: 404 });
  const pdf = await renderYearSummaryPdf({ year, rows, madeOn: todayIso() });
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Arsbesked-${year}${person ? `-${rows[0].name.replace(/[^\p{L}\p{N}]+/gu, "-")}` : ""}.pdf"`, "Cache-Control": "private, no-store" },
  });
}
