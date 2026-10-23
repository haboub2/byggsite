"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/admin";
import { deleteInterest } from "@/lib/interest";

/** Remove a spam or test registration from /admin/intresse. Site admins only, as RLS also says. */
export async function deleteInterestAction(formData: FormData): Promise<void> {
  const check = await requireRole("site");
  if (!check.ok) return;
  await deleteInterest(String(formData.get("id") ?? "")).catch((err) => console.error("[interest] delete:", err));
  revalidatePath("/admin/intresse");
}
