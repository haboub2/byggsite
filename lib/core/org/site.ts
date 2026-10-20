import "server-only";
import { cache } from "react";
import { getDb } from "../db";
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
  // default_org() is security definer: the oldest organisation of all, not of those the caller can see.
  const { data, error } = await (await getDb()).rpc("default_org");
  if (error) {
    console.error("[org] default_org failed:", error.message);
    return null;
  }
  return (data as string | null) ?? null;
});

export async function isSiteOrg(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false;
  return orgId === (await siteOrgId());
}
