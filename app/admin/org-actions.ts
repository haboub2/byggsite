"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Resend } from "resend";
import { requireRole } from "@/lib/admin";
import { isDemo } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { ORG_COOKIE, listMyMemberships } from "@/lib/core/org/current";
import { acceptInvitation, createInvitation, createOrganization, removeMember, revokeInvitation, setMemberRole } from "@/lib/core/org/members";
import { getOrgSettings, saveOrgSettings } from "@/lib/core/org/settings-store";
import { fiscalYearChangeProblem } from "@/lib/core/ledger/period";
import { listPeriodLocks, listVoucherNumbers } from "@/lib/core/ledger/store";
import { orgSettingsSchema } from "@/lib/core/org/settings";
import { ROLE_LABEL, assignableRoles, isRole } from "@/lib/core/org/roles";
import type { Actor } from "@/lib/core/events";
import type { ContentActionState } from "./content-actions";

/**
 * Organisation, members, invitations and settings (fas 5). Every action
 * checks the role itself; RLS and the 0021 functions check again.
 */

export type OrgActionState = { ok?: boolean; error?: string; message?: string; link?: string };

const actorOf = (email: string | null): Actor => (email ? { kind: "user", id: email, name: email } : { kind: "system", name: "admin" });

const cookieOptions = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365, secure: process.env.NODE_ENV === "production" };

/** The origin the user is on, for links in mails and on screen (localhost in development). */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/* ---------- switching and creating ---------- */

export async function switchOrganization(formData: FormData): Promise<void> {
  const orgId = String(formData.get("org") ?? "");
  const mine = await listMyMemberships();
  if (!mine.some((m) => m.orgId === orgId)) redirect("/admin");
  (await cookies()).set(ORG_COOKIE, orgId, cookieOptions);
  revalidatePath("/admin", "layout");
  redirect("/admin/ekonomi");
}

export async function createOrganizationAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  if (isDemo()) return { error: "Nya organisationer kräver en databas." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Logga in först." };
  const name = String(formData.get("name") ?? "").trim();
  const orgNr = String(formData.get("orgNr") ?? "").trim();
  if (name.length < 2) return { error: "Ange organisationens namn." };
  if (orgNr && !/^\d{6}-?\d{4}$/.test(orgNr)) return { error: "Organisationsnummer skrivs 559123-4567." };
  let orgId: string;
  try {
    orgId = await createOrganization(name, orgNr);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte skapa organisationen." };
  }
  (await cookies()).set(ORG_COOKIE, orgId, cookieOptions);
  revalidatePath("/admin", "layout");
  redirect("/admin/installningar?ny=1");
}

/* ---------- settings ---------- */

export async function saveOrgSettingsAction(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: "Bara ägare och administratörer ändrar inställningarna." };
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Formuläret kunde inte läsas. Ladda om sidan och försök igen." };
  }
  const parsed = orgSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { error: "Några fält behöver rättas innan det går att spara.", fieldErrors };
  }
  try {
    // The voucher series follows the fiscal year (0030); moving it must not give two entries the same number in one year.
    const current = await getOrgSettings();
    if (current.fiscalYearStart !== parsed.data.fiscalYearStart) {
      const [vouchers, locks] = await Promise.all([listVoucherNumbers(), listPeriodLocks()]);
      const problem = fiscalYearChangeProblem(vouchers, locks, parsed.data.fiscalYearStart);
      if (problem) return { error: problem, fieldErrors: { fiscalYearStart: problem } };
    }
    await saveOrgSettings(parsed.data, actorOf(check.email));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  revalidatePath("/admin", "layout");
  return { ok: true, savedAt: new Date().toISOString() };
}

/** "Godkänn förvalet" in the start guide: save the settings as they are, so the terms count as looked at. */
export async function approveDefaultTermsAction(): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) return;
  try {
    await saveOrgSettings(await getOrgSettings(), actorOf(check.email));
  } catch (err) {
    console.error("[org] approve default terms:", err instanceof Error ? err.message : err);
  }
  revalidatePath("/admin", "layout");
}

/* ---------- members ---------- */

async function mailInvitation(to: string, link: string, orgName: string, roleLabel: string, from: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !from) return false;
  const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const { error } = await new Resend(key).emails.send({
    from,
    to,
    subject: `Inbjudan till ${orgName}`,
    html: `<div style="font-family:sans-serif;font-size:14px;color:#14161a;line-height:1.6">
      <p>Hej,</p>
      <p>Du är inbjuden till <strong>${esc(orgName)}</strong> som ${esc(roleLabel.toLowerCase())}.</p>
      <p><a href="${esc(link)}">Öppna inbjudan</a></p>
      <p style="color:#6b7280">Länken gäller i 14 dagar. Logga in med ${esc(to)}.</p>
    </div>`,
  });
  return !error;
}

export async function inviteMemberAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: "Bara ägare och administratörer bjuder in." };
  const email = String(formData.get("email") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isRole(role) || !assignableRoles(check.role).includes(role)) return { error: "Välj en roll du får ge." };
  try {
    const inv = await createInvitation(email, role, actorOf(check.email));
    const link = `${await origin()}/admin/inbjudan/${inv.token}`;
    const mailed = process.env.MAIL_FROM ? await mailInvitation(inv.email, link, check.orgName, ROLE_LABEL[role], process.env.MAIL_FROM).catch(() => false) : false;
    revalidatePath("/admin/organisation");
    return {
      ok: true,
      message: mailed ? `Inbjudan mejlad till ${inv.email}.` : `Inbjudan skapad. Mejl är inte påslaget (MAIL_FROM), så skicka länken till ${inv.email} själv:`,
      link: mailed ? undefined : link,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte bjuda in." };
  }
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  const check = await requireRole("admin");
  if (!check.ok) return;
  await revokeInvitation(String(formData.get("id") ?? "")).catch((err) => console.error("[org] revoke invitation:", err));
  revalidatePath("/admin/organisation");
}

export async function setMemberRoleAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: "Bara ägare och administratörer ändrar roller." };
  const userId = String(formData.get("user") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!isRole(role) || !assignableRoles(check.role).includes(role)) return { error: "Du får inte ge den rollen." };
  try {
    await setMemberRole(userId, role, actorOf(check.email));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte ändra rollen." };
  }
  revalidatePath("/admin/organisation");
  return { ok: true, message: `Rollen är nu ${ROLE_LABEL[role].toLowerCase()}.` };
}

export async function removeMemberAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const check = await requireRole("admin");
  if (!check.ok) return { error: "Bara ägare och administratörer tar bort medlemmar." };
  const userId = String(formData.get("user") ?? "");
  if (userId === check.userId) return { error: "Du kan inte ta bort dig själv här. Be en annan ägare." };
  try {
    await removeMember(userId, actorOf(check.email));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte ta bort medlemmen." };
  }
  revalidatePath("/admin/organisation");
  return { ok: true, message: "Medlemmen är borttagen." };
}

/* ---------- accepting an invitation ---------- */

export async function acceptInvitationAction(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const token = String(formData.get("token") ?? "");
  let orgId: string;
  try {
    orgId = await acceptInvitation(token);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte acceptera inbjudan." };
  }
  (await cookies()).set(ORG_COOKIE, orgId, cookieOptions);
  revalidatePath("/admin", "layout");
  redirect("/admin");
}

/** A one-time sign-in link for the invited address that comes back to the invitation. Creates the account if needed. */
export async function requestInvitationLogin(_prev: OrgActionState, formData: FormData): Promise<OrgActionState> {
  const token = String(formData.get("token") ?? "");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[a-f0-9]{48}$/.test(token)) return { error: "Länken är trasig." };
  const supabase = await createClient();
  const next = `/admin/inbjudan/${token}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: `${await origin()}/mitt-projekt/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    if (/rate limit|security purposes/i.test(error.message)) return { error: "Vänta en stund innan du begär en ny länk." };
    return { error: "Kunde inte skicka inloggningslänken just nu." };
  }
  return { ok: true, message: `En inloggningslänk är skickad till ${email}. Öppna den på den här enheten.` };
}
