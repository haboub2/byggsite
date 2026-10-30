import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { getDocument, getEmployee } from "@/lib/core/hr/store";
import { contractPdfResponse } from "@/lib/pdf/render-contract";

/** A frozen contract PDF: inline, or `?ladda-ner=1` to download. Owner, admin and accountant; RLS checks again. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { id, docId } = await params;
  const [doc, employee] = await Promise.all([getDocument(docId), getEmployee(id)]);
  if (!doc || !employee || doc.employeeId !== employee.id) return new Response("Avtalet finns inte.", { status: 404 });
  return contractPdfResponse(doc, employee.name, request.nextUrl.searchParams.has("ladda-ner"));
}
