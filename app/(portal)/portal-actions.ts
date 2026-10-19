"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { isDemo } from "@/lib/leads";
import { changeOrderAnsweredMail } from "@/lib/mail";
import { DEMO_COOKIE, getPortalUser } from "@/lib/portal/auth";
import { scheduleReportRefresh } from "@/lib/portal/report";
import { answerChangeOrder, getProjectBundle } from "@/lib/portal/store";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/env";

/**
 * The customer login: e-mail → one-time code (and link) → session. Only
 * addresses that already have an account get a code (shouldCreateUser:
 * false) — accounts are created by "Bjud in kund" in /admin, never here.
 * In demo mode any address is let in to the example project.
 */

export type LoginState = { step: "email" | "code"; email?: string; error?: string };

const normalize = (v: FormDataEntryValue | null) => String(v ?? "").trim().toLowerCase().slice(0, 120);
const valid = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export async function requestCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = normalize(formData.get("email"));
  if (!valid(email)) return { step: "email", error: "Ange den e-postadress du blev inbjuden med." };

  if (isDemo()) {
    (await cookies()).set(DEMO_COOKIE, email, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    redirect("/mitt-projekt");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${SITE_URL}/mitt-projekt/callback` },
  });
  if (error) {
    // Unknown address: say the same thing as for a known one, so the form
    // can't be used to find out who is a customer.
    if (/signups not allowed|not found|user not found/i.test(error.message)) return { step: "code", email };
    if (/rate limit|security purposes/i.test(error.message)) return { step: "email", error: "Vänta en stund innan du begär en ny kod." };
    return { step: "email", error: "Kunde inte skicka koden just nu. Försök igen om en stund." };
  }
  return { step: "code", email };
}

export async function verifyCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = normalize(formData.get("email"));
  const token = String(formData.get("code") ?? "").replace(/\D/g, "").slice(0, 8);
  if (!valid(email)) return { step: "email", error: "Börja om med din e-postadress." };
  if (token.length < 6) return { step: "code", email, error: "Koden har 6 siffror." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, error: "Fel eller för gammal kod. Begär en ny om det behövs." };
  redirect("/mitt-projekt");
}

export async function portalSignOut(): Promise<void> {
  if (isDemo()) {
    (await cookies()).delete(DEMO_COOKIE);
  } else {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/mitt-projekt/login");
}

/* ---------- ÄTA ---------- */

/**
 * Godkänn / Avböj on a change order. The signed-in user must be a member of
 * the project (checked again in the store, which then writes with the
 * service-role client since members only have select under RLS). The answer
 * is stored with the customer's name and time, and the team gets a mail.
 */
export async function answerChangeOrderAction(formData: FormData): Promise<void> {
  const user = await getPortalUser();
  if (!user) redirect("/mitt-projekt/login");
  const projectId = String(formData.get("project") ?? "").slice(0, 60);
  const orderId = String(formData.get("order") ?? "").slice(0, 60);
  const answer = formData.get("answer") === "approved" ? "approved" : formData.get("answer") === "declined" ? "declined" : null;
  const back = `/mitt-projekt/${projectId}/andringar`;
  if (!answer) redirect(`${back}?fel=${encodeURIComponent("Välj Godkänn eller Avböj.")}`);

  // RLS already hides projects the user is not a member of.
  const bundle = await getProjectBundle(projectId);
  if (!bundle || !bundle.changeOrders.some((o) => o.id === orderId)) redirect(`${back}?fel=${encodeURIComponent("Ändringen finns inte längre.")}`);

  const member = bundle.members.find((m) => m.user_id === user.id);
  const userName = user.name || member?.name || user.email;

  let order;
  try {
    order = await answerChangeOrder({ orderId, userId: user.id, userName, status: answer });
  } catch (err) {
    redirect(`${back}?fel=${encodeURIComponent(err instanceof Error ? err.message : "Kunde inte spara svaret.")}`);
  }

  // Never let the notice fail the answer.
  await changeOrderAnsweredMail({
    projectId,
    projectTitle: bundle.project.title,
    number: order.number,
    title: order.title,
    amount: order.amount,
    approved: answer === "approved",
    answeredName: userName,
    answeredEmail: user.email,
  }).catch((err) => console.error("[portal] ÄTA notice failed", err));

  revalidatePath(`/mitt-projekt/${projectId}`, "layout");
  revalidatePath(`/admin/projekt/${projectId}`);
  // An approved ÄTA is in the report's appendix; members can't write the cache, so the service role does.
  if (answer === "approved") scheduleReportRefresh(projectId, { serviceRole: !user.demo });
  redirect(`${back}?svar=${answer === "approved" ? "godkand" : "avbojd"}#ata-${order.number}`);
}
