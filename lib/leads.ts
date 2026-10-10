import "server-only";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";

/**
 * Leads inbox data access. Reads and writes go through the signed-in admin's
 * session, so the RLS policies in supabase/migrations/0002_rls.sql decide
 * what is allowed — no service-role key involved.
 *
 * Demo mode: in local development without a Supabase project, the inbox runs
 * on in-memory sample data so it can be tried out. Never in production
 * (NODE_ENV is always "production" for `next build` / `next start`).
 */

export const STATUSES = ["new", "contacted", "won", "lost"] as const;
export type LeadStatus = (typeof STATUSES)[number];
export type LeadKind = "offert" | "brief" | "kontakt";
export type LeadDivision = "bygg" | "01";

export const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "Ny",
  contacted: "Kontaktad",
  won: "Vunnen",
  lost: "Förlorad",
};
export const KIND_LABEL: Record<LeadKind, string> = { offert: "Offert", brief: "Brief", kontakt: "Kontakt" };
export const DIVISION_LABEL: Record<LeadDivision, string> = { bygg: "Bygg", "01": "Software" };

export type Lead = {
  id: string;
  created_at: string;
  division: LeadDivision;
  kind: LeadKind;
  name: string | null;
  email: string | null;
  phone: string | null;
  service: string | null;
  budget: string | null;
  timeline: string | null;
  message: string | null;
  details: Record<string, string> | null;
  source: {
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_campaign?: string | null;
    referrer?: string | null;
    page?: string | null;
  } | null;
  consent_at: string | null;
  status: LeadStatus;
  note: string | null;
};

export type LeadFilters = {
  status?: LeadStatus;
  division?: LeadDivision;
  kind?: LeadKind;
  q?: string;
};

export const PAGE_SIZE = 50;

export function isDemo(): boolean {
  return process.env.NODE_ENV === "development" && !isSupabaseConfigured();
}

/** Read filters from the URL, ignoring anything unexpected. */
export function parseFilters(params: Record<string, string | string[] | undefined>): LeadFilters {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const status = one("status");
  const division = one("division");
  const kind = one("kind");
  const q = one("q")?.trim().slice(0, 100);
  return {
    status: STATUSES.includes(status as LeadStatus) ? (status as LeadStatus) : undefined,
    division: division === "bygg" || division === "01" ? division : undefined,
    kind: kind === "offert" || kind === "brief" || kind === "kontakt" ? kind : undefined,
    q: q || undefined,
  };
}

export function filtersToQuery(f: LeadFilters, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.division) p.set("division", f.division);
  if (f.kind) p.set("kind", f.kind);
  if (f.q) p.set("q", f.q);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

function matches(l: Lead, f: LeadFilters): boolean {
  if (f.status && l.status !== f.status) return false;
  if (f.division && l.division !== f.division) return false;
  if (f.kind && l.kind !== f.kind) return false;
  if (f.q) {
    const hay = [l.name, l.email, l.phone, l.message, l.service, l.note].join(" ").toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

/** Search across the text columns. The term is quoted because PostgREST treats
 *  , . : ( ) as syntax inside or(); quotes and wildcards are stripped first. */
const SEARCH_COLUMNS = ["name", "email", "phone", "message", "service", "note"];
function searchFilter(q: string): string | null {
  const term = q.replace(/["\\*%]/g, " ").trim();
  return term ? SEARCH_COLUMNS.map((c) => `${c}.ilike."*${term}*"`).join(",") : null;
}

export async function listLeads(
  f: LeadFilters,
  { page = 1, limit = PAGE_SIZE }: { page?: number; limit?: number } = {}
): Promise<{ leads: Lead[]; total: number }> {
  if (isDemo()) {
    const all = demoStore().filter((l) => matches(l, f));
    return { leads: all.slice((page - 1) * limit, page * limit), total: all.length };
  }

  const supabase = await createClient();
  let query = supabase.from("leads").select("*", { count: "exact" }).order("created_at", { ascending: false });
  if (f.status) query = query.eq("status", f.status);
  if (f.division) query = query.eq("division", f.division);
  if (f.kind) query = query.eq("kind", f.kind);
  const search = f.q ? searchFilter(f.q) : null;
  if (search) query = query.or(search);
  const from = (page - 1) * limit;
  const { data, count, error } = await query.range(from, from + limit - 1);
  if (error) throw new Error(`Kunde inte hämta förfrågningar: ${error.message}`);
  return { leads: (data ?? []) as Lead[], total: count ?? 0 };
}

/** Number of leads per status, within the other filters (for the tabs). */
export async function countByStatus(f: Omit<LeadFilters, "status">): Promise<Record<LeadStatus | "all", number>> {
  const counts = { all: 0, new: 0, contacted: 0, won: 0, lost: 0 };
  if (isDemo()) {
    for (const l of demoStore().filter((l) => matches(l, f))) {
      counts.all++;
      counts[l.status]++;
    }
    return counts;
  }
  const supabase = await createClient();
  await Promise.all(
    STATUSES.map(async (s) => {
      let q = supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", s);
      if (f.division) q = q.eq("division", f.division);
      if (f.kind) q = q.eq("kind", f.kind);
      const search = f.q ? searchFilter(f.q) : null;
      if (search) q = q.or(search);
      const { count } = await q;
      counts[s] = count ?? 0;
    })
  );
  counts.all = STATUSES.reduce((sum, s) => sum + counts[s], 0);
  return counts;
}

export async function getLead(id: string): Promise<Lead | null> {
  if (isDemo()) return demoStore().find((l) => l.id === id) ?? null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Kunde inte hämta förfrågan: ${error.message}`);
  return (data as Lead | null) ?? null;
}

export async function updateLead(id: string, patch: { status?: LeadStatus; note?: string | null }): Promise<void> {
  if (isDemo()) {
    const lead = demoStore().find((l) => l.id === id);
    if (lead) Object.assign(lead, patch);
    return;
  }
  const supabase = await createClient();
  // RLS: only admins may update. `select` makes a silently-blocked update visible.
  const { data, error } = await supabase.from("leads").update(patch).eq("id", id).select("id");
  if (error) throw new Error(`Kunde inte spara: ${error.message}`);
  if (!data?.length) throw new Error("Kunde inte spara: förfrågan finns inte eller saknar behörighet.");
}

/* ---------- demo data (development only) ---------- */

const g = globalThis as unknown as { __binaafyDemoLeads?: Lead[] };

function demoStore(): Lead[] {
  if (!g.__binaafyDemoLeads) g.__binaafyDemoLeads = seedDemo();
  return g.__binaafyDemoLeads;
}

function seedDemo(): Lead[] {
  const now = Date.now();
  const ago = (h: number) => new Date(now - h * 3_600_000).toISOString();
  const base = { details: {}, source: null, consent_at: null, note: null, budget: null, timeline: null, service: null, phone: null };
  const rows: Omit<Lead, "id">[] = [
    { ...base, created_at: ago(2), division: "bygg", kind: "offert", name: "Anna Lindqvist", email: "anna.lindqvist@example.com", phone: "070-123 45 67", service: "Badrum", budget: "100 000 – 300 000 kr", timeline: "Inom 1–3 månader", message: "Vi vill riva ut vårt badrum från 1985, ca 6 m². Gärna dusch i stället för badkar och golvvärme.", source: { page: "/bygg/tjanster/badrumsrenovering", utm_source: "google", referrer: "https://www.google.com/" }, consent_at: ago(2), status: "new" },
    { ...base, created_at: ago(9), division: "01", kind: "brief", name: "Jonas Berg", email: "jonas@bergsbygg.example", phone: "073-555 12 34", service: "Interna system", budget: "100 000 – 300 000 kr", timeline: "3–6 månader", details: { Företag: "Bergs Bygg AB", "Nuvarande verktyg": "Excel, Fortnox" }, message: "Vi skriver offerter i Excel och för över allt för hand till Fortnox. Vill ha ett offertverktyg.", source: { page: "/mjukvara/brief", referrer: "https://www.linkedin.com/" }, consent_at: ago(9), status: "new" },
    { ...base, created_at: ago(27), division: "bygg", kind: "kontakt", name: "Maria Svensson", email: "maria.s@example.com", details: { Ämne: "Takbesiktning" }, message: "Hej! Gör ni takbesiktning i Laholm? Vi har lite fukt på vinden.", source: { page: "/kontakt" }, consent_at: ago(27), status: "contacted", note: "Ringde 26/9, besiktning bokad torsdag 10:00." },
    { ...base, created_at: ago(70), division: "bygg", kind: "offert", name: "Erik & Sara Holm", email: "holm@example.com", phone: "076-987 65 43", service: "Kök", budget: "100 000 – 300 000 kr", timeline: "Så snart som möjligt", message: "Nytt kök i villa i Söndrum, köksö och flytt av diskbänken.", source: { page: "/", utm_source: "facebook", utm_medium: "social", utm_campaign: "host-2026" }, consent_at: ago(70), status: "won", note: "Signerad offert 24/9. Start v. 42." },
    { ...base, created_at: ago(120), division: "bygg", kind: "offert", name: "Peter Ahmadi", email: "peter.a@example.com", phone: "072-222 33 44", service: "Golvläggning", budget: "Under 100 000 kr", timeline: "Planerar bara", message: "Ca 40 m² ekgolv i vardagsrum och hall.", source: { page: "/bygg/tjanster/golv" }, consent_at: ago(120), status: "lost", note: "Valde annan leverantör, pris." },
  ];
  return rows.map((r, i) => ({ ...r, id: `demo-${i + 1}` }));
}
