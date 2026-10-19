import { getPortalUser } from "@/lib/portal/auth";
import { currentZipKey, fileResponse, reportFileName } from "@/lib/portal/report";
import { getProjectBundle } from "@/lib/portal/store";

export const maxDuration = 60;

/** "Ladda ner allt (zip)": the locked PDF plus the original photos per phase and day. Members only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getPortalUser();
  if (!user) return new Response("Logga in först.", { status: 401 });
  const { id } = await params;
  const bundle = await getProjectBundle(id);
  if (!bundle) return new Response("Projektet finns inte.", { status: 404 });
  const key = await currentZipKey(bundle, { serviceRole: !user.demo });
  if (!key) return new Response("Zip-filen finns när projektet är klart och dokumentationen låst.", { status: 409 });
  return fileResponse(key, reportFileName(bundle, "zip"), true);
}
