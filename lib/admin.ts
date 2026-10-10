import "server-only";
import { createClient } from "./supabase/server";
import { isDemo } from "./leads";

export type AdminCheck =
  | { ok: true; email: string | null; demo: boolean }
  | { ok: false; reason: "signed-out" | "not-admin"; email?: string | null };

/**
 * Who is asking, and are they an admin? Used by the admin layout, every
 * server action and the CSV export — server actions and route handlers are
 * reachable directly, so each one checks for itself instead of trusting the
 * layout. RLS enforces the same rule again in the database.
 */
export async function checkAdmin(): Promise<AdminCheck> {
  if (isDemo()) return { ok: true, email: "demo@localhost", demo: true };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "signed-out" };

  const { data: admin } = await supabase.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!admin) return { ok: false, reason: "not-admin", email: user.email };

  return { ok: true, email: user.email ?? null, demo: false };
}
