import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { getPensionFile } from "@/lib/core/payroll/authorities-store";

/** The frozen Fora or Collectum list (pension_reports); owner and admin only (it has the personnummer). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok || !hasAccess(check.role, "admin")) return new Response("Saknar behörighet.", { status: 403 });
  const { id } = await params;
  let f: Awaited<ReturnType<typeof getPensionFile>>;
  try {
    f = await getPensionFile(id);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte hämta filen.", { status: 500 });
  }
  if (!f) return new Response("Rapporten finns inte.", { status: 404 });
  return new Response(f.file, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${f.report.scheme === "collectum" ? "Collectum" : "Fora"}-${f.report.period.replace("-", "")}-v${f.report.version}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
