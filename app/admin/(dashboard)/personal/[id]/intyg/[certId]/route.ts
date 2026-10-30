import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { getCertificate } from "@/lib/core/payroll/authorities-store";
import { certificatePdfResponse } from "@/lib/pdf/render-authorities";

/** A frozen arbetsgivarintyg for those who read payroll; RLS and the bucket's policy check again. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; certId: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { id, certId } = await params;
  const c = await getCertificate(certId);
  if (!c || c.employeeId !== id) return new Response("Intyget finns inte.", { status: 404 });
  return certificatePdfResponse(c, request.nextUrl.searchParams.has("ladda-ner"));
}
