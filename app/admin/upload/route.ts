import type { NextRequest } from "next/server";
import { checkAdmin } from "@/lib/admin";
import { uploadImage, UPLOAD_FOLDERS, type UploadFolder } from "@/lib/storage";

/** Image upload for the admin editors. The browser has already resized and
 *  compressed the photo; this checks rights, type and size, then stores it. */
export async function POST(request: NextRequest) {
  const check = await checkAdmin();
  if (!check.ok) return Response.json({ error: "Du saknar behörighet." }, { status: 403 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const folder = form?.get("folder");
  if (!(file instanceof File) || !UPLOAD_FOLDERS.includes(folder as UploadFolder)) {
    return Response.json({ error: "Ingen bild skickades." }, { status: 400 });
  }
  try {
    return Response.json(await uploadImage(folder as UploadFolder, file));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Uppladdningen misslyckades." }, { status: 400 });
  }
}
