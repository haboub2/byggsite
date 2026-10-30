import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { getDocument, getEmployee, readDocumentFile } from "@/lib/core/hr/store";
import { contractFileName } from "@/lib/pdf/render-contract";

/** A frozen contract PDF: inline, or `?ladda-ner=1` to download. Owner, admin and accountant; RLS checks again. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  const check = await requireRole("payroll");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { id, docId } = await params;
  const [doc, employee] = await Promise.all([getDocument(docId), getEmployee(id)]);
  if (!doc || !employee || doc.employeeId !== employee.id) return new Response("Avtalet finns inte.", { status: 404 });
  let pdf: Buffer;
  try {
    pdf = await readDocumentFile(doc);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte hämta PDF:en.", { status: 500 });
  }
  const name = contractFileName(doc.template === "contract-uppdrag" ? "Styrelseuppdrag" : "Anstallningsavtal", employee.name, doc.createdAt.slice(0, 10));
  const download = request.nextUrl.searchParams.has("ladda-ner");
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
