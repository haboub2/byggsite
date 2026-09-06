"use server";

import { redirect } from "next/navigation";
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
