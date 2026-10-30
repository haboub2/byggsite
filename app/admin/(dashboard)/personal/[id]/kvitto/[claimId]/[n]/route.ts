import { requireRole } from "@/lib/admin";
import { getClaim, readReceipt } from "@/lib/core/payroll/benefits-store";

/** A claim's receipt for payroll readers, served only when its SHA-256 matches the one frozen on the claim. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; claimId: string; n: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { id, claimId, n } = await params;
  const claim = await getClaim(claimId);
  if (!claim || claim.employeeId !== id) return new Response("Kvittot finns inte.", { status: 404 });
  try {
    const { bytes, receipt } = await readReceipt(claim, Number(n));
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": receipt.contentType, "Content-Disposition": `inline; filename="kvitto-${Number(n) + 1}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kvittot kunde inte hämtas.", { status: 404 });
  }
}
