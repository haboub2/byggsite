"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { projectSchema } from "@/lib/project-schema";
import { listAllProjects, removeProject, storeProject } from "@/lib/projects";
import { services } from "@/lib/placeholder";
import type { ContentActionState } from "./content-actions";

/** Create or update a project. `original` is the slug being edited, empty for a new one. */
export async function saveProject(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };

  let data: unknown;
  try {
    data = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return { error: "Formuläret kunde inte läsas. Ladda om sidan och försök igen." };
  }
  const parsed = projectSchema.safeParse(data);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return { error: "Några fält behöver rättas innan det går att spara.", fieldErrors };
  }
  const p = parsed.data;
  if (p.service && !services.some((s) => s.slug === p.service)) {
    return { error: "Okänd tjänst.", fieldErrors: { service: "Välj en tjänst i listan." } };
  }

  const original = String(formData.get("original") ?? "") || null;
  const error = await storeProject(p, original);
  if (error) {
    return error.includes("Adressen") ? { error, fieldErrors: { slug: error } } : { error };
  }

  revalidatePath("/", "layout");
  // New project, or a changed address: continue on the project's own URL.
  if (original !== p.slug) redirect(`/admin/innehall/projekt/${p.slug}?sparat=1`);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function deleteProject(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const slug = String(formData.get("slug") ?? "");
  if (slug) await removeProject(slug);
  revalidatePath("/", "layout");
  redirect("/admin/innehall/projekt");
}

/** Move a project one step up or down in the order shown on the site. */
export async function moveProject(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const slug = String(formData.get("slug") ?? "");
  const dir = formData.get("dir") === "up" ? -1 : 1;
  const list = await listAllProjects();
  const i = list.findIndex((p) => p.slug === slug);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  // Renumber everything so the order is explicit, then swap the two.
  const ordered = list.map((p, k) => ({ ...p, sort: k * 10 }));
  [ordered[i].sort, ordered[j].sort] = [ordered[j].sort, ordered[i].sort];
  for (const p of ordered) {
    if (p.sort !== list.find((x) => x.slug === p.slug)?.sort) await storeProject(p, p.slug);
  }
  revalidatePath("/", "layout");
}
