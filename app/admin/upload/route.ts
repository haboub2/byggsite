import type { NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { uploadImage, UPLOAD_FOLDERS, type UploadFolder } from "@/lib/storage";
import { uploadPortalFile } from "@/lib/portal/files";
import { getProject } from "@/lib/portal/store";

/** File upload for the admin editors. The browser has already resized and
 *  compressed photos; this checks rights, type and size, then stores them.
 *
 *  Two destinations:
 *   - folder=projects|team|cases  → the public gallery bucket (site photos)
 *   - project=<id>&kind=image|document → the private portal bucket */
export async function POST(request: NextRequest) {
  const check = await checkAdmin();
  if (!check.ok) return Response.json({ error: "Du saknar behörighet." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Ingen fil skickades." }, { status: 400 });

  try {
    const project = form?.get("project");
    if (typeof project === "string" && project) {
      const kind = form?.get("kind") === "document" ? "document" : "image";
      if (!(await getProject(project))) return Response.json({ error: "Projektet finns inte." }, { status: 404 });
      const path = await uploadPortalFile(project, kind, file);
      return Response.json({ path });
    }

    const folder = form?.get("folder");
    if (!UPLOAD_FOLDERS.includes(folder as UploadFolder)) return Response.json({ error: "Ingen bild skickades." }, { status: 400 });
    return Response.json(await uploadImage(folder as UploadFolder, file));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Uppladdningen misslyckades." }, { status: 400 });
  }
}
