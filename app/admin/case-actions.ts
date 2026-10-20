"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/admin";
import { caseSchema } from "@/lib/case-schema";
import { listAllCases, removeCase, storeCase } from "@/lib/cases";
import type { ContentActionState } from "./content-actions";

/** Create or update a case. `original` is the slug being edited, empty for a new one. */
export async function saveCase(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await requireRole("site");
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };

  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Formuläret kunde inte läsas. Ladda om sidan och försök igen." };
  }
  const parsed = caseSchema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { error: "Några fält behöver rättas innan det går att spara.", fieldErrors };
  }
  const c = parsed.data;

  const original = String(formData.get("original") ?? "") || null;
  const error = await storeCase(c, original);
  if (error) {
    return error.includes("Adressen") ? { error, fieldErrors: { slug: error } } : { error };
  }

  revalidatePath("/", "layout");
  // New case, or a changed address: continue on the case's own URL.
  if (original !== c.slug) redirect(`/admin/innehall/case/${c.slug}?sparat=1`);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function deleteCase(formData: FormData): Promise<void> {
  const check = await requireRole("site");
  if (!check.ok) return;
  const slug = String(formData.get("slug") ?? "");
  if (slug) await removeCase(slug);
  revalidatePath("/", "layout");
  redirect("/admin/innehall/case");
}

/** Move a case one step up or down in the order shown on the site. */
export async function moveCase(formData: FormData): Promise<void> {
  const check = await requireRole("site");
  if (!check.ok) return;
  const slug = String(formData.get("slug") ?? "");
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const list = await listAllCases();
  const i = list.findIndex((c) => c.slug === slug);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  const ordered = list.map((c, k) => ({ ...c, sort: k * 10 }));
  [ordered[i].sort, ordered[j].sort] = [ordered[j].sort, ordered[i].sort];
  for (const c of ordered) {
    if (c.sort !== list.find((x) => x.slug === c.slug)?.sort) await storeCase(c, c.slug);
  }
  revalidatePath("/", "layout");
}
