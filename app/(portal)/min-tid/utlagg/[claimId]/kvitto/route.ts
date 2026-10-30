import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { myEmployee } from "@/lib/core/hr/time-store";
import { DEMO_PICK_COOKIE } from "@/lib/core/hr/time";
import { addReceipt, getClaim, RECEIPT_MAX_BYTES } from "@/lib/core/payroll/benefits-store";

/**
 * The receipt photo for one of the signed-in person's own claims, posted
 * from /min-tid. A route handler and not a server action: a phone photo is
 * larger than a server action's 1 MB body limit. Same origin only; the
 * claim must be the person's draft or submitted claim, and the database
 * (expense_add_receipt and the bucket's policy) checks the same again.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ claimId: string }> }) {
  const back = (key: "ok" | "fel", text: string) => Response.redirect(new URL(`/min-tid?${key}=${encodeURIComponent(text)}#utlagg`, request.url), 303);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return new Response("Fel ursprung.", { status: 403 });
  const check = await requireRole("self");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { claimId } = await params;
  const pick = isDemo() ? ((await cookies()).get(DEMO_PICK_COOKIE)?.value ?? null) : null;
  const [me, claim] = await Promise.all([myEmployee(check.userId, pick), /^[0-9a-f-]{36}$/.test(claimId) ? getClaim(claimId) : null]);
  if (!me || !claim || claim.employeeId !== me.id) return back("fel", "Utlägget finns inte.");
  if (Number(request.headers.get("content-length") ?? "0") > RECEIPT_MAX_BYTES + 100_000) return back("fel", "Kvittot får vara högst 10 MB.");
  try {
    const form = await request.formData();
    const file = form.get("receipt");
    if (!(file instanceof File) || !file.size) return back("fel", "Välj ett foto av kvittot.");
    await addReceipt(claim.id, { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type, name: file.name });
  } catch (err) {
    return back("fel", err instanceof Error ? err.message : "Kvittot kunde inte sparas.");
  }
  return back("ok", "Kvittot är sparat.");
}
