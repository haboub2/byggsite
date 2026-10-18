/** The URL the portal pages (and the admin previews) use for a stored key, or
 *  a "quote:<id>" reference, which needs the project to prove the caller may
 *  see it. Safe on the client; the server side lives in files.ts. */
export function fileHref(key: string, projectId?: string, download = false): string {
  const p = new URLSearchParams({ p: key });
  if (projectId) p.set("projekt", projectId);
  if (download) p.set("ladda-ner", "1");
  return `/mitt-projekt/fil?${p}`;
}
