"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { removePortalFile } from "@/lib/portal/files";
import { lockDocumentation, scheduleReportRefresh, unlockDocumentation } from "@/lib/portal/report";
import { noteEditSchema, photoEditSchema, summarySchema } from "@/lib/portal/schema";
import { removePhoto, setFinalSummary, setPhaseSummary, updateNote, updatePhoto } from "@/lib/portal/store";

/**
 * The "Dokumentation" page in /admin/projekt/[id]: the tree phase → day →
 * photos, edited in place. Each field saves on its own (called from the
 * client components with plain arguments) and answers { error } or {}.
 * Every change renders the cached report again after the response.
 */

export type DocResult = { error?: string };

const page = (id: string) => `/admin/projekt/${id}/dokumentation`;

function refresh(id: string) {
  revalidatePath(page(id));
  revalidatePath(`/admin/projekt/${id}`);
  revalidatePath("/admin/projekt");
  revalidatePath(`/mitt-projekt/${id}`, "layout");
}

async function run(projectId: string, work: () => Promise<unknown>): Promise<DocResult> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };
  try {
    await work();
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  scheduleReportRefresh(projectId);
  refresh(projectId);
  return {};
}

/** Caption, "ta med i rapporten", phase and day of one photo. */
export async function savePhoto(input: { project: string; photo: string; caption: string; in_report: boolean; phase_id: string | null; day: string }): Promise<DocResult> {
  const parsed = photoEditSchema.safeParse({ caption: input.caption, in_report: input.in_report, phase_id: input.phase_id || null, day: input.day });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return run(input.project, () => updatePhoto(input.project, input.photo, parsed.data));
}

export async function deletePhoto(input: { project: string; photo: string }): Promise<DocResult> {
  return run(input.project, async () => {
    const key = await removePhoto(input.project, input.photo);
    if (key) await removePortalFile(key).catch(() => undefined);
  });
}

/** The day's note: its text, phase and day. */
export async function saveNote(input: { project: string; update: string; body: string; phase_id: string | null; day: string }): Promise<DocResult> {
  const parsed = noteEditSchema.safeParse({ body: input.body, phase_id: input.phase_id || null, day: input.day });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return run(input.project, () => updateNote(input.project, input.update, parsed.data));
}

/** A phase's summary (phase given) or the project's "Slutdokumentation" (phase null). */
export async function saveSummary(input: { project: string; phase: string | null; text: string }): Promise<DocResult> {
  const parsed = summarySchema.safeParse(input.text);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  return run(input.project, () => (input.phase ? setPhaseSummary(input.project, input.phase, parsed.data) : setFinalSummary(input.project, parsed.data)));
}

const isRedirect = (err: unknown) => err instanceof Error && "digest" in err;

/** "Lås dokumentationen": the final PDF is stored as a document and everything becomes read-only. */
export async function lockAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  const id = String(formData.get("project") ?? "");
  try {
    await lockDocumentation(id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    redirect(`${page(id)}?fel=${encodeURIComponent(err instanceof Error ? err.message : "Kunde inte låsa.")}`);
  }
  refresh(id);
  redirect(`${page(id)}?sparat=last`);
}

export async function unlockAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  const id = String(formData.get("project") ?? "");
  await unlockDocumentation(id);
  refresh(id);
  redirect(`${page(id)}?sparat=upplast`);
}
