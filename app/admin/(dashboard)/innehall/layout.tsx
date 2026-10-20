import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";

/**
 * The website's content belongs to the organisation that owns the site
 * (lib/core/org/site.ts). The proxy already sends everyone else away; this
 * checks again for the pages, as each action does for itself.
 */
export default async function SiteContentLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const check = await requireRole("site");
  if (!check.ok) redirect(check.reason === "signed-out" ? "/admin/login" : "/admin/ekonomi");
  return children;
}
