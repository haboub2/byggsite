"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { checkAdmin } from "@/lib/admin";
import { STATUSES, updateLead, type LeadStatus } from "@/lib/leads";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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

  redirect("/admin");
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
