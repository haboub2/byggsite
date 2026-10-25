"use server";

import { headers } from "next/headers";
import { rateLimit } from "@/lib/rate-limit";
import { HONEYPOT } from "@/lib/schema";
import { isDemo } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { registrationDonePath, registrationFromForm, registrationSchema } from "@/lib/core/org/registration";
import { startRegistration } from "@/lib/core/org/registration-store";

export type RegistrationState = {
  status: "idle" | "error" | "done";
  message?: string;
  /** The address the link went to. */
  email?: string;
  /** Demo mode sends no mail: the link is shown instead. */
  demoLink?: string;
  values?: Record<string, string>;
  /** Bumped per attempt; the form remounts with `values` as its defaults. */
  attempt: number;
};

/** The origin the visitor is on, so the link comes back to the same host (localhost in development). */
async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * /registrera: save a pending registration (0033), then send a sign-in link
 * that creates the account if needed and lands on /admin/registrera/klar.
 * The same address with an open registration gets the link again, never a
 * second registration.
 */
export async function submitRegistration(prev: RegistrationState, form: FormData): Promise<RegistrationState> {
  const attempt = prev.attempt + 1;
  const raw = registrationFromForm(form);
  const values = Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));

  // Bots fill every field, including the hidden one. Pretend it worked and drop it.
  const trap = form.get(HONEYPOT);
  if (typeof trap === "string" && trap.trim()) return { status: "done", email: values.email, attempt };

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`register:${ip}`)) {
    return { status: "error", message: "För många registreringar härifrån. Försök igen om en stund.", values, attempt };
  }

  const parsed = registrationSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "Kontrollera uppgifterna.", values, attempt };
  }
  const data = parsed.data;
  if (!isDemo() && !isSupabaseConfigured()) {
    return { status: "error", message: "Registreringen är inte kopplad till databasen än.", values, attempt };
  }

  let token: string;
  try {
    ({ token } = await startRegistration(data, ip === "unknown" ? null : ip));
  } catch (err) {
    console.error("[registration] start failed", err);
    return { status: "error", message: "Registreringen kunde inte sparas just nu. Försök igen om en stund.", values, attempt };
  }

  const next = registrationDonePath(token);
  if (isDemo()) return { status: "done", email: data.email, demoLink: next, attempt };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: data.email,
    options: {
      shouldCreateUser: true,
      data: { full_name: data.contactName },
      emailRedirectTo: `${await origin()}/mitt-projekt/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    if (/rate limit|security purposes/i.test(error.message)) {
      return { status: "error", message: "Vänta en minut innan du begär en ny länk.", values, attempt };
    }
    console.error("[registration] otp failed", error.message);
    return { status: "error", message: "Kunde inte skicka länken just nu. Försök igen om en stund.", values, attempt };
  }
  return { status: "done", email: data.email, attempt };
}
