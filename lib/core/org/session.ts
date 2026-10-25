import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createClient } from "../../supabase/server";
import { SESSION_HEADER, SESSION_TTL_MS, sessionSecret, verifySession, type RequestSession, type SessionMembership } from "./request-session";
import { isRole, type Role } from "./roles";
import { siteOrgId } from "./site";

/**
 * Who is signed in for this request, with their memberships and the site's
 * organisation: what requireRole (lib/admin.ts), currentMembership and the
 * portal need. Read once per request (React cache).
 *
 * Normally the proxy has already checked it and passes it in a signed header
 * (lib/core/org/request-session.ts), so this costs no round trip. Without a
 * valid header (a request the proxy does not match, a missing secret, an
 * expired value) it asks Supabase the way the proxy would, with getUser().
 */
export const getRequestSession = cache(async (): Promise<RequestSession | null> => {
  const fromProxy = await sessionFromProxy();
  if (fromProxy) return fromProxy;
  return loadSession();
});

async function sessionFromProxy(): Promise<RequestSession | null> {
  let value: string | null = null;
  try {
    value = (await headers()).get(SESSION_HEADER);
  } catch {
    return null; // outside a request (cron, scripts)
  }
  return verifySession(value, sessionSecret());
}

async function loadSession(): Promise<RequestSession | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const [memberships, site] = await Promise.all([
    supabase.from("memberships").select("org_id, role, created_at, organizations(name, slug, org_nr)").eq("user_id", user.id).order("created_at"),
    siteOrgId(),
  ]);
  if (memberships.error) console.error("[org] memberships lookup failed:", memberships.error.message);
  return {
    userId: user.id,
    email: user.email ?? null,
    name: typeof user.user_metadata?.name === "string" ? user.user_metadata.name : "",
    memberships: toMemberships(memberships.data),
    siteOrgId: site,
    authChecked: true,
    exp: Date.now() + SESSION_TTL_MS,
  };
}

type Joined = { org_id: string; role: string; created_at: string; organizations: { name: string; slug: string; org_nr: string } | null };

function toMemberships(rows: unknown): SessionMembership[] {
  return ((rows ?? []) as Joined[])
    .filter((r) => isRole(r.role))
    .map((r) => ({
      orgId: r.org_id,
      role: r.role as Role,
      name: r.organizations?.name ?? "Organisation",
      slug: r.organizations?.slug ?? "",
      orgNr: r.organizations?.org_nr ?? "",
      joinedAt: r.created_at,
    }));
}
