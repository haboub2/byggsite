import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient as createSessionClient } from "../supabase/server";
import { isDemo } from "../leads";

/**
 * Photos and documents in the portal live in the PRIVATE `portal` bucket
 * (supabase/migrations/0010_portal.sql), under projects/{project_id}/…, and
 * are shown through /mitt-projekt/fil?p=<key>, which checks that the caller
 * may see the project and then redirects to a short-lived signed URL. In demo
 * mode the files are written to uploads/portal/ on disk (git-ignored) and the
 * same route streams them.
 *
 * A document path can also be "quote:<quote id>": the route then renders the
 * quote PDF from the quote tool instead of reading a file.
 */

export const PORTAL_BUCKET = "portal";
export const SIGNED_URL_SECONDS = 60 * 60;

/** Vercel caps a request body at about 4.5 MB; stay under it with margin. */
export const MAX_PORTAL_FILE_BYTES = 4 * 1024 * 1024;

const IMAGE_TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
const DOCUMENT_TYPES: Record<string, string> = { "application/pdf": "pdf" };

export type PortalFileKind = "image" | "document";

export { fileHref } from "./files-href";

/** The project a key belongs to, from its projects/{id}/… prefix. */
export function projectIdFromKey(key: string): string | null {
  const m = /^projects\/([0-9a-f-]{36})\/[A-Za-z0-9_.-]+$/.exec(key);
  return m ? m[1] : null;
}

const demoDir = (key: string) => path.join(process.cwd(), "uploads", "portal", ...key.split("/"));

export async function uploadPortalFile(projectId: string, kind: PortalFileKind, file: File): Promise<string> {
  const types = kind === "image" ? IMAGE_TYPES : DOCUMENT_TYPES;
  const ext = types[file.type];
  if (!ext) throw new Error(kind === "image" ? "Bara JPG, PNG eller WebP." : "Bara PDF.");
  if (file.size > MAX_PORTAL_FILE_BYTES) throw new Error("Filen är för stor (högst 4 MB).");

  const key = `projects/${projectId}/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (isDemo()) {
    const target = demoDir(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    return key;
  }

  const supabase = await createSessionClient();
  const { error } = await supabase.storage.from(PORTAL_BUCKET).upload(key, bytes, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw new Error(`Uppladdningen misslyckades: ${error.message}`);
  return key;
}

export type ResolvedFile = { redirect: string } | { bytes: Buffer; contentType: string };

/** Where to send a caller who may see the key: a signed URL, or the bytes in demo mode. */
export async function resolvePortalFile(key: string): Promise<ResolvedFile | null> {
  if (isDemo()) {
    try {
      const bytes = await fs.readFile(demoDir(key));
      const ext = key.split(".").pop() ?? "";
      const contentType =
        ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return { bytes, contentType };
    } catch {
      return null;
    }
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.storage.from(PORTAL_BUCKET).createSignedUrl(key, SIGNED_URL_SECONDS);
  if (error || !data) return null;
  return { redirect: data.signedUrl };
}

export async function removePortalFile(key: string): Promise<void> {
  if (isDemo()) {
    await fs.rm(demoDir(key), { force: true });
    return;
  }
  const supabase = await createSessionClient();
  await supabase.storage.from(PORTAL_BUCKET).remove([key]);
}
