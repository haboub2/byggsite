import "server-only";
import { createClient } from "../../supabase/server";
import { createAdminClient } from "../../supabase/admin";
import { isDemo } from "../../leads";
import { currentOrgId } from "./current";
import { ROLES, isRole, type Role } from "./roles";
import type { Actor } from "../events";

/**
 * Members, invitations and new organisations (0014, 0021). Read and written
 * with the session so RLS decides (memberships_admin_write, invitations_admin);
 * the rules RLS cannot express (always one owner, only owners make owners,
 * invitee must be signed in with the invited address) live in the database
 * functions and the memberships_guard trigger.
 */

export type Member = { userId: string; email: string; role: Role; joinedAt: string };
export type Invitation = { id: string; email: string; role: Role; token: string; invitedBy: string | null; createdAt: string; expiresAt: string; acceptedAt: string | null; expired: boolean };

export async function listMembers(): Promise<Member[]> {
  if (isDemo()) return [{ userId: "demo", email: "demo@localhost", role: "owner", joinedAt: "2026-01-01T00:00:00Z" }];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("org_members", { p_org: await currentOrgId() });
  if (error) throw new Error(`Kunde inte hämta medlemmarna: ${error.message}`);
  return ((data ?? []) as { user_id: string; email: string; role: string; created_at: string }[])
    .filter((r) => isRole(r.role))
    .map((r) => ({ userId: r.user_id, email: r.email, role: r.role as Role, joinedAt: r.created_at }));
}

const fromInvitation = (r: Record<string, unknown>): Invitation => ({
  id: r.id as string,
  email: r.email as string,
  role: (isRole(r.role) ? r.role : "readonly") as Role,
  token: r.token as string,
  invitedBy: (r.invited_by as string | null) ?? null,
  createdAt: r.created_at as string,
  expiresAt: (r.expires_at as string) ?? "",
  acceptedAt: (r.accepted_at as string | null) ?? null,
  expired: !!r.expires_at && new Date(r.expires_at as string).getTime() < Date.now(),
});

/** Open and recent invitations. Owner/admin only (RLS). */
export async function listInvitations(): Promise<Invitation[]> {
  if (isDemo()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("invitations").select("*").eq("org_id", await currentOrgId()).order("created_at", { ascending: false }).limit(50);
  if (error) throw new Error(`Kunde inte hämta inbjudningarna: ${error.message}`);
  return (data ?? []).map(fromInvitation);
}

export const INVITABLE_ROLES: Role[] = ROLES.filter((r) => r !== "owner");

export async function createInvitation(email: string, role: Role, actor: Actor): Promise<Invitation> {
  const clean = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Ange en giltig e-postadress.");
  if (!INVITABLE_ROLES.includes(role)) throw new Error("Välj en roll. Ägare blir man genom att en ägare ändrar rollen.");
  if (isDemo()) throw new Error("Inbjudningar kräver en databas.");
  const org = await currentOrgId();
  const supabase = await createClient();
  const { data, error } = await supabase.from("invitations").insert({ org_id: org, email: clean, role, invited_by: actor.name }).select("*").single();
  if (error) throw new Error(`Kunde inte skapa inbjudan: ${error.message}`);
  await supabase.from("events").insert({ org_id: org, aggregate_type: "organization", aggregate_id: org, type: "member.invited", data: { email: clean, role }, actor });
  return fromInvitation(data);
}

export async function revokeInvitation(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").delete().eq("id", id).eq("org_id", await currentOrgId()).is("accepted_at", null);
  if (error) throw new Error(`Kunde inte ta bort inbjudan: ${error.message}`);
}

export async function setMemberRole(userId: string, role: Role, actor: Actor): Promise<void> {
  if (!isRole(role)) throw new Error("Okänd roll.");
  const org = await currentOrgId();
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ role }).eq("org_id", org).eq("user_id", userId).select("user_id");
  if (error) throw new Error(friendly(error.message, "Kunde inte ändra rollen"));
  if (!data?.length) throw new Error("Medlemmen finns inte, eller så saknar du behörighet.");
  await supabase.from("events").insert({ org_id: org, aggregate_type: "organization", aggregate_id: org, type: "member.updated", data: { user: userId, role }, actor });
}

export async function removeMember(userId: string, actor: Actor): Promise<void> {
  const org = await currentOrgId();
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").delete().eq("org_id", org).eq("user_id", userId).select("user_id");
  if (error) throw new Error(friendly(error.message, "Kunde inte ta bort medlemmen"));
  if (!data?.length) throw new Error("Medlemmen finns inte, eller så saknar du behörighet.");
  await supabase.from("events").insert({ org_id: org, aggregate_type: "organization", aggregate_id: org, type: "member.removed", data: { user: userId }, actor });
}

/** A new organisation with the caller as owner (create_organization in 0021). Returns its id. */
export async function createOrganization(name: string, orgNr: string): Promise<string> {
  if (isDemo()) throw new Error("Nya organisationer kräver en databas.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", { p_name: name, p_org_nr: orgNr });
  if (error) throw new Error(friendly(error.message, "Kunde inte skapa organisationen"));
  return data as string;
}

export type InvitationInfo = { orgName: string; email: string; role: Role; accepted: boolean; expired: boolean };

/**
 * What an invitation link is for. Read with the service role because the
 * visitor may not be signed in yet; the token is the secret, and nothing
 * beyond the organisation's name, the address and the role is shown.
 */
export async function invitationInfo(token: string): Promise<InvitationInfo | null> {
  if (!/^[a-f0-9]{48}$/.test(token) || isDemo()) return null;
  const { data, error } = await createAdminClient()
    .from("invitations")
    .select("email, role, accepted_at, expires_at, organizations(name)")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return null;
  const org = (data as unknown as { organizations: { name: string } | null }).organizations;
  return {
    orgName: org?.name ?? "Organisationen",
    email: data.email as string,
    role: (isRole(data.role) ? data.role : "readonly") as Role,
    accepted: !!data.accepted_at,
    expired: new Date(data.expires_at as string).getTime() < Date.now(),
  };
}

/** Accept as the signed-in user. Returns the organisation joined. */
export async function acceptInvitation(token: string): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) throw new Error(friendly(error.message, "Kunde inte acceptera inbjudan"));
  return data as string;
}

/** Database messages from our own functions are already Swedish; others get a prefix. */
function friendly(message: string, prefix: string): string {
  return /[åäöÅÄÖ]/.test(message) ? message : `${prefix}: ${message}`;
}
