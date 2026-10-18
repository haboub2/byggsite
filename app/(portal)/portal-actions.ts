"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isDemo } from "@/lib/leads";
import { DEMO_COOKIE } from "@/lib/portal/auth";
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
