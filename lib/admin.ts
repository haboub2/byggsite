import "server-only";
import { createClient } from "./supabase/server";
import { isDemo } from "./leads";
import { currentMembership } from "./core/org/current";
import { hasAccess, type Access, type Role } from "./core/org/roles";

export type AdminCheck =
  | { ok: true; email: string | null; demo: boolean; userId: string | null; role: Role; orgId: string; orgName: string }
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
 *
 * "not-admin" means the user has no membership at all; "forbidden" that the
 * role is too low for this.
 */
export async function requireRole(access: Access): Promise<AdminCheck> {
  if (isDemo()) return { ok: true, email: "demo@localhost", demo: true, userId: null, role: "owner", orgId: "demo", orgName: "Demo AB" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const membership = await currentMembership();
  if (!membership) return { ok: false, reason: "not-admin", email: user.email };
  if (!hasAccess(membership.role, access)) return { ok: false, reason: "forbidden", email: user.email, role: membership.role };

  return { ok: true, email: user.email ?? null, demo: false, userId: user.id, role: membership.role, orgId: membership.orgId, orgName: membership.name };
}

/** The check every writing server action makes: staff or higher in the current organisation. */
export async function checkAdmin(): Promise<AdminCheck> {
  return requireRole("write");
}
