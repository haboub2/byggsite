import "server-only";
import { createClient as createSessionClient } from "../supabase/server";
import { isDemo } from "../leads";
import {
  DOCUMENT_KINDS,
  PROJECT_STATUSES,
  type DocumentKind,
  type PortalProject,
  type ProjectBundle,
  type ProjectDocument,
  type ProjectForm,
  type ProjectMember,
  type ProjectPhase,
  type ProjectStatus,
  type ProjectUpdate,
} from "./schema";

/**
 * The portal tables (supabase/migrations/0010_portal.sql), always read and
 * written with the caller's session so RLS decides: admins see everything,
 * a customer only the projects they are a member of. The same functions
 * therefore serve both /admin/projekt and /mitt-projekt. Demo mode keeps
 * everything in memory with one example project.
 */

type ProjectRow = Omit<PortalProject, "status" | "starts_on" | "ends_on"> & { status: string; starts_on: string | null; ends_on: string | null };

const fromProjectRow = (r: ProjectRow): PortalProject => ({
  ...r,
  status: PROJECT_STATUSES.includes(r.status as ProjectStatus) ? (r.status as ProjectStatus) : "active",
  starts_on: r.starts_on ?? "",
  ends_on: r.ends_on ?? "",
});

const fromDocumentRow = (r: ProjectDocument): ProjectDocument => ({
  ...r,
  kind: DOCUMENT_KINDS.includes(r.kind) ? r.kind : "other",
});

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
  updates: ProjectUpdate[];
  documents: ProjectDocument[];
};
const g = globalThis as unknown as { __binaafyPortal?: Demo };

function demo(): Demo {
  if (g.__binaafyPortal) return g.__binaafyPortal;
  const now = new Date();
  const iso = (daysFromNow: number) => new Date(now.getTime() + daysFromNow * 86_400_000).toISOString();
  const day = (daysFromNow: number) => iso(daysFromNow).slice(0, 10);
  const projectId = "11111111-1111-4111-8111-111111111111";
  const phaseNames = ["Uppstart", "Rivning", "El och VVS", "Tätskikt", "Kakel och klinker", "Montering", "Slutbesiktning"];
  g.__binaafyPortal = {
    projects: [
      {
        id: projectId,
        quote_id: null,
        title: "Badrumsrenovering",
        address: "Exempelgatan 12, Göteborg",
        customer_name: "Anna Exempel",
        status: "active",
        current_phase: "Tätskikt",
        this_week: "Tätskiktet läggs i duschzonen och på golvet. Torktid till torsdag, sedan börjar vi med klinkern.",
        next_step: "Kakel och klinker, start torsdag.",
        contact_name: "Ibrahim",
        contact_phone: "+46793049737",
        starts_on: day(-14),
        ends_on: day(16),
        created_by: "demo@localhost",
        created_at: iso(-15),
        updated_at: iso(-1),
      },
    ],
    members: [{ project_id: projectId, user_id: "kund@example.se", email: "kund@example.se", name: "Anna Exempel", invited_at: iso(-15) }],
    phases: phaseNames.map((name, i) => ({
      id: `phase-${i}`,
      project_id: projectId,
      name,
      sort: i,
      starts_on: day(-14 + i * 4),
      ends_on: day(-11 + i * 4),
      done_at: i < 3 ? iso(-11 + i * 4) : null,
    })),
    updates: [
      { id: "u1", project_id: projectId, body: "Rivningen är klar och allt gammalt är bortforslat. Golvet är rent och torrt inför VVS-arbetet.", photos: [], created_by: "demo@localhost", created_at: iso(-8) },
      { id: "u2", project_id: projectId, body: "Nya rör och golvvärme är på plats. Elektrikern har dragit uttag och belysning.", photos: [], created_by: "demo@localhost", created_at: iso(-3) },
    ],
    documents: [{ id: "d1", project_id: projectId, kind: "quote", title: "Offert 1001 — Badrumsrenovering", path: "quote:demo", created_at: iso(-15) }],
  };
  return g.__binaafyPortal;
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
    return {
      project,
      phases: d.phases.filter((p) => p.project_id === id).sort((a, b) => a.sort - b.sort),
      updates: d.updates.filter((u) => u.project_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      documents: d.documents.filter((x) => x.project_id === id).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      members: d.members.filter((m) => m.project_id === id),
    };
  }
  const supabase = await createSessionClient();
  const [phases, updates, documents, members] = await Promise.all([
    supabase.from("project_phases").select("*").eq("project_id", id).order("sort"),
    supabase.from("project_updates").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_documents").select("*").eq("project_id", id).order("created_at", { ascending: false }),
    supabase.from("project_members").select("*").eq("project_id", id).order("invited_at"),
  ]);
  for (const r of [phases, updates, documents, members]) if (r.error) fail("Kunde inte hämta projektet", r.error.message);
  return {
    project,
    phases: phases.data as ProjectPhase[],
    updates: updates.data as ProjectUpdate[],
    documents: (documents.data as ProjectDocument[]).map(fromDocumentRow),
    members: members.data as ProjectMember[],
  };
}

export async function createProject(
  form: ProjectForm,
  extra: { quote_id: string | null; created_by: string | null; phases: string[] }
): Promise<string> {
  const row = { ...form, starts_on: dateOrNull(form.starts_on), ends_on: dateOrNull(form.ends_on), quote_id: extra.quote_id, created_by: extra.created_by };
  if (isDemo()) {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    demo().projects.push({ ...row, id, created_at: now, updated_at: now });
    extra.phases.forEach((name, i) => demo().phases.push({ id: crypto.randomUUID(), project_id: id, name, sort: i, starts_on: null, ends_on: null, done_at: null }));
    return id;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("portal_projects").insert(row).select("id").single();
  if (error) fail("Kunde inte skapa projektet", error.message);
  const id = data!.id as string;
  if (extra.phases.length) {
    const { error: phaseError } = await supabase
      .from("project_phases")
      .insert(extra.phases.map((name, i) => ({ project_id: id, name, sort: i })));
    if (phaseError) fail("Kunde inte skapa faserna", phaseError.message);
  }
  return id;
}

export async function updateProject(id: string, form: ProjectForm): Promise<void> {
  const patch = { ...form, starts_on: dateOrNull(form.starts_on), ends_on: dateOrNull(form.ends_on) };
  if (isDemo()) {
    const r = demo().projects.find((p) => p.id === id);
    if (!r) throw new Error("Projektet finns inte.");
    Object.assign(r, patch, { updated_at: new Date().toISOString() });
    return;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("portal_projects").update(patch).eq("id", id).select("id");
  if (error) fail("Kunde inte spara", error.message);
  if (!data?.length) throw new Error("Kunde inte spara: projektet finns inte eller saknar behörighet.");
}

export async function removeProject(id: string): Promise<void> {
  if (isDemo()) {
    const d = demo();
    d.projects = d.projects.filter((p) => p.id !== id);
    d.phases = d.phases.filter((p) => p.project_id !== id);
    d.updates = d.updates.filter((p) => p.project_id !== id);
    d.documents = d.documents.filter((p) => p.project_id !== id);
    d.members = d.members.filter((p) => p.project_id !== id);
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

/* ---------- phases ---------- */

export async function addPhase(projectId: string, phase: { name: string; starts_on: string; ends_on: string }): Promise<void> {
  const row = { project_id: projectId, name: phase.name, starts_on: dateOrNull(phase.starts_on), ends_on: dateOrNull(phase.ends_on) };
  if (isDemo()) {
    const existing = demo().phases.filter((p) => p.project_id === projectId);
    demo().phases.push({ ...row, id: crypto.randomUUID(), sort: existing.length, done_at: null });
    return touch(projectId);
  }
  const supabase = await createSessionClient();
  const { count } = await supabase.from("project_phases").select("id", { count: "exact", head: true }).eq("project_id", projectId);
  const { error } = await supabase.from("project_phases").insert({ ...row, sort: count ?? 0 });
  if (error) fail("Kunde inte lägga till fasen", error.message);
  await touch(projectId);
}

export async function updatePhase(
  id: string,
  patch: Partial<{ name: string; starts_on: string; ends_on: string; done: boolean; sort: number }>
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.starts_on !== undefined) row.starts_on = dateOrNull(patch.starts_on);
  if (patch.ends_on !== undefined) row.ends_on = dateOrNull(patch.ends_on);
  if (patch.done !== undefined) row.done_at = patch.done ? new Date().toISOString() : null;
  if (patch.sort !== undefined) row.sort = patch.sort;
  if (isDemo()) {
    const p = demo().phases.find((x) => x.id === id);
    if (p) {
      Object.assign(p, row);
      await touch(p.project_id);
    }
    return;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("project_phases").update(row).eq("id", id).select("project_id").maybeSingle();
  if (error) fail("Kunde inte spara fasen", error.message);
  if (data) await touch(data.project_id as string);
}

export async function removePhase(id: string): Promise<void> {
  if (isDemo()) {
    demo().phases = demo().phases.filter((p) => p.id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("project_phases").delete().eq("id", id);
  if (error) fail("Kunde inte ta bort fasen", error.message);
}

/** Move a phase one step up or down among its siblings. */
export async function movePhase(id: string, direction: -1 | 1): Promise<void> {
  let siblings: ProjectPhase[];
  if (isDemo()) {
    const p = demo().phases.find((x) => x.id === id);
    if (!p) return;
    siblings = demo().phases.filter((x) => x.project_id === p.project_id).sort((a, b) => a.sort - b.sort);
  } else {
    const supabase = await createSessionClient();
    const { data: one } = await supabase.from("project_phases").select("project_id").eq("id", id).maybeSingle();
    if (!one) return;
    const { data } = await supabase.from("project_phases").select("*").eq("project_id", one.project_id).order("sort");
    siblings = (data ?? []) as ProjectPhase[];
  }
  const i = siblings.findIndex((p) => p.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= siblings.length) return;
  // Renumber everything so gaps or duplicates from earlier edits can't stick.
  const order = siblings.map((p) => p.id);
  [order[i], order[j]] = [order[j], order[i]];
  await Promise.all(order.map((pid, sort) => updatePhase(pid, { sort })));
}

/* ---------- updates (the diary) ---------- */

export async function addUpdate(projectId: string, body: string, photos: string[], createdBy: string | null): Promise<void> {
  const row = { project_id: projectId, body, photos, created_by: createdBy };
  if (isDemo()) {
    demo().updates.push({ ...row, id: crypto.randomUUID(), created_at: new Date().toISOString() });
    return touch(projectId);
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("project_updates").insert(row);
  if (error) fail("Kunde inte spara uppdateringen", error.message);
  await touch(projectId);
}

export async function removeUpdate(id: string): Promise<void> {
  if (isDemo()) {
    demo().updates = demo().updates.filter((u) => u.id !== id);
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
