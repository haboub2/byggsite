import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { isDemo } from "../../leads";
import { isSystem, systemOrgId } from "../db";
import { pickMembership, type SessionMembership } from "./request-session";
import { getRequestSession } from "./session";

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

export type MyMembership = SessionMembership;

/** The signed-in user's memberships, in join order; from the proxy's check when it made one (lib/core/org/session.ts). */
export const listMyMemberships = cache(async (): Promise<MyMembership[]> => {
  if (isDemo()) return [{ orgId: DEMO_ORG_ID, role: "owner", name: "Demo AB", slug: "demo", orgNr: "", joinedAt: "2026-01-01T00:00:00Z" }];
  return (await getRequestSession())?.memberships ?? [];
});

/** The membership the session is working in, or null for a user without any. */
export const currentMembership = cache(async (): Promise<MyMembership | null> => {
  return pickMembership(await listMyMemberships(), (await cookies()).get(ORG_COOKIE)?.value);
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
