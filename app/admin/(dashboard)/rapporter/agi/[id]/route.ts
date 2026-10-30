import { requireRole } from "@/lib/admin";
import { hasAccess } from "@/lib/core/org/roles";
import { getAgiXml } from "@/lib/core/payroll/authorities-store";
import { agiFileName } from "@/lib/core/payroll/agi";

/** The frozen AGI file for upload in Skatteverket's e-service; owner and admin only (it has the personnummer). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok || !hasAccess(check.role, "admin")) return new Response("Saknar behörighet.", { status: 403 });
  const { id } = await params;
  let file: Awaited<ReturnType<typeof getAgiXml>>;
  try {
    file = await getAgiXml(id);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte hämta filen.", { status: 500 });
  }
  if (!file) return new Response("Deklarationen finns inte.", { status: 404 });
  return new Response(file.xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="${agiFileName(file.declaration.period, file.declaration.version)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
