import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { myEmployee } from "@/lib/core/hr/time-store";
import { DEMO_PICK_COOKIE } from "@/lib/core/hr/time";
import { getPayslip } from "@/lib/core/payroll/run-store";
import { payslipPdfResponse } from "@/lib/pdf/render-payslip";

/** The signed-in person's own payslip PDF; RLS (is_self, approved only) and the bucket's policy check again. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ payslipId: string }> }) {
  const check = await requireRole("self");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { payslipId } = await params;
  const pick = isDemo() ? ((await cookies()).get(DEMO_PICK_COOKIE)?.value ?? null) : null;
  const [me, slip] = await Promise.all([myEmployee(check.userId, pick), getPayslip(payslipId)]);
  if (!me || !slip || slip.employeeId !== me.id || !slip.approvedAt) return new Response("Lönebeskedet finns inte.", { status: 404 });
  return payslipPdfResponse(slip, request.nextUrl.searchParams.has("ladda-ner"));
}
