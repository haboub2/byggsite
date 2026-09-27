/** URL for a stored photo path (see lib/storage.ts). Safe on client and server. */
export function publicUrl(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (stored.startsWith("/") || stored.startsWith("https://")) return stored;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  return base ? `${base}/storage/v1/object/public/gallery/${stored}` : null;
}
