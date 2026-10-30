import { cookies } from "next/headers";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { myEmployee } from "@/lib/core/hr/time-store";
import { DEMO_PICK_COOKIE } from "@/lib/core/hr/time";
import { getClaim, readReceipt } from "@/lib/core/payroll/benefits-store";

/** The signed-in person's own receipt, served only when its SHA-256 matches; RLS and the bucket's policy check again. */
export async function GET(_request: Request, { params }: { params: Promise<{ claimId: string; n: string }> }) {
  const check = await requireRole("self");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { claimId, n } = await params;
  const pick = isDemo() ? ((await cookies()).get(DEMO_PICK_COOKIE)?.value ?? null) : null;
  const [me, claim] = await Promise.all([myEmployee(check.userId, pick), /^[0-9a-f-]{36}$/.test(claimId) ? getClaim(claimId) : null]);
  if (!me || !claim || claim.employeeId !== me.id) return new Response("Kvittot finns inte.", { status: 404 });
  try {
    const { bytes, receipt } = await readReceipt(claim, Number(n));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": receipt.contentType, "Content-Disposition": `inline; filename="kvitto-${Number(n) + 1}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kvittot kunde inte hämtas.", { status: 404 });
  }
}
