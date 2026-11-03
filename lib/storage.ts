import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { createClient as createSessionClient } from "./supabase/server";
import { isDemo } from "./leads";
import sharp from "sharp";
import { publicUrl } from "./storage-url";

/**
 * Photos uploaded from /admin. They go to the public `gallery` bucket in
 * Supabase Storage (supabase/migrations/0003_storage.sql: anyone can read,
 * only admins can write). In demo mode they're written to public/uploads/
 * on the local disk instead, which is git-ignored.
 *
 * A stored path is either a bucket key ("projects/ab12.webp") or, in demo
 * mode, a site path ("/uploads/projects/ab12.webp").
 */

export const BUCKET = "gallery";
export const UPLOAD_FOLDERS = ["projects", "team", "cases"] as const;
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number];

const TYPES: Record<string, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/** Longest edge of a stored photo. Cards show at most ~1 200 px; the lightbox
 *  2 000 px. Anything larger only costs bandwidth and LCP. */
const MAX_EDGE = 2000;

/** Every upload becomes a WebP at most MAX_EDGE px on its longest side, with
 *  the camera's rotation applied and metadata stripped. A 4 MB phone photo
 *  lands at 200–400 KB, which is what keeps project cards fast on mobile. */
async function compress(bytes: Buffer): Promise<Buffer> {
  return sharp(bytes)
    .rotate()
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

export { publicUrl };

export async function uploadImage(folder: UploadFolder, file: File): Promise<{ path: string; url: string }> {
  const ext = TYPES[file.type];
  if (!ext) throw new Error("Bara JPG, PNG eller WebP.");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Bilden är för stor (högst 8 MB).");

  const name = `${crypto.randomUUID()}.webp`;
  const bytes = await compress(Buffer.from(await file.arrayBuffer()));

  if (isDemo()) {
    const dir = path.join(process.cwd(), "public", "uploads", folder);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, name), bytes);
    const stored = `/uploads/${folder}/${name}`;
    return { path: stored, url: stored };
  }

  const key = `${folder}/${name}`;
  const supabase = await createSessionClient();
  const { error } = await supabase.storage.from(BUCKET).upload(key, bytes, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`Uppladdningen misslyckades: ${error.message}`);
  return { path: key, url: publicUrl(key)! };
}
