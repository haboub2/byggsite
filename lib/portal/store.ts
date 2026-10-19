import "server-only";
import { createClient as createSessionClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { isDemo } from "../leads";
import { roundHalf, shiftWorkdays } from "../workdays";
import { formatDay, todayIso } from "./format";
import type { TemplatePhase } from "./phase-templates";
import {
  CHANGE_ORDER_STATUSES,
  DOCUMENT_KINDS,
  PROJECT_STATUSES,
  SHIFT_KINDS,
  type ChangeOrder,
  type ChangeOrderForm,
  type ChangeOrderStatus,
  type DocumentKind,
  type PortalProject,
  type ProjectBundle,
  type ProjectDocument,
  type ProjectForm,
  type ProjectMember,
  type ProjectPhase,
  type ProjectPhoto,
  type ProjectStatus,
  type ProjectUpdate,
  type SavedPhaseTemplate,
  type ShiftKind,
  type TimelineForm,
  type TimelineShift,
} from "./schema";
import { changeOrderPhaseName, computeTimeline, movePlannedEnd } from "./timeline";

/**
 * The portal tables (supabase/migrations/0010_portal.sql, 0012_timeline.sql),
 * always read and written with the caller's session so RLS decides: admins
 * see everything, a customer only the projects they are a member of. The
 * same functions therefore serve both /admin/projekt and /mitt-projekt.
 * Demo mode keeps everything in memory with one example project.
 *
 * Phase dates and the project end are never written directly: every change
 * to the start, a duration, the order or a shift ends in recomputeTimeline(),
 * which computes them (lib/portal/timeline.ts) and stores the result.
 */

type ProjectRow = Omit<PortalProject, "status" | "starts_on" | "ends_on" | "planned_ends_on" | "works_saturdays"> & {
  status: string;
  starts_on: string | null;
  ends_on: string | null;
  planned_ends_on: string | null;
  works_saturdays: boolean | null;
};
type UpdateRow = Omit<ProjectUpdate, "photos">;

const fromProjectRow = (r: ProjectRow): PortalProject => ({
  ...r,
  status: PROJECT_STATUSES.includes(r.status as ProjectStatus) ? (r.status as ProjectStatus) : "active",
  starts_on: r.starts_on ?? "",
  ends_on: r.ends_on ?? "",
  planned_ends_on: r.planned_ends_on ?? "",
  works_saturdays: Boolean(r.works_saturdays),
});

// numeric columns may arrive as strings; never let one through as text.
const fromPhaseRow = (r: ProjectPhase): ProjectPhase => ({ ...r, duration_days: roundHalf(Number(r.duration_days)), change_order_id: r.change_order_id ?? null });

const fromDocumentRow = (r: ProjectDocument): ProjectDocument => ({
  ...r,
  kind: DOCUMENT_KINDS.includes(r.kind) ? r.kind : "other",
});

const fromChangeOrderRow = (r: ChangeOrder): ChangeOrder => ({
  ...r,
  description: r.description ?? "",
  status: CHANGE_ORDER_STATUSES.includes(r.status) ? r.status : "pending",
  duration_days: roundHalf(Number(r.duration_days ?? 0)),
});

const fromShiftRow = (r: TimelineShift): TimelineShift => ({
  ...r,
  kind: SHIFT_KINDS.includes(r.kind) ? r.kind : "delay",
  days: roundHalf(Number(r.days)),
  reason: r.reason ?? "",
});

const fromPhotoRow = (r: ProjectPhoto): ProjectPhoto => ({ ...r, caption: r.caption ?? "" });

/** Each post with the keys of its photos, in order. */
function withPhotos(updates: UpdateRow[], photos: ProjectPhoto[]): ProjectUpdate[] {
  return updates.map((u) => ({
    ...u,
    photos: photos
      .filter((p) => p.update_id === u.id)
      .sort((a, b) => a.sort - b.sort)
      .map((p) => p.path),
  }));
}

/** Empty dates go to the database as null. */
const dateOrNull = (d: string) => d || null;

const fail = (what: string, message: string): never => {
  throw new Error(`${what}: ${message}`);
};

/* ---------- demo store ---------- */

type Demo = {
  projects: ProjectRow[];
  members: ProjectMember[];
  phases: ProjectPhase[];
  updates: UpdateRow[];
  photos: ProjectPhoto[];
  documents: ProjectDocument[];
  changeOrders: ChangeOrder[];
  shifts: TimelineShift[];
  templates: SavedPhaseTemplate[];
};
const g = globalThis as unknown as { __binaafyPortal?: Demo };

function demo(): Demo {
  // A dev server that was running before Tidplan 2.0 holds an object without
  // durations, shifts or photos; start over rather than patch it.
  if (g.__binaafyPortal?.shifts) return g.__binaafyPortal;
  const now = new Date();
  const iso = (daysFromNow: number) => new Date(now.getTime() + daysFromNow * 86_400_000).toISOString();
  const today = todayIso(now);
  const projectId = "11111111-1111-4111-8111-111111111111";
  // Eight working days in: Uppstart, Rivning and El och VVS (one day late)
  // are done, Tätskikt should have been finished yesterday, so the nudge on
  // /admin/projekt has something to show. ÄTA 1 is approved but not yet in
  // the timeline; ÄTA 2 waits for the customer.
  const starts_on = shiftWorkdays(today, -8);
  const plan: [string, number][] = [
    ["Uppstart och skydd", 0.5],
    ["Rivning", 1.5],
    ["El och VVS", 3],
    ["Tätskikt", 2],
    ["Kakel och klinker", 4],
    ["Montering", 2],
    ["Slutbesiktning", 0.5],
  ];
  const phases: ProjectPhase[] = plan.map(([name, duration_days], i) => ({
    id: `phase-${i}`,
    project_id: projectId,
    name,
    sort: i,
    starts_on: null,
    ends_on: null,
    duration_days,
    change_order_id: null,
    done_at: null,
  }));
  const shifts: TimelineShift[] = [
    {
      id: "s1",
      project_id: projectId,
      kind: "delay",
      phase_id: "phase-2",
      change_order_id: null,
      days: 1,
      reason: "Elcentralen behövde bytas innan golvvärmen kunde kopplas in.",
      created_at: iso(-4),
      created_by: "demo@localhost",
    },
  ];
  const project: ProjectRow = {
    id: projectId,
    quote_id: null,
    title: "Badrumsrenovering",
    address: "Exempelgatan 12, Göteborg",
    customer_name: "Anna Exempel",
    status: "active",
    current_phase: "",
    this_week: "Tätskiktet läggs i duschzonen och på golvet. Torktid till torsdag, sedan börjar vi med klinkern.",
    next_step: "",
    contact_name: "Ibrahim",
    contact_phone: "+46793049737",
    starts_on,
    ends_on: null,
    planned_ends_on: null,
    works_saturdays: false,
    created_by: "demo@localhost",
    created_at: iso(-15),
    updated_at: iso(-1),
  };
  applyTimeline(project, phases, shifts);
  for (const ph of phases.slice(0, 3)) ph.done_at = `${ph.ends_on}T15:00:00.000Z`;
  const update = (id: string, phase: ProjectPhase, body: string): UpdateRow => ({
    id,
    project_id: projectId,
    body,
    phase_id: phase.id,
    day: phase.ends_on!,
    created_by: "demo@localhost",
    created_at: `${phase.ends_on}T15:00:00.000Z`,
  });
  g.__binaafyPortal = {
    projects: [project],
    members: [{ project_id: projectId, user_id: "kund@example.se", email: "kund@example.se", name: "Anna Exempel", invited_at: iso(-15) }],
    phases,
    updates: [
      update("u1", phases[1], "Rivningen är klar och allt gammalt är bortforslat. Golvet är rent och torrt inför VVS-arbetet."),
      update("u2", phases[2], "Nya rör och golvvärme är på plats. Elektrikern har dragit uttag och belysning."),
    ],
    photos: [],
    documents: [{ id: "d1", project_id: projectId, kind: "quote", title: "Offert 1001 — Badrumsrenovering", path: "quote:demo", created_at: iso(-15) }],
    changeOrders: [
      {
        id: "c1",
        project_id: projectId,
        number: 1,
        title: "Extra eluttag vid handfatet",
        description: "Två extra uttag med jordfelsbrytare, inklusive dragning från befintlig dosa.",
        amount: 3200,
        labor_amount: 2400,
        status: "approved",
        duration_days: 1,
        answered_by: "kund@example.se",
        answered_name: "Anna Exempel",
        answered_at: iso(-2),
        created_at: iso(-3),
      },
      {
        id: "c2",
        project_id: projectId,
        number: 2,
        title: "Golvvärme även i hallen",
        description: "Elgolvvärme på 3 m² i hallen utanför badrummet, med egen termostat. Görs samtidigt som badrumsgolvet så att vi slipper riva igen.",
        amount: 9800,
        labor_amount: 6500,
        status: "pending",
        duration_days: 1.5,
        answered_by: null,
        answered_name: null,
        answered_at: null,
        created_at: iso(-1),
      },
    ],
    shifts,
    templates: [],
  };
  return g.__binaafyPortal;
}

/** Write the computed dates onto in-memory rows (demo store and seed). */
function applyTimeline(project: ProjectRow, phases: ProjectPhase[], shifts: TimelineShift[]): void {
  const ordered = phases.slice().sort((a, b) => a.sort - b.sort);
  const result = computeTimeline({
    starts_on: project.starts_on ?? "",
    works_saturdays: Boolean(project.works_saturdays),
    planned_ends_on: project.planned_ends_on ?? "",
    phases: ordered,
    shifts,
  });
  result.phases.forEach((r, i) => Object.assign(ordered[i], { starts_on: r.starts_on, ends_on: r.ends_on }));
  project.ends_on = result.ends_on;
  project.planned_ends_on = result.planned_ends_on;
}

/* ---------- projects ---------- */

/** All projects the caller may see: every one for admins, their own for customers. */
export async function listProjects(): Promise<PortalProject[]> {
  if (isDemo()) return demo().projects.slice().sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(fromProjectRow);
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("portal_projects").select("*").order("updated_at", { ascending: false }).limit(500);
  if (error) fail("Kunde inte hämta projekten", error.message);
  return (data as ProjectRow[]).map(fromProjectRow);
}

/** The signed-in customer's projects: RLS already limits the select to their
 *  memberships, and in demo mode everyone sees the example project. */
export async function listProjectsForUser(): Promise<PortalProject[]> {
  return listProjects();
}

export async function getProject(id: string): Promise<PortalProject | null> {
  if (isDemo()) {
    const r = demo().projects.find((p) => p.id === id);
    return r ? fromProjectRow(r) : null;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("portal_projects").select("*").eq("id", id).maybeSingle();
  if (error) fail("Kunde inte hämta projektet", error.message);
  return data ? fromProjectRow(data as ProjectRow) : null;
}

/** The project with everything the pages show, or null if it doesn't exist or the caller may not see it. */
export async function getProjectBundle(id: string): Promise<ProjectBundle | null> {
  const project = await getProject(id);
  if (!project) return null;
  if (isDemo()) {
    const d = demo();
    const photos = d.photos.filter((p) => p.project_id === id).sort((a, b) => a.day.localeCompare(b.day) || a.sort - b.sort);
    return {
      project,
      phases: d.phases.filter((p) => p.project_id === id).sort((a, b) => a.sort - b.sort),
      updates: withPhotos(
        d.updates.filter((u) => u.project_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
        photos
      ),
      documents: d.documents.filter((x) => x.project_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      members: d.members.filter((m) => m.project_id === id),
      changeOrders: d.changeOrders.filter((c) => c.project_id === id).sort((a, b) => b.number - a.number),
      shifts: d.shifts.filter((s) => s.project_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)),
      photos,
    };
  }
  const supabase = await createSessionClient();
  const [phases, updates, documents, members, changeOrders, shifts, photos] = await Promise.all([
    supabase.from("project_phases").select("*").eq("project_id", id).order("sort"),
    supabase.from("project_updates").select("id,project_id,body,phase_id,day,created_by,created_at").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_documents").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_members").select("*").eq("project_id", id).order("invited_at"),
    supabase.from("change_orders").select("*").eq("project_id", id).order("number", { ascending: false }),
    supabase.from("timeline_shifts").select("*").eq("project_id", id).order("created_at"),
    supabase.from("project_photos").select("*").eq("project_id", id).order("day").order("sort"),
  ]);
  for (const r of [phases, updates, documents, members, changeOrders, shifts, photos]) if (r.error) fail("Kunde inte hämta projektet", r.error.message);
  const photoRows = (photos.data as ProjectPhoto[]).map(fromPhotoRow);
  return {
    project,
    phases: (phases.data as ProjectPhase[]).map(fromPhaseRow),
    updates: withPhotos(updates.data as UpdateRow[], photoRows),
    documents: (documents.data as ProjectDocument[]).map(fromDocumentRow),
    members: members.data as ProjectMember[],
    changeOrders: (changeOrders.data as ChangeOrder[]).map(fromChangeOrderRow),
    shifts: (shifts.data as TimelineShift[]).map(fromShiftRow),
    photos: photoRows,
  };
}

export async function createProject(
  form: ProjectForm,
  extra: { quote_id: string | null; created_by: string | null; phases: TemplatePhase[]; starts_on: string; works_saturdays: boolean }
): Promise<string> {
  const row = { ...form, starts_on: dateOrNull(extra.starts_on), works_saturdays: extra.works_saturdays, quote_id: extra.quote_id, created_by: extra.created_by };
  const phaseRows = extra.phases.map((p, i) => ({ name: p.name.slice(0, 80), duration_days: roundHalf(p.days), sort: i }));
  if (isDemo()) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    demo().projects.push({ ...row, ends_on: null, planned_ends_on: null, id, created_at: now, updated_at: now });
    for (const p of phaseRows) demo().phases.push({ ...p, id: crypto.randomUUID(), project_id: id, starts_on: null, ends_on: null, change_order_id: null, done_at: null });
    await recomputeTimeline(id);
    return id;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("portal_projects").insert(row).select("id").single();
  if (error) fail("Kunde inte skapa projektet", error.message);
  const id = data!.id as string;
  if (phaseRows.length) {
    const { error: phaseError } = await supabase.from("project_phases").insert(phaseRows.map((p) => ({ ...p, project_id: id })));
    if (phaseError) fail("Kunde inte skapa faserna", phaseError.message);
  }
  await recomputeTimeline(id);
  return id;
}

export async function updateProject(id: string, form: ProjectForm): Promise<void> {
  if (isDemo()) {
    const r = demo().projects.find((p) => p.id === id);
    if (!r) throw new Error("Projektet finns inte.");
    Object.assign(r, form, { updated_at: new Date().toISOString() });
    return;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("portal_projects").update(form).eq("id", id).select("id");
  if (error) fail("Kunde inte spara", error.message);
  if (!data?.length) throw new Error("Kunde inte spara: projektet finns inte eller saknar behörighet.");
}

export async function removeProject(id: string): Promise<void> {
  if (isDemo()) {
    const d = demo();
    d.projects = d.projects.filter((p) => p.id !== id);
    d.phases = d.phases.filter((p) => p.project_id !== id);
    d.updates = d.updates.filter((p) => p.project_id !== id);
    d.photos = d.photos.filter((p) => p.project_id !== id);
    d.documents = d.documents.filter((p) => p.project_id !== id);
    d.members = d.members.filter((p) => p.project_id !== id);
    d.changeOrders = d.changeOrders.filter((p) => p.project_id !== id);
    d.shifts = d.shifts.filter((p) => p.project_id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("portal_projects").delete().eq("id", id);
  if (error) fail("Kunde inte ta bort projektet", error.message);
}

/** Bump updated_at so the list order and "senast uppdaterad" follow activity. */
async function touch(projectId: string): Promise<void> {
  if (isDemo()) {
    const r = demo().projects.find((p) => p.id === projectId);
    if (r) r.updated_at = new Date().toISOString();
    return;
  }
  const supabase = await createSessionClient();
  await supabase.from("portal_projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
}

/* ---------- the timeline ---------- */

/**
 * Compute and store every phase's dates and the project end from the start
 * date, the durations and the shifts. Returns the end before and after, so
 * a caller can say "Nytt beräknat slut: 14 nov (var 12 nov)".
 */
export async function recomputeTimeline(projectId: string): Promise<{ before: string; after: string; planned: string }> {
  if (isDemo()) {
    const d = demo();
    const project = d.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Projektet finns inte.");
    const before = project.ends_on ?? "";
    applyTimeline(
      project,
      d.phases.filter((p) => p.project_id === projectId),
      d.shifts.filter((s) => s.project_id === projectId)
    );
    project.updated_at = new Date().toISOString();
    return { before, after: project.ends_on ?? "", planned: project.planned_ends_on ?? "" };
  }
  const supabase = await createSessionClient();
  const [project, phases, shifts] = await Promise.all([
    supabase.from("portal_projects").select("starts_on,ends_on,planned_ends_on,works_saturdays").eq("id", projectId).maybeSingle(),
    supabase.from("project_phases").select("*").eq("project_id", projectId).order("sort"),
    supabase.from("timeline_shifts").select("kind,phase_id,days").eq("project_id", projectId),
  ]);
  for (const r of [project, phases, shifts]) if (r.error) fail("Kunde inte räkna om tidplanen", r.error.message);
  if (!project.data) throw new Error("Projektet finns inte.");
  const p = project.data as Pick<ProjectRow, "starts_on" | "ends_on" | "planned_ends_on" | "works_saturdays">;
  const rows = (phases.data as ProjectPhase[]).map(fromPhaseRow);
  const result = computeTimeline({
    starts_on: p.starts_on ?? "",
    works_saturdays: Boolean(p.works_saturdays),
    planned_ends_on: p.planned_ends_on ?? "",
    phases: rows,
    shifts: (shifts.data as TimelineShift[]).map(fromShiftRow),
  });
  // Only write the phases whose dates actually moved.
  const changed = result.phases.filter((r, i) => r.starts_on !== rows[i].starts_on || r.ends_on !== rows[i].ends_on);
  const writes = await Promise.all(
    changed.map((r) => supabase.from("project_phases").update({ starts_on: r.starts_on, ends_on: r.ends_on }).eq("id", r.id))
  );
  for (const w of writes) if (w.error) fail("Kunde inte spara datumen", w.error.message);
  const { error } = await supabase
    .from("portal_projects")
    .update({ ends_on: result.ends_on, planned_ends_on: result.planned_ends_on, updated_at: new Date().toISOString() })
    .eq("id", projectId);
  if (error) fail("Kunde inte spara slutdatumet", error.message);
  return { before: p.ends_on ?? "", after: result.ends_on ?? "", planned: result.planned_ends_on ?? "" };
}

/**
 * "Spara tidplan": start date, Saturdays and the phases in order, as one
 * save. Existing phases keep their id (and so their photos, done tick and
 * delays); new ones are inserted; ones left out are removed.
 */
export async function saveTimeline(projectId: string, form: TimelineForm): Promise<void> {
  const keep = new Set(form.phases.map((p) => p.id).filter(Boolean));
  if (isDemo()) {
    const d = demo();
    const project = d.projects.find((p) => p.id === projectId);
    if (!project) throw new Error("Projektet finns inte.");
    const planned = movePlannedEnd(project.planned_ends_on ?? "", project.starts_on ?? "", form.starts_on, { saturdays: form.works_saturdays });
    Object.assign(project, { starts_on: dateOrNull(form.starts_on), works_saturdays: form.works_saturdays, planned_ends_on: dateOrNull(planned) });
    const removed = new Set(d.phases.filter((p) => p.project_id === projectId && !keep.has(p.id)).map((p) => p.id));
    d.phases = d.phases.filter((p) => !removed.has(p.id));
    d.shifts = d.shifts.filter((s) => !s.phase_id || !removed.has(s.phase_id));
    for (const x of [...d.photos, ...d.updates]) if (x.phase_id && removed.has(x.phase_id)) x.phase_id = null;
    form.phases.forEach((p, sort) => {
      const existing = p.id ? d.phases.find((x) => x.id === p.id && x.project_id === projectId) : undefined;
      if (existing) Object.assign(existing, { name: p.name, duration_days: p.duration_days, sort });
      else d.phases.push({ id: crypto.randomUUID(), project_id: projectId, name: p.name, duration_days: p.duration_days, sort, starts_on: null, ends_on: null, change_order_id: null, done_at: null });
    });
    await recomputeTimeline(projectId);
    return;
  }
  const supabase = await createSessionClient();
  const { data: before } = await supabase.from("portal_projects").select("starts_on,planned_ends_on").eq("id", projectId).maybeSingle();
  const planned = movePlannedEnd(before?.planned_ends_on ?? "", before?.starts_on ?? "", form.starts_on, { saturdays: form.works_saturdays });
  const { error: projectError } = await supabase
    .from("portal_projects")
    .update({ starts_on: dateOrNull(form.starts_on), works_saturdays: form.works_saturdays, planned_ends_on: dateOrNull(planned) })
    .eq("id", projectId);
  if (projectError) fail("Kunde inte spara tidplanen", projectError.message);
  const { data: existing, error } = await supabase.from("project_phases").select("id").eq("project_id", projectId);
  if (error) fail("Kunde inte spara tidplanen", error.message);
  const removed = (existing ?? []).map((r) => r.id as string).filter((id) => !keep.has(id));
  if (removed.length) {
    const { error: removeError } = await supabase.from("project_phases").delete().in("id", removed).eq("project_id", projectId);
    if (removeError) fail("Kunde inte ta bort faserna", removeError.message);
  }
  const results = await Promise.all(
    form.phases.map((p, sort) =>
      p.id
        ? supabase.from("project_phases").update({ name: p.name, duration_days: p.duration_days, sort }).eq("id", p.id).eq("project_id", projectId)
        : supabase.from("project_phases").insert({ project_id: projectId, name: p.name, duration_days: p.duration_days, sort })
    )
  );
  for (const r of results) if (r.error) fail("Kunde inte spara faserna", r.error.message);
  await recomputeTimeline(projectId);
}

/** Tick a phase done (or undo). Dates don't move: they come from the plan. */
export async function setPhaseDone(projectId: string, phaseId: string, done: boolean): Promise<void> {
  const done_at = done ? new Date().toISOString() : null;
  if (isDemo()) {
    const p = demo().phases.find((x) => x.id === phaseId && x.project_id === projectId);
    if (p) p.done_at = done_at;
    return touch(projectId);
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("project_phases").update({ done_at }).eq("id", phaseId).eq("project_id", projectId);
  if (error) fail("Kunde inte spara fasen", error.message);
  await touch(projectId);
}

/** Phases that by the calendar should be done by `today` but aren't ticked, in active projects. */
export async function listOverduePhases(today = todayIso()): Promise<ProjectPhase[]> {
  if (isDemo()) {
    const d = demo();
    const active = new Set(d.projects.filter((p) => p.status === "active").map((p) => p.id));
    return d.phases.filter((p) => active.has(p.project_id) && !p.done_at && p.ends_on && p.ends_on < today).sort((a, b) => a.sort - b.sort);
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("project_phases")
    .select("*, portal_projects!inner(status)")
    .is("done_at", null)
    .lt("ends_on", today)
    .eq("portal_projects.status", "active")
    .order("sort")
    .limit(200);
  if (error) fail("Kunde inte hämta faserna", error.message);
  // Drop the embedded project used only for the filter.
  return ((data ?? []) as (ProjectPhase & { portal_projects?: unknown })[]).map((r) => {
    const phase = { ...r };
    delete phase.portal_projects;
    return fromPhaseRow(phase);
  });
}

/* ---------- shifts: delays and ÄTA time ---------- */

async function insertShift(shift: Omit<TimelineShift, "id" | "created_at">): Promise<void> {
  if (isDemo()) {
    demo().shifts.push({ ...shift, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("timeline_shifts").insert(shift);
  if (error) fail("Kunde inte spara förskjutningen", error.message);
}

/**
 * "Försening" on a phase: the phase gets `days` longer, so every later
 * phase and the end move. The reason is shown to the customer verbatim.
 */
export async function addDelay(
  projectId: string,
  phaseId: string,
  delay: { days: number; reason: string },
  createdBy: string | null
): Promise<{ before: string; after: string; planned: string; phase: string }> {
  const bundle = await getProjectBundle(projectId);
  const phase = bundle?.phases.find((p) => p.id === phaseId);
  if (!phase) throw new Error("Fasen finns inte längre.");
  await insertShift({ project_id: projectId, kind: "delay", phase_id: phaseId, change_order_id: null, days: roundHalf(delay.days), reason: delay.reason, created_by: createdBy });
  return { ...(await recomputeTimeline(projectId)), phase: phase.name };
}

/** Undo a delay reported by mistake. ÄTA time goes by removing the ÄTA's phase instead. */
export async function removeDelay(projectId: string, shiftId: string): Promise<void> {
  if (isDemo()) {
    const d = demo();
    d.shifts = d.shifts.filter((s) => !(s.id === shiftId && s.project_id === projectId && s.kind === "delay"));
  } else {
    const supabase = await createSessionClient();
    const { error } = await supabase.from("timeline_shifts").delete().eq("id", shiftId).eq("project_id", projectId).eq("kind", "delay" satisfies ShiftKind);
    if (error) fail("Kunde inte ta bort förseningen", error.message);
  }
  await recomputeTimeline(projectId);
}

/**
 * "Lägg in" an approved ÄTA: a new phase marked with the ÄTA right after
 * `afterPhaseId` ("" = first), as long as the ÄTA says, then a shift line
 * with the reason. Placing the same ÄTA twice does nothing.
 */
export async function scheduleChangeOrder(projectId: string, orderId: string, afterPhaseId: string, createdBy: string | null): Promise<{ before: string; after: string }> {
  const bundle = await getProjectBundle(projectId);
  if (!bundle) throw new Error("Projektet finns inte.");
  const order = bundle.changeOrders.find((o) => o.id === orderId);
  if (!order || order.status !== "approved") throw new Error("ÄTA:n är inte godkänd.");
  if (order.duration_days <= 0) throw new Error("ÄTA:n påverkar inte tidplanen.");
  const end = bundle.project.ends_on;
  if (bundle.phases.some((p) => p.change_order_id === order.id)) return { before: end, after: end };

  const ids = bundle.phases.map((p) => p.id);
  const at = afterPhaseId ? ids.indexOf(afterPhaseId) + 1 : 0;
  if (afterPhaseId && at === 0) throw new Error("Fasen finns inte längre.");
  const answered = order.answered_at ? ` ${formatDay(order.answered_at)}` : "";
  const reason = `ÄTA ${order.number}: ${order.title}, godkänd av kunden${answered}`;
  const row = { project_id: projectId, name: changeOrderPhaseName(order), duration_days: order.duration_days, change_order_id: order.id };

  let phaseId: string;
  if (isDemo()) {
    const d = demo();
    phaseId = crypto.randomUUID();
    d.phases.push({ ...row, id: phaseId, sort: at, starts_on: null, ends_on: null, done_at: null });
    const order2 = [...ids.slice(0, at), phaseId, ...ids.slice(at)];
    for (const p of d.phases) if (p.project_id === projectId) p.sort = order2.indexOf(p.id);
  } else {
    const supabase = await createSessionClient();
    const { data, error } = await supabase.from("project_phases").insert({ ...row, sort: at }).select("id").single();
    // The unique index caught a second click: the first one already placed it.
    if (error?.code === "23505") return { before: end, after: end };
    if (error) fail("Kunde inte lägga in ÄTA:n", error.message);
    phaseId = data!.id as string;
    const order2 = [...ids.slice(0, at), phaseId, ...ids.slice(at)];
    const writes = await Promise.all(order2.slice(at + 1).map((id, i) => supabase.from("project_phases").update({ sort: at + 1 + i }).eq("id", id)));
    for (const w of writes) if (w.error) fail("Kunde inte flytta faserna", w.error.message);
  }
  await insertShift({ project_id: projectId, kind: "change_order", phase_id: phaseId, change_order_id: order.id, days: order.duration_days, reason, created_by: createdBy });
  const { before, after } = await recomputeTimeline(projectId);
  return { before, after };
}

/* ---------- phase templates ---------- */

export async function listPhaseTemplates(): Promise<SavedPhaseTemplate[]> {
  if (isDemo()) return demo().templates.slice().sort((a, b) => a.name.localeCompare(b.name, "sv"));
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("phase_templates").select("id,name,job_type,phases,created_at").order("name");
  if (error) fail("Kunde inte hämta mallarna", error.message);
  return ((data ?? []) as SavedPhaseTemplate[]).map((t) => ({
    ...t,
    job_type: t.job_type ?? "",
    phases: Array.isArray(t.phases) ? t.phases.map((p) => ({ name: String(p.name ?? "").slice(0, 80), days: roundHalf(Number(p.days)) })) : [],
  }));
}

/** "Spara som mall": the project's own phases (not ÄTA) with their planned durations. */
export async function savePhaseTemplate(template: { name: string; job_type: string; phases: TemplatePhase[] }, createdBy: string | null): Promise<void> {
  if (isDemo()) {
    demo().templates.push({ ...template, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("phase_templates").insert({ ...template, created_by: createdBy });
  if (error) fail("Kunde inte spara mallen", error.message);
}

export async function removePhaseTemplate(id: string): Promise<void> {
  if (isDemo()) {
    demo().templates = demo().templates.filter((t) => t.id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("phase_templates").delete().eq("id", id);
  if (error) fail("Kunde inte ta bort mallen", error.message);
}

/* ---------- updates (the diary) and photos ---------- */

/** A post: the day's note plus its photos, each photo a row in the post's phase and day. */
export async function addUpdate(
  projectId: string,
  update: { body: string; photos: string[]; phase_id: string | null; day: string },
  createdBy: string | null
): Promise<void> {
  const row = { project_id: projectId, body: update.body, phase_id: update.phase_id, day: update.day, created_by: createdBy };
  const photoRow = (update_id: string, path: string, sort: number) => ({
    project_id: projectId,
    phase_id: update.phase_id,
    update_id,
    day: update.day,
    path,
    caption: "",
    in_report: true,
    sort,
    created_by: createdBy,
  });
  if (isDemo()) {
    const d = demo();
    if (update.phase_id && !d.phases.some((p) => p.id === update.phase_id && p.project_id === projectId)) throw new Error("Fasen finns inte längre.");
    const id = crypto.randomUUID();
    const created_at = new Date().toISOString();
    d.updates.push({ ...row, id, created_at });
    update.photos.forEach((path, i) => d.photos.push({ ...photoRow(id, path, i), id: crypto.randomUUID(), created_at }));
    return touch(projectId);
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("project_updates").insert(row).select("id").single();
  if (error) fail("Kunde inte spara uppdateringen", error.message);
  if (update.photos.length) {
    const { error: photoError } = await supabase.from("project_photos").insert(update.photos.map((path, i) => photoRow(data!.id as string, path, i)));
    if (photoError) fail("Kunde inte spara fotona", photoError.message);
  }
  await touch(projectId);
}

/** Removes the post and, through the foreign key, its photo rows. The caller deletes the files. */
export async function removeUpdate(id: string): Promise<void> {
  if (isDemo()) {
    const d = demo();
    d.updates = d.updates.filter((u) => u.id !== id);
    d.photos = d.photos.filter((p) => p.update_id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("project_updates").delete().eq("id", id);
  if (error) fail("Kunde inte ta bort uppdateringen", error.message);
}

/* ---------- documents ---------- */

export async function addDocument(projectId: string, doc: { kind: DocumentKind; title: string; path: string }): Promise<void> {
  const row = { project_id: projectId, ...doc };
  if (isDemo()) {
    demo().documents.push({ ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    return touch(projectId);
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("project_documents").insert(row);
  if (error) fail("Kunde inte spara dokumentet", error.message);
  await touch(projectId);
}

export async function removeDocument(id: string): Promise<void> {
  if (isDemo()) {
    demo().documents = demo().documents.filter((d) => d.id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("project_documents").delete().eq("id", id);
  if (error) fail("Kunde inte ta bort dokumentet", error.message);
}

/* ---------- change orders (ÄTA) ---------- */

/** The admin writes a change order; it starts as "pending" and gets the next number in the project. */
export async function addChangeOrder(projectId: string, form: ChangeOrderForm): Promise<ChangeOrder> {
  if (isDemo()) {
    const d = demo();
    const number = Math.max(0, ...d.changeOrders.filter((c) => c.project_id === projectId).map((c) => c.number)) + 1;
    const order: ChangeOrder = {
      ...form,
      id: crypto.randomUUID(),
      project_id: projectId,
      number,
      status: "pending",
      answered_by: null,
      answered_name: null,
      answered_at: null,
      created_at: new Date().toISOString(),
    };
    d.changeOrders.push(order);
    await touch(projectId);
    return order;
  }
  const supabase = await createSessionClient();
  // Two admins adding at once could pick the same number; the unique index
  // rejects the second, who simply gets the next number on the retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: last } = await supabase.from("change_orders").select("number").eq("project_id", projectId).order("number", { ascending: false }).limit(1).maybeSingle();
    const number = ((last?.number as number | undefined) ?? 0) + 1;
    const { data, error } = await supabase.from("change_orders").insert({ project_id: projectId, number, ...form }).select("*").single();
    if (!error) {
      await touch(projectId);
      return fromChangeOrderRow(data as ChangeOrder);
    }
    if (error.code !== "23505") fail("Kunde inte spara ändringen", error.message);
  }
  return fail("Kunde inte spara ändringen", "numreringen krockade, försök igen");
}

export async function removeChangeOrder(id: string): Promise<void> {
  if (isDemo()) {
    demo().changeOrders = demo().changeOrders.filter((c) => c.id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("change_orders").delete().eq("id", id);
  if (error) fail("Kunde inte ta bort ändringen", error.message);
}

/**
 * The customer's answer. Members may only read change_orders under RLS, so
 * the write goes through the service-role client after this function has
 * checked that the user is a member of the order's project. Only a pending
 * order can be answered, and only once.
 */
export async function answerChangeOrder(input: {
  orderId: string;
  userId: string;
  userName: string;
  status: Exclude<ChangeOrderStatus, "pending">;
}): Promise<ChangeOrder> {
  const answeredAt = new Date().toISOString();
  if (isDemo()) {
    const d = demo();
    const order = d.changeOrders.find((c) => c.id === input.orderId);
    if (!order) throw new Error("Ändringen finns inte längre.");
    if (!d.members.some((m) => m.project_id === order.project_id && m.user_id === input.userId)) throw new Error("Du har inte tillgång till det här projektet.");
    if (order.status !== "pending") throw new Error("Ändringen är redan besvarad.");
    Object.assign(order, { status: input.status, answered_by: input.userId, answered_name: input.userName, answered_at: answeredAt });
    await touch(order.project_id);
    return order;
  }
  const admin = createAdminClient();
  const { data: order, error } = await admin.from("change_orders").select("*").eq("id", input.orderId).maybeSingle();
  if (error) fail("Kunde inte hämta ändringen", error.message);
  if (!order) throw new Error("Ändringen finns inte längre.");
  const { data: member } = await admin.from("project_members").select("user_id").eq("project_id", order.project_id).eq("user_id", input.userId).maybeSingle();
  if (!member) throw new Error("Du har inte tillgång till det här projektet.");
  const { data: updated, error: updateError } = await admin
    .from("change_orders")
    .update({ status: input.status, answered_by: input.userId, answered_name: input.userName, answered_at: answeredAt })
    .eq("id", input.orderId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (updateError) fail("Kunde inte spara svaret", updateError.message);
  if (!updated) throw new Error("Ändringen är redan besvarad.");
  await admin.from("portal_projects").update({ updated_at: answeredAt }).eq("id", order.project_id);
  return fromChangeOrderRow(updated as ChangeOrder);
}

/** The members' e-mail addresses, for notices. Read with the caller's session (admin). */
export async function listMemberEmails(projectId: string): Promise<{ email: string; name: string }[]> {
  if (isDemo()) return demo().members.filter((m) => m.project_id === projectId).map((m) => ({ email: m.email, name: m.name }));
  const supabase = await createSessionClient();
  const { data } = await supabase.from("project_members").select("email,name").eq("project_id", projectId);
  return ((data ?? []) as { email: string; name: string }[]).map((m) => ({ email: m.email, name: m.name ?? "" }));
}

/* ---------- members ---------- */

export async function addMember(member: { project_id: string; user_id: string; email: string; name: string }): Promise<void> {
  if (isDemo()) {
    const d = demo();
    if (!d.members.some((m) => m.project_id === member.project_id && m.user_id === member.user_id)) {
      d.members.push({ ...member, invited_at: new Date().toISOString() });
    }
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("project_members").upsert(member, { onConflict: "project_id,user_id" });
  if (error) fail("Kunde inte lägga till kunden", error.message);
}

export async function removeMember(projectId: string, userId: string): Promise<void> {
  if (isDemo()) {
    demo().members = demo().members.filter((m) => !(m.project_id === projectId && m.user_id === userId));
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
  if (error) fail("Kunde inte ta bort kunden", error.message);
}

/** Does this project have a quote-id already? Used so one quote only gives one project. */
export async function findProjectByQuote(quoteId: string): Promise<PortalProject | null> {
  if (isDemo()) {
    const r = demo().projects.find((p) => p.quote_id === quoteId);
    return r ? fromProjectRow(r) : null;
  }
  const supabase = await createSessionClient();
  const { data } = await supabase.from("portal_projects").select("*").eq("quote_id", quoteId).maybeSingle();
  return data ? fromProjectRow(data as ProjectRow) : null;
}
