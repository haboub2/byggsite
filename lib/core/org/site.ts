import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "../../supabase/public";
import { isDemo } from "../../leads";
import { DEMO_ORG_ID } from "./current";

/**
 * The organisation that owns the website: default_org(), the oldest one
 * (Binaafy). The website's content (content_blocks, services, projects,
 * cases, the gallery) has no org_id; it belongs to this organisation, and
 * only its owners and admins edit it (is_site_admin(), 0022). Its quotes
 * fall back to Offertuppgifter for the default texts per side.
 */
export const siteOrgId = cache(async (): Promise<string | null> => {
  if (isDemo()) return DEMO_ORG_ID;
  return readSiteOrgId();
});

// It never changes in practice, so it is kept across requests for a while.
// Read with the cookie-less anon client: default_org() is security definer
// and granted to anon (0014), and a cached function may not read cookies.
// A failed read throws, so it is not cached; the caller gets null.
const cachedSiteOrgId = unstable_cache(
  async (): Promise<string | null> => {
    const { data, error } = await createPublicClient().rpc("default_org");
    if (error) throw new Error(error.message);
    return (data as string | null) ?? null;
  },
  ["default-org"],
  { revalidate: 600 }
);

async function readSiteOrgId(): Promise<string | null> {
  try {
    return await cachedSiteOrgId();
  } catch (err) {
    console.error("[org] default_org failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function isSiteOrg(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  return orgId === (await siteOrgId());
}
