import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { getBankFileXml, getRun } from "@/lib/core/payroll/run-store";

/** The frozen salary file for upload in the bank; owner and admin only (it has the account numbers). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok || !hasAccess(check.role, "admin")) return new Response("Saknar behörighet.", { status: 403 });
  const { id } = await params;
  const run = await getRun(id);
  const file = run ? await getBankFileXml(run) : null;
  if (!run || !file) return new Response("Lönefilen finns inte.", { status: 404 });
  return new Response(file.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="Lonefil-${run.periodStart.slice(0, 7)}.xml"`,
      "Cache-Control": "private, no-store",
    },
  });
}
