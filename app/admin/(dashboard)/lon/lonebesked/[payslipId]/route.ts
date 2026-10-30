import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { getPayslip } from "@/lib/core/payroll/run-store";
import { payslipPdfResponse } from "@/lib/pdf/render-payslip";

/** A frozen payslip PDF for those who read payroll; RLS and the bucket's policy check again. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ payslipId: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { payslipId } = await params;
  const slip = await getPayslip(payslipId);
  if (!slip || !slip.approvedAt) return new Response("Lönebeskedet finns inte.", { status: 404 });
  return payslipPdfResponse(slip, request.nextUrl.searchParams.has("ladda-ner"));
}
