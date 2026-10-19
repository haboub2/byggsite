import type { NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { currentReportKey, fileResponse, reportFileName } from "@/lib/portal/report";
import { getProjectBundle } from "@/lib/portal/store";

/** The renderer may need a while for a large report whose cache is stale. */
export const maxDuration = 60;

/** The project's documentation as PDF, for admins: the locked one, or "hittills". `?ladda-ner=1` downloads. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const check = await checkAdmin();
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) return new Response("Projektet finns inte.", { status: 404 });
  const key = await currentReportKey(bundle);
  return fileResponse(key, reportFileName(bundle), request.nextUrl.searchParams.has("ladda-ner"));
}
