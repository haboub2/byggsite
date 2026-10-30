import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { getDocument, readDocumentFile } from "@/lib/core/hr/store";
import { myEmployee } from "@/lib/core/hr/time-store";
import { DEMO_PICK_COOKIE } from "@/lib/core/hr/time";
import { contractFileName } from "@/lib/pdf/render-contract";

/** The signed-in person's own contract PDF; RLS (is_self) and the bucket's policy check again. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const check = await requireRole("self");
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { docId } = await params;
  const pick = isDemo() ? ((await cookies()).get(DEMO_PICK_COOKIE)?.value ?? null) : null;
  const [me, doc] = await Promise.all([myEmployee(check.userId, pick), getDocument(docId)]);
  if (!me || !doc || doc.employeeId !== me.id) return new Response("Avtalet finns inte.", { status: 404 });
  let pdf: Buffer;
  try {
    pdf = await readDocumentFile(doc);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Kunde inte hämta PDF:en.", { status: 500 });
  }
  const name = contractFileName(doc.template === "contract-uppdrag" ? "Styrelseuppdrag" : "Anstallningsavtal", me.name, doc.createdAt.slice(0, 10));
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${request.nextUrl.searchParams.has("ladda-ner") ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
