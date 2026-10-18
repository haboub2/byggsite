"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { getQuote } from "@/lib/quotes/store";
import { inviteMember } from "@/lib/portal/invite";
import { removePortalFile } from "@/lib/portal/files";
import {
  DEFAULT_PHASES,
  documentFormSchema,
  phaseFormSchema,
  projectFormSchema,
  updateFormSchema,
  type ProjectForm,
} from "@/lib/portal/schema";
import {
  addDocument,
  addPhase,
  addUpdate,
  createProject,
  findProjectByQuote,
  getProject,
  getProjectBundle,
  movePhase,
  removeDocument,
  removeMember,
  removePhase,
  removeProject,
  removeUpdate,
  updatePhase,
  updateProject,
} from "@/lib/portal/store";
import type { ContentActionState } from "./content-actions";

/**
 * Everything /admin/projekt does. Each action checks the admin itself — they
 * are reachable directly — and RLS checks again in the database. Simple forms
 * (phases, members, documents) redirect back to the project with ?sparat or
 * ?fel=…; the richer ones return a ContentActionState for useActionState.
 */

const LIST = "/admin/projekt";
const projectUrl = (id: string, q?: { sparat?: string; fel?: string }) => {
  const p = new URLSearchParams();
  if (q?.sparat) p.set("sparat", q.sparat);
  if (q?.fel) p.set("fel", q.fel);
  const s = p.toString();
  return `${LIST}/${id}${s ? `?${s}` : ""}`;
};

async function requireAdmin(): Promise<{ email: string | null }> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  return { email: check.email };
}

function fieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const path = issue.path.join(".");
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

const str = (formData: FormData, key: string, max = 4000) => String(formData.get(key) ?? "").trim().slice(0, max);

function refresh(id?: string) {
  revalidatePath(LIST, "layout");
  if (id) revalidatePath(`/mitt-projekt/${id}`, "layout");
  revalidatePath("/mitt-projekt");
}

/* ---------- create ---------- */

/** "Skapa projekt" from an accepted quote: customer, address and title follow. */
export async function createProjectFromQuote(formData: FormData): Promise<void> {
  const { email } = await requireAdmin();
  const quoteId = str(formData, "quote");
  const quote = await getQuote(quoteId);
  if (!quote) redirect(`${LIST}/ny?fel=offert`);

  const existing = await findProjectByQuote(quote.id);
  if (existing) redirect(projectUrl(existing.id));

  const c = quote.data.customer;
  const address = [c.street, [c.postalCode, c.city].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const form: ProjectForm = {
    title: quote.data.title || "Byggprojekt",
    address,
    customer_name: c.type === "foretag" && c.company ? c.company : c.name,
    status: "active",
    current_phase: "",
    this_week: "",
    next_step: "",
    contact_name: "",
    contact_phone: "",
    starts_on: "",
    ends_on: "",
  };
  const id = await createProject(form, { quote_id: quote.id, created_by: email, phases: DEFAULT_PHASES });
  await addDocument(id, { kind: "quote", title: `Offert ${quote.number} — ${quote.data.title}`, path: `quote:${quote.id}` });
  refresh();
  redirect(projectUrl(id, { sparat: "skapat" }));
}

/** A project without a quote (older jobs, or quotes written elsewhere). */
export async function createProjectBlank(formData: FormData): Promise<void> {
  const { email } = await requireAdmin();
  const parsed = projectFormSchema.safeParse({
    title: str(formData, "title"),
    address: str(formData, "address"),
    customer_name: str(formData, "customer_name"),
    status: "active",
    current_phase: "",
    this_week: "",
    next_step: "",
    contact_name: "",
    contact_phone: "",
    starts_on: "",
    ends_on: "",
  });
  if (!parsed.success) redirect(`${LIST}/ny?fel=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const id = await createProject(parsed.data, { quote_id: null, created_by: email, phases: DEFAULT_PHASES });
  refresh();
  redirect(projectUrl(id, { sparat: "skapat" }));
}

/* ---------- the project itself ---------- */

export async function saveProjectDetails(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };
  const id = str(formData, "id");
  const parsed = projectFormSchema.safeParse({
    title: str(formData, "title"),
    address: str(formData, "address"),
    customer_name: str(formData, "customer_name"),
    status: str(formData, "status"),
    current_phase: str(formData, "current_phase"),
    this_week: str(formData, "this_week"),
    next_step: str(formData, "next_step"),
    contact_name: str(formData, "contact_name"),
    contact_phone: str(formData, "contact_phone"),
    starts_on: str(formData, "starts_on"),
    ends_on: str(formData, "ends_on"),
  });
  if (!parsed.success) return { error: "Några fält behöver rättas.", fieldErrors: fieldErrors(parsed.error.issues) };
  try {
    await updateProject(id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  refresh(id);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function deleteProject(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "id");
  const bundle = await getProjectBundle(id);
  if (bundle) {
    const keys = [...bundle.updates.flatMap((u) => u.photos), ...bundle.documents.map((d) => d.path).filter((p) => !p.startsWith("quote:"))];
    await Promise.all(keys.map((k) => removePortalFile(k).catch(() => undefined)));
    await removeProject(id);
  }
  refresh(id);
  redirect(LIST);
}

/* ---------- phases ---------- */

export async function addPhaseAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  const parsed = phaseFormSchema.safeParse({ name: str(formData, "name"), starts_on: str(formData, "starts_on"), ends_on: str(formData, "ends_on") });
  if (!parsed.success) redirect(projectUrl(id, { fel: parsed.error.issues[0].message }));
  await addPhase(id, parsed.data);
  refresh(id);
  redirect(projectUrl(id) + "#faser");
}

export async function savePhaseAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  const phaseId = str(formData, "phase");
  const parsed = phaseFormSchema.safeParse({ name: str(formData, "name"), starts_on: str(formData, "starts_on"), ends_on: str(formData, "ends_on") });
  if (!parsed.success) redirect(projectUrl(id, { fel: parsed.error.issues[0].message }));
  await updatePhase(phaseId, parsed.data);
  refresh(id);
  redirect(projectUrl(id) + "#faser");
}

export async function togglePhaseAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  await updatePhase(str(formData, "phase"), { done: formData.get("done") === "1" });
  refresh(id);
  redirect(projectUrl(id) + "#faser");
}

export async function movePhaseAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  await movePhase(str(formData, "phase"), formData.get("dir") === "up" ? -1 : 1);
  refresh(id);
  redirect(projectUrl(id) + "#faser");
}

export async function removePhaseAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  await removePhase(str(formData, "phase"));
  refresh(id);
  redirect(projectUrl(id) + "#faser");
}

/* ---------- updates ---------- */

export async function postUpdate(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };
  const id = str(formData, "project");
  let photos: unknown = [];
  try {
    photos = JSON.parse(String(formData.get("photos") || "[]"));
  } catch {
    return { error: "Fotolistan kunde inte läsas. Ladda om sidan." };
  }
  const parsed = updateFormSchema.safeParse({ body: str(formData, "body"), photos });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fieldErrors: fieldErrors(parsed.error.issues) };
  // Only keys inside this project may be attached.
  if (parsed.data.photos.some((p) => !p.startsWith(`projects/${id}/`))) return { error: "Ett foto hör inte till projektet." };
  try {
    await addUpdate(id, parsed.data.body, parsed.data.photos, check.email);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  refresh(id);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function removeUpdateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  const bundle = await getProjectBundle(id);
  const update = bundle?.updates.find((u) => u.id === str(formData, "update"));
  if (update) {
    await Promise.all(update.photos.map((k) => removePortalFile(k).catch(() => undefined)));
    await removeUpdate(update.id);
  }
  refresh(id);
  redirect(projectUrl(id) + "#uppdateringar");
}

/* ---------- documents ---------- */

export async function addDocumentAction(_prev: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const check = await checkAdmin();
  if (!check.ok) return { error: "Du saknar behörighet. Logga in igen." };
  const id = str(formData, "project");
  const parsed = documentFormSchema.safeParse({ kind: str(formData, "kind"), title: str(formData, "title"), path: str(formData, "path") });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fieldErrors: fieldErrors(parsed.error.issues) };
  if (!parsed.data.path.startsWith(`projects/${id}/`)) return { error: "Filen hör inte till projektet." };
  try {
    await addDocument(id, parsed.data);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  refresh(id);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function removeDocumentAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  const bundle = await getProjectBundle(id);
  const doc = bundle?.documents.find((d) => d.id === str(formData, "document"));
  if (doc) {
    if (!doc.path.startsWith("quote:")) await removePortalFile(doc.path).catch(() => undefined);
    await removeDocument(doc.id);
  }
  refresh(id);
  redirect(projectUrl(id) + "#dokument");
}

/* ---------- members ---------- */

export async function inviteMemberAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  const email = str(formData, "email", 120).toLowerCase();
  const name = str(formData, "name", 80);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) redirect(projectUrl(id, { fel: "Ange en giltig e-postadress." }));
  const project = await getProject(id);
  if (!project) redirect(LIST);
  try {
    const { existing } = await inviteMember(project, email, name);
    refresh(id);
    redirect(projectUrl(id, { sparat: existing ? "tillagd" : "inbjuden" }) + "#kunder");
  } catch (err) {
    // redirect() throws on purpose; let it through.
    if (err instanceof Error && "digest" in err) throw err;
    redirect(projectUrl(id, { fel: err instanceof Error ? err.message : "Kunde inte bjuda in." }) + "#kunder");
  }
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  await removeMember(id, str(formData, "user"));
  refresh(id);
  redirect(projectUrl(id) + "#kunder");
}
