import type { NextRequest } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { currentReportKey, fileResponse, reportFileName } from "@/lib/portal/report";
import { getProjectBundle } from "@/lib/portal/store";

export const maxDuration = 60;

/**
 * "Ladda ner projektdokumentation (PDF)": members only, like /mitt-projekt/fil.
 * The store reads with the caller's session, so RLS gives a customer only
 * their own project. The PDF is normally cached already; if not, it is
 * rendered once and cached with the service role (members may only read).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return new Response("Logga in först.", { status: 401 });
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) return new Response("Projektet finns inte.", { status: 404 });
  const key = await currentReportKey(bundle, { serviceRole: !user.demo });
  return fileResponse(key, reportFileName(bundle), !request.nextUrl.searchParams.has("visa"));
}
