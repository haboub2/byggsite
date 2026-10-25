"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/lib/admin";
import { STATUSES, updateLead, type LeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeAdminNext } from "@/lib/core/org/roles";
import { rateLimit } from "@/lib/rate-limit";

export async function signIn(formData: FormData) {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase är inte konfigurerat ännu. Sätt NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_ANON_KEY." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) {
    return { error: "Fyll i e-post och lösenord." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return { error: "Fel e-post eller lösenord." };
  }

  // Only back into admin, never to another site.
  const next = safeAdminNext(String(formData.get("next") ?? ""));
  redirect(next && next !== "/admin" ? next : "/admin/idag");
}

export type LoginLinkState = { ok?: boolean; error?: string; message?: string };

/**
 * "Logga in med e-postlänk": a one-time link to an existing account, never a
 * new one (registering is /registrera). The answer is the same whether the
 * address has an account or not, so the form does not tell who has one.
 */
export async function requestLoginLink(_prev: LoginLinkState, formData: FormData): Promise<LoginLinkState> {
  if (!isSupabaseConfigured()) return { error: "Supabase är inte konfigurerat ännu." };
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Ange en giltig e-postadress." };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`login-link:${ip}`)) return { error: "För många länkar härifrån. Försök igen om en stund." };

  const next = safeAdminNext(String(formData.get("next") ?? "")) ?? "/admin/idag";
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") || host?.startsWith("127.") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${origin}/mitt-projekt/callback?next=${encodeURIComponent(next)}` },
  });
  if (error && /rate limit|security purposes/i.test(error.message)) return { error: "Vänta en minut innan du begär en ny länk." };
  // An unknown address ("Signups not allowed for otp") gets the same answer as a known one.
  if (error && !/signups? not allowed|user not found/i.test(error.message)) {
    console.error("[login] otp failed:", error.message);
    return { error: "Kunde inte skicka länken just nu. Försök igen om en stund." };
  }
  return { ok: true, message: `Om ${email} har ett konto kommer en inloggningslänk strax. Öppna den på den här enheten.` };
}

export async function signOut() {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}

/* ---------- Leads inbox ---------- */

export type LeadActionState = { ok?: boolean; error?: string };

async function guard(): Promise<string | null> {
  const check = await checkAdmin();
  return check.ok ? null : "Du saknar behörighet. Logga in igen.";
}

export async function setLeadStatus(_prev: LeadActionState, formData: FormData): Promise<LeadActionState> {
  const denied = await guard();
  if (denied) return { error: denied };
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !STATUSES.includes(status as LeadStatus)) return { error: "Ogiltig status." };
  try {
    await updateLead(id, { status: status as LeadStatus });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function setLeadNote(_prev: LeadActionState, formData: FormData): Promise<LeadActionState> {
  const denied = await guard();
  if (denied) return { error: denied };
  const id = String(formData.get("id") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 4000);
  if (!id) return { error: "Ogiltig förfrågan." };
  try {
    await updateLead(id, { note: note || null });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}
