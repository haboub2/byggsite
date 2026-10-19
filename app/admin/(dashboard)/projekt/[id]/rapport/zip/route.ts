import { checkAdmin } from "@/lib/admin";
import { currentZipKey, fileResponse, reportFileName } from "@/lib/portal/report";
import { getProjectBundle } from "@/lib/portal/store";

export const maxDuration = 60;

/** The locked documentation as a zip (PDF plus the original photos per phase and day), for admins. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const check = await checkAdmin();
  if (!check.ok) return new Response("Saknar behörighet.", { status: 403 });
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) return new Response("Projektet finns inte.", { status: 404 });
  const key = await currentZipKey(bundle);
  if (!key) return new Response("Zip-filen finns när dokumentationen är låst.", { status: 409 });
  return fileResponse(key, reportFileName(bundle, "zip"), true);
}
