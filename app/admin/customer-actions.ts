"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { customerSchema } from "@/lib/core/customers/schema";
import { archiveCustomer, createCustomer, updateCustomer } from "@/lib/core/customers/store";
import type { ContentActionState } from "./content-actions";

const LIST = "/admin/kunder";

/** Create or update a customer; the form posts the record as JSON. */
export async function saveCustomer(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };
  const id = String(formData.get("id") ?? "");
  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Formuläret kunde inte läsas. Ladda om sidan och försök igen." };
  }
  const parsed = customerSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { error: "Några fält behöver rättas innan det går att spara.", fieldErrors };
  }
  try {
    if (id) {
      await updateCustomer(id, parsed.data);
    } else {
      const newId = await createCustomer(parsed.data, check.email);
      revalidatePath(LIST, "layout");
      redirect(`${LIST}/${newId}?skapad=1`);
    }
  } catch (err) {
    if (err && typeof err === "object" && "digest" in err) throw err; // the redirect
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  revalidatePath(LIST, "layout");
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function archiveCustomerAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const id = String(formData.get("id") ?? "");
  if (id) await archiveCustomer(id);
  revalidatePath(LIST, "layout");
  redirect(LIST);
}
