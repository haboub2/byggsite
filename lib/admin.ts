import "server-only";
import { cache } from "react";
import { isDemo } from "./leads";
import { currentMembership } from "./core/org/current";
import { getRequestSession } from "./core/org/session";
import { hasAccess, type Access, type Role } from "./core/org/roles";
import { ensureDemoHr } from "./core/payroll/demo-seed";
import { todayIso } from "./quotes/schema";

export type AdminCheck =
  | {
      ok: true;
      email: string | null;
      demo: boolean;
      userId: string | null;
      role: Role;
      orgId: string;
      orgName: string;
      /** The organisation owns the website (lib/core/org/site.ts). */
      site: boolean;
    }
  | { ok: false; reason: "signed-out" | "not-admin" | "forbidden"; email?: string | null; role?: Role };

/**
 * Who is asking, in which organisation, and may they do this? Used by the
 * admin layout, every server action and the route handlers — server actions
 * and route handlers are reachable directly, so each one checks for itself
 * instead of trusting the layout. RLS enforces the same split again in the
 * database (is_org_member, can_write_org, can_admin_org).
 *
 *   requireRole("read")   any member: accountant and readonly read Ekonomi, Bokföringen, fakturor
 *   requireRole("write")  owner, admin, staff: everything that creates or changes
 *   requireRole("admin")  owner, admin: settings, members, API keys
 *   requireRole("site")   owner, admin in the organisation that owns the website: its content
 *
 * "not-admin" means the user has no membership at all; "forbidden" that the
 * role is too low for this.
 */
export async function requireRole(access: Access): Promise<AdminCheck> {
  const base = await whoIsAsking();
  if (!base.ok) return base;
  if (!hasAccess(base.role, access, base.site)) return { ok: false, reason: "forbidden", email: base.email, role: base.role };
  return base;
}

/**
 * The part of requireRole that does not depend on the access asked for, once
 * per request: the layout, the page and every action in it share it. The
 * user and memberships come from the proxy's check (lib/core/org/session.ts),
 * so this normally makes no round trip at all.
 */
const whoIsAsking = cache(async (): Promise<AdminCheck> => {
  if (isDemo()) {
    // The example organisation (people, time, a closed run, its AGI) exists before any admin page or action reads (phase 6).
    await ensureDemoHr(todayIso());
    return { ok: true, email: "demo@localhost", demo: true, userId: null, role: "owner", orgId: "demo", orgName: "Demo AB", site: true };
  }

  const session = await getRequestSession();
  if (!session) return { ok: false, reason: "signed-out" };

  const membership = await currentMembership();
  if (!membership) return { ok: false, reason: "not-admin", email: session.email };
  const site = membership.orgId === session.siteOrgId;

  return { ok: true, email: session.email, demo: false, userId: session.userId, role: membership.role, orgId: membership.orgId, orgName: membership.name, site };
});

/** The check every writing server action makes: staff or higher in the current organisation. */
export async function checkAdmin(): Promise<AdminCheck> {
  return requireRole("write");
}
