"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { getQuote } from "@/lib/quotes/store";
import { portalNoticeMail } from "@/lib/mail";
import { inviteMember } from "@/lib/portal/invite";
import { removePortalFile } from "@/lib/portal/files";
import { formatDay } from "@/lib/portal/format";
import { guessPhaseTemplate, resolvePhaseTemplate } from "@/lib/portal/phase-templates";
import {
  changeOrderFormSchema,
  delayFormSchema,
  documentFormSchema,
  phaseTemplateFormSchema,
  projectFormSchema,
  timelineFormSchema,
  updateFormSchema,
  type ProjectForm,
} from "@/lib/portal/schema";
import { shiftLine } from "@/lib/portal/timeline";
import {
  addChangeOrder,
  addDelay,
  addDocument,
  addUpdate,
  createProject,
  findProjectByQuote,
  getProject,
  getProjectBundle,
  listMemberEmails,
  listPhaseTemplates,
  removeChangeOrder,
  removeDelay,
  removeDocument,
  removeMember,
  removePhaseTemplate,
  removeProject,
  removeUpdate,
  savePhaseTemplate,
  saveTimeline,
  scheduleChangeOrder,
  setPhaseDone,
  updateProject,
} from "@/lib/portal/store";
import { isIsoDate } from "@/lib/workdays";
import type { ContentActionState } from "./content-actions";

/**
 * Everything /admin/projekt does. Each action checks the admin itself — they
 * are reachable directly — and RLS checks again in the database. Simple forms
 * (phases, members, documents) redirect back to the project with ?sparat or
 * ?fel=…; the richer ones return a ContentActionState for useActionState.
 */

const LIST = "/admin/projekt";
/** ?vid=tidplan shows the message in the Tidplan section, where the admin is. */
type Flash = { sparat?: string; fel?: string; slut?: string; var?: string; vid?: "tidplan" };
const tidplanUrl = (id: string, q: Flash) => projectUrl(id, { ...q, vid: "tidplan" }) + "#tidplan";
const projectUrl = (id: string, q?: Flash) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q ?? {})) if (v) p.set(k, v);
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

/** redirect() throws on purpose; let it through a catch. */
const isRedirect = (err: unknown) => err instanceof Error && "digest" in err;

/** Mail the project's customers about something new. Never throws — a lost mail must not fail the save. */
async function notifyMembers(projectId: string, kind: "update" | "document" | "change_order" | "delay", summary?: string): Promise<void> {
  try {
    const [project, to] = await Promise.all([getProject(projectId), listMemberEmails(projectId)]);
    if (!project) return;
    await portalNoticeMail({ kind, to, projectId, projectTitle: project.title, summary });
  } catch (err) {
    console.error(`[portal] ${kind} notice failed`, err);
  }
}

function refresh(id?: string) {
  revalidatePath(LIST, "layout");
  if (id) revalidatePath(`/mitt-projekt/${id}`, "layout");
  revalidatePath("/mitt-projekt");
}

/* ---------- create ---------- */

/** What the create forms send about the timeline: a template, a start date, Saturdays. */
async function timelineStart(formData: FormData, title: string) {
  const starts_on = str(formData, "starts_on", 10);
  const template = str(formData, "template", 60) || guessPhaseTemplate(title);
  return {
    starts_on: isIsoDate(starts_on) ? starts_on : "",
    works_saturdays: formData.get("works_saturdays") === "on",
    phases: resolvePhaseTemplate(template, template.startsWith("saved:") ? await listPhaseTemplates() : []),
  };
}

/** "Skapa projekt" from an accepted quote: customer, address and title follow; the template gives the phases. */
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
  };
  const id = await createProject(form, { quote_id: quote.id, created_by: email, ...(await timelineStart(formData, quote.data.title)) });
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
  });
  if (!parsed.success) redirect(`${LIST}/ny?fel=${encodeURIComponent(parsed.error.issues[0].message)}`);
  const id = await createProject(parsed.data, { quote_id: null, created_by: email, ...(await timelineStart(formData, parsed.data.title)) });
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
    const keys = [...bundle.photos.map((p) => p.path), ...bundle.documents.map((d) => d.path).filter((p) => !p.startsWith("quote:"))];
    await Promise.all(keys.map((k) => removePortalFile(k).catch(() => undefined)));
    await removeProject(id);
  }
  refresh(id);
  redirect(LIST);
}

/* ---------- timeline ---------- */

/** Where a phase action returns: the project's Tidplan, or the list for the nudge buttons. */
const phaseBack = (formData: FormData, id: string, q?: Flash) =>
  formData.get("back") === "list" ? LIST + (q?.fel ? `?fel=${encodeURIComponent(q.fel)}` : "") : tidplanUrl(id, q ?? {});

/** "Spara tidplan": start, Saturdays, phase names, durations and order in one go. */
export async function saveTimelineAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  let raw: unknown = null;
  try {
    raw = JSON.parse(String(formData.get("timeline") || "{}"));
  } catch {
    // falls through to the schema error below
  }
  const parsed = timelineFormSchema.safeParse(raw);
  if (!parsed.success) redirect(tidplanUrl(id, { fel: parsed.error.issues[0].message }));
  try {
    await saveTimeline(id, parsed.data);
  } catch (err) {
    if (isRedirect(err)) throw err;
    redirect(tidplanUrl(id, { fel: err instanceof Error ? err.message : "Kunde inte spara tidplanen." }));
  }
  refresh(id);
  redirect(tidplanUrl(id, { sparat: "tidplan" }));
}

/** "Klar" on a phase, from the project or from the nudge on the list. */
export async function togglePhaseAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  await setPhaseDone(id, str(formData, "phase"), formData.get("done") === "1");
  refresh(id);
  redirect(phaseBack(formData, id));
}

/**
 * "Försening": days and a reason written for the customer. Later phases and
 * the end move; the customer is mailed if the box was ticked. Afterwards the
 * admin lands on the project with the new end in view, to accept it or
 * shorten later phases.
 */
export async function addDelayAction(formData: FormData): Promise<void> {
  const { email } = await requireAdmin();
  const id = str(formData, "project");
  const parsed = delayFormSchema.safeParse({ days: str(formData, "days", 8), reason: str(formData, "reason", 300) });
  if (!parsed.success) redirect(phaseBack(formData, id, { fel: parsed.error.issues[0].message }));
  let result: Awaited<ReturnType<typeof addDelay>>;
  try {
    result = await addDelay(id, str(formData, "phase"), parsed.data, email);
  } catch (err) {
    if (isRedirect(err)) throw err;
    redirect(phaseBack(formData, id, { fel: err instanceof Error ? err.message : "Kunde inte spara förseningen." }));
  }
  if (formData.get("notify") === "on") {
    const end = result.after ? `\nNytt beräknat slut: ${formatDay(result.after)}.` : "";
    await notifyMembers(id, "delay", `${result.phase}: ${shiftLine(parsed.data)}${end}`);
  }
  refresh(id);
  redirect(tidplanUrl(id, { sparat: "forsening", slut: result.after, var: result.before }));
}

export async function removeDelayAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  await removeDelay(id, str(formData, "shift"));
  refresh(id);
  redirect(tidplanUrl(id, {}));
}

/** "Lägg in": an approved ÄTA becomes a phase after the chosen one. */
export async function scheduleChangeOrderAction(formData: FormData): Promise<void> {
  const { email } = await requireAdmin();
  const id = str(formData, "project");
  let result: { before: string; after: string };
  try {
    result = await scheduleChangeOrder(id, str(formData, "order"), str(formData, "after"), email);
  } catch (err) {
    if (isRedirect(err)) throw err;
    redirect(tidplanUrl(id, { fel: err instanceof Error ? err.message : "Kunde inte lägga in ÄTA:n." }));
  }
  refresh(id);
  redirect(tidplanUrl(id, { sparat: "ata-tid", slut: result.after, var: result.before }));
}

/** "Spara som mall": this project's phases (not the ÄTA ones) with their planned durations. */
export async function savePhaseTemplateAction(formData: FormData): Promise<void> {
  const { email } = await requireAdmin();
  const id = str(formData, "project");
  const parsed = phaseTemplateFormSchema.safeParse({ name: str(formData, "name", 80), job_type: str(formData, "job_type", 40) });
  if (!parsed.success) redirect(tidplanUrl(id, { fel: parsed.error.issues[0].message }));
  const bundle = await getProjectBundle(id);
  const phases = (bundle?.phases ?? []).filter((p) => !p.change_order_id).map((p) => ({ name: p.name, days: p.duration_days }));
  if (!phases.length) redirect(tidplanUrl(id, { fel: "Tidplanen har inga faser att spara." }));
  await savePhaseTemplate({ ...parsed.data, phases }, email);
  refresh(id);
  redirect(tidplanUrl(id, { sparat: "mall" }));
}

export async function removePhaseTemplateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  await removePhaseTemplate(str(formData, "template"));
  refresh();
  redirect(`${LIST}/ny`);
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
  const parsed = updateFormSchema.safeParse({ body: str(formData, "body"), photos, phase_id: str(formData, "phase", 60) || null, day: str(formData, "day", 10) });
  if (!parsed.success) return { error: parsed.error.issues[0].message, fieldErrors: fieldErrors(parsed.error.issues) };
  // Only keys inside this project may be attached.
  if (parsed.data.photos.some((p) => !p.startsWith(`projects/${id}/`))) return { error: "Ett foto hör inte till projektet." };
  try {
    await addUpdate(id, parsed.data, check.email);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Kunde inte spara." };
  }
  await notifyMembers(id, "update", parsed.data.body || `${parsed.data.photos.length} nya foton`);
  refresh(id);
  return { ok: true, savedAt: new Date().toISOString() };
}

export async function removeUpdateAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  const bundle = await getProjectBundle(id);
  const update = bundle?.updates.find((u) => u.id === str(formData, "update"));
  if (bundle && update) {
    const keys = bundle.photos.filter((p) => p.update_id === update.id).map((p) => p.path);
    await Promise.all(keys.map((k) => removePortalFile(k).catch(() => undefined)));
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
  await notifyMembers(id, "document", parsed.data.title);
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

/* ---------- ÄTA ---------- */

/** A new change order for the customer to answer; the customer is mailed. */
export async function addChangeOrderAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  const parsed = changeOrderFormSchema.safeParse({
    title: str(formData, "title", 120),
    description: str(formData, "description", 3000),
    amount: str(formData, "amount", 12).replace(/\s/g, ""),
    labor_amount: str(formData, "labor_amount", 12).replace(/\s/g, "") || "0",
    duration_days: str(formData, "duration_days", 8),
  });
  if (!parsed.success) redirect(projectUrl(id, { fel: parsed.error.issues[0].message }) + "#ata");
  try {
    const order = await addChangeOrder(id, parsed.data);
    await notifyMembers(id, "change_order", `ÄTA ${order.number}: ${order.title}`);
  } catch (err) {
    if (isRedirect(err)) throw err;
    redirect(projectUrl(id, { fel: err instanceof Error ? err.message : "Kunde inte spara ändringen." }) + "#ata");
  }
  refresh(id);
  redirect(projectUrl(id, { sparat: "ata" }) + "#ata");
}

export async function removeChangeOrderAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData, "project");
  await removeChangeOrder(str(formData, "order"));
  refresh(id);
  redirect(projectUrl(id) + "#ata");
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
    if (isRedirect(err)) throw err;
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
