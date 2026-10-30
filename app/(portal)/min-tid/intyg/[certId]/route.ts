import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { myEmployee } from "@/lib/core/hr/time-store";
import { DEMO_PICK_COOKIE } from "@/lib/core/hr/time";
import { getCertificate } from "@/lib/core/payroll/authorities-store";
import { certificatePdfResponse } from "@/lib/pdf/render-authorities";

/** The signed-in person's own arbetsgivarintyg; RLS (is_self) and the bucket's policy check again. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ certId: string }> }) {
  const check = await requireRole("self");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { certId } = await params;
  const pick = isDemo() ? ((await cookies()).get(DEMO_PICK_COOKIE)?.value ?? null) : null;
  const [me, c] = await Promise.all([myEmployee(check.userId, pick), getCertificate(certId)]);
  if (!me || !c || c.employeeId !== me.id) return new Response("Intyget finns inte.", { status: 404 });
  return certificatePdfResponse(c, request.nextUrl.searchParams.has("ladda-ner"));
}
