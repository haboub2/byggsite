import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient as createSessionClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { isDemo } from "../leads";
import { demoPhotoNumber, drawDemoPhoto } from "./demo-photos";

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

const contentTypeOf = (key: string) => {
  const ext = key.split(".").pop() ?? "";
  return ext === "pdf" ? "application/pdf" : ext === "zip" ? "application/zip" : ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
};

/** Demo mode: the file on disk, and the example project's photos drawn on first use. */
async function readDemoFile(key: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(demoDir(key));
  } catch {
    const n = demoPhotoNumber(key);
    if (n === null) return null;
    const bytes = await drawDemoPhoto(n);
    await fs.mkdir(path.dirname(demoDir(key)), { recursive: true });
    await fs.writeFile(demoDir(key), bytes);
    return bytes;
  }
}

/**
 * Where to send a caller who may see the key: a signed URL, or the bytes in
 * demo mode. With `downloadName` the browser saves the file under that name.
 */
export async function resolvePortalFile(key: string, opts: { downloadName?: string } = {}): Promise<ResolvedFile | null> {
  if (isDemo()) {
    const bytes = await readDemoFile(key);
    return bytes ? { bytes, contentType: contentTypeOf(key) } : null;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.storage
    .from(PORTAL_BUCKET)
    .createSignedUrl(key, SIGNED_URL_SECONDS, opts.downloadName ? { download: opts.downloadName } : undefined);
  if (error || !data) return null;
  return { redirect: data.signedUrl };
}

/** The bytes of a stored file, or null if it is missing: the report and the zip read the originals. */
export async function readPortalFile(key: string): Promise<Buffer | null> {
  if (isDemo()) return readDemoFile(key);
  const supabase = await createSessionClient();
  const { data, error } = await supabase.storage.from(PORTAL_BUCKET).download(key);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Store a file the app made (the report, the zip), replacing an older one.
 * Customers may only read the bucket, so a file rendered on a customer's
 * request is written with the service role (`serviceRole`).
 */
export async function writePortalFile(key: string, bytes: Buffer, opts: { serviceRole?: boolean } = {}): Promise<void> {
  if (isDemo()) {
    const target = demoDir(key);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
    return;
  }
  const supabase = opts.serviceRole ? createAdminClient() : await createSessionClient();
  const { error } = await supabase.storage.from(PORTAL_BUCKET).upload(key, bytes, { contentType: contentTypeOf(key), cacheControl: "60", upsert: true });
  if (error) throw new Error(`Kunde inte spara filen: ${error.message}`);
}

export async function removePortalFile(key: string, opts: { serviceRole?: boolean } = {}): Promise<void> {
  if (isDemo()) {
    await fs.rm(demoDir(key), { force: true });
    return;
  }
  const supabase = opts.serviceRole ? createAdminClient() : await createSessionClient();
  await supabase.storage.from(PORTAL_BUCKET).remove([key]);
}
