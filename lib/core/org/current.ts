import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "../../supabase/server";
import { isDemo } from "../../leads";
import { isSystem, systemOrgId } from "../db";
import { isRole, type Role } from "./roles";

/**
 * Which organisation the signed-in user is working in. A user can belong to
 * several (memberships); the cookie "org" picks one of them, and without it
 * (or when it names an organisation the user has left) the first one, in
 * the order they joined. The cookie is only a preference: it is checked
 * against the user's memberships on every request, and RLS checks again.
 *
 * Code that runs as the system (API key, cron) gets its organisation from
 * `asSystem(fn, orgId)` instead.
 */

export const ORG_COOKIE = "org";
export const DEMO_ORG_ID = "00000000-0000-4000-8000-000000000001";

export type MyMembership = { orgId: string; role: Role; name: string; slug: string; orgNr: string; joinedAt: string };

export const listMyMemberships = cache(async (): Promise<MyMembership[]> => {
  if (isDemo()) return [{ orgId: DEMO_ORG_ID, role: "owner", name: "Demo AB", slug: "demo", orgNr: "", joinedAt: "2026-01-01T00:00:00Z" }];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, role, created_at, organizations(name, slug, org_nr)")
    .eq("user_id", user.id)
    .order("created_at");
  if (error) {
    console.error("[org] memberships lookup failed:", error.message);
    return [];
  }
  type Joined = { org_id: string; role: string; created_at: string; organizations: { name: string; slug: string; org_nr: string } | null };
  return ((data ?? []) as unknown as Joined[])
    .filter((r) => isRole(r.role))
    .map((r) => ({
      orgId: r.org_id,
      role: r.role as Role,
      name: r.organizations?.name ?? "Organisation",
      slug: r.organizations?.slug ?? "",
      orgNr: r.organizations?.org_nr ?? "",
      joinedAt: r.created_at,
    }));
});

/** The membership the session is working in, or null for a user without any. */
export const currentMembership = cache(async (): Promise<MyMembership | null> => {
  const all = await listMyMemberships();
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  return all.find((m) => m.orgId === wanted) ?? all[0] ?? null;
});

/**
 * The organisation every store reads and writes in. Throws rather than
 * guessing: a system job without an organisation, or a user without one,
 * must never fall through to "the first organisation".
 */
export async function currentOrgId(): Promise<string> {
  const sys = systemOrgId();
  if (sys) return sys;
  if (isDemo()) return DEMO_ORG_ID;
  if (isSystem()) throw new Error("Ingen organisation angiven för systemanropet.");
  const m = await currentMembership();
  if (!m) throw new Error("Du är inte medlem i någon organisation.");
  return m.orgId;
}

/**
 * The organisation to filter reads on, or null when there is none to pick:
 * a portal customer (a user without memberships, whom RLS limits to their
 * own projects) or a system read by an unguessable key (the public invoice
 * page). Writes always use `currentOrgId()`.
 */
export async function readOrgId(): Promise<string | null> {
  const sys = systemOrgId();
  if (sys) return sys;
  if (isDemo() || isSystem()) return null;
  return (await currentMembership())?.orgId ?? null;
}
