import "server-only";
import { createHash } from "node:crypto";
import { createClient as createSessionClient } from "../supabase/server";
import { createAdminClient } from "../supabase/admin";
import { isDemo } from "../leads";
import { currentOrgId, readOrgId } from "../core/org/current";
import { makeEvent, type Actor, type CoreEvent, type EventType } from "../core/events";
import { quoteTotals } from "./math";
import {
  QUOTE_STATUSES,
  acceptanceProblem,
  todayIso,
  withQuoteDefaults,
  type Quote,
  type QuoteAcceptance,
  type QuoteData,
  type QuoteDivision,
  type QuoteStatus,
  type QuoteTemplateRecord,
} from "./schema";

/**
 * Quotes and saved templates: the `quotes` and `quote_templates` tables
 * (supabase/migrations/0008_quotes.sql), read and written with the admin's
 * session so RLS decides. Every read and write is also limited to the
 * session's organisation (0014), so a member of two organisations only sees
 * the one they work in. Demo mode keeps everything in memory.
 */

/** Limit a query to the session's organisation (readOrgId()), when there is one. */
function inOrg<Q extends { eq(column: string, value: string): Q }>(query: Q, org: string | null): Q {
  return org ? query.eq("org_id", org) : query;
}

type Row = {
  id: string;
  /** Not in demo rows. */
  org_id?: string;
  number: number;
  status: string;
  division: string;
  customer_name: string;
  title: string;
  total: number;
  data: QuoteData;
  lead_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  /** 0046; absent on rows read before the migration. */
  sent_hash?: string | null;
  sent_data?: QuoteData | null;
  acceptance?: QuoteAcceptance | null;
  accepted_at?: string | null;
};

const fromRow = (r: Row): Quote => ({
  id: r.id,
  orgId: r.org_id ?? null,
  number: r.number,
  status: QUOTE_STATUSES.includes(r.status as QuoteStatus) ? (r.status as QuoteStatus) : "draft",
  created_at: r.created_at,
  updated_at: r.updated_at,
  sent_at: r.sent_at,
  sent_hash: r.sent_hash ?? null,
  acceptance: r.acceptance ?? null,
  created_by: r.created_by,
  data: withQuoteDefaults(r.data),
});

/** sha256 of the document, the version the customer got (quotes.sent_hash, 0046). */
export function quoteHash(data: QuoteData): string {
  return createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

/* ---------- events ---------- */

/** The quote's events in the shared log (aggregate "quote"); demo mode keeps them with the invoices' events. */
async function logQuoteEvent(q: Pick<Quote, "id" | "number" | "orgId">, type: EventType, data: CoreEvent["data"], actor: Actor): Promise<void> {
  const event = makeEvent({ orgId: q.orgId ?? "demo", aggregateType: "quote", aggregateId: q.id, type, data: { number: q.number, ...data }, actor });
  if (isDemo()) {
    (globalThis as unknown as { __binaafyInvoices?: { events: (CoreEvent & { id: string })[] } }).__binaafyInvoices?.events.push({ id: crypto.randomUUID(), ...event });
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("events").insert({ org_id: event.orgId, aggregate_type: event.aggregateType, aggregate_id: event.aggregateId, type: event.type, data: event.data, actor: event.actor, created_at: event.at });
  if (error) throw new Error(`Händelsen kunde inte loggas: ${error.message}`);
}

/** The denormalised columns, recomputed on every save. */
function summary(data: QuoteData) {
  const customer = data.customer.type === "foretag" && data.customer.company ? data.customer.company : data.customer.name;
  return {
    division: data.division,
    customer_name: customer,
    title: data.title,
    total: quoteTotals(data).pay,
    lead_id: data.leadId,
    data,
  };
}

export type QuoteFilters = { status?: QuoteStatus; division?: QuoteDivision; q?: string };

export function parseQuoteFilters(params: Record<string, string | string[] | undefined>): QuoteFilters {
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const status = one("status");
  const division = one("division");
  const q = one("q")?.trim().slice(0, 100);
  return {
    status: QUOTE_STATUSES.includes(status as QuoteStatus) ? (status as QuoteStatus) : undefined,
    division: division === "bygg" || division === "01" ? division : undefined,
    q: q || undefined,
  };
}

export function quoteFiltersToQuery(f: QuoteFilters): string {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.division) p.set("division", f.division);
  if (f.q) p.set("q", f.q);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ---------- demo store ---------- */
const g = globalThis as unknown as {
  __binaafyQuotes?: Row[];
  __binaafyQuoteTemplates?: QuoteTemplateRecord[];
  __binaafyQuoteSeq?: number;
};
const demoQuotes = () => (g.__binaafyQuotes ??= []);
const demoTemplates = () => (g.__binaafyQuoteTemplates ??= []);
const nextDemoNumber = () => (g.__binaafyQuoteSeq = (g.__binaafyQuoteSeq ?? 1000) + 1);

function matches(r: Row, f: QuoteFilters): boolean {
  if (f.status && r.status !== f.status) return false;
  if (f.division && r.division !== f.division) return false;
  if (f.q) {
    const hay = [String(r.number), r.customer_name, r.title, r.data.customer.email, r.data.customer.phone].join(" ").toLowerCase();
    if (!hay.includes(f.q.toLowerCase())) return false;
  }
  return true;
}

/* ---------- quotes ---------- */

export async function listQuotes(f: QuoteFilters = {}): Promise<Quote[]> {
  if (isDemo()) {
    return demoQuotes()
      .filter((r) => matches(r, f))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(fromRow);
  }
  const supabase = await createSessionClient();
  let query = inOrg(supabase.from("quotes").select("*").order("updated_at", { ascending: false }).limit(500), await readOrgId());
  if (f.status) query = query.eq("status", f.status);
  if (f.division) query = query.eq("division", f.division);
  if (f.q) {
    const term = f.q.replace(/["\\*%]/g, " ").trim();
    if (term) {
      const n = Number(term);
      const parts = [`customer_name.ilike."*${term}*"`, `title.ilike."*${term}*"`];
      if (Number.isInteger(n)) parts.push(`number.eq.${n}`);
      query = query.or(parts.join(","));
    }
  }
  const { data, error } = await query;
  if (error) throw new Error(`Kunde inte hämta offerter: ${error.message}`);
  return (data as Row[]).map(fromRow);
}

export async function countQuotesByStatus(f: Omit<QuoteFilters, "status">): Promise<Record<QuoteStatus | "all", number>> {
  const all = await listQuotes(f);
  const counts: Record<QuoteStatus | "all", number> = { all: all.length, draft: 0, sent: 0, accepted: 0, declined: 0 };
  for (const q of all) counts[q.status]++;
  return counts;
}

export async function getQuote(id: string): Promise<Quote | null> {
  if (isDemo()) {
    const r = demoQuotes().find((x) => x.id === id);
    return r ? fromRow(r) : null;
  }
  const supabase = await createSessionClient();
  const { data, error } = await inOrg(supabase.from("quotes").select("*").eq("id", id), await readOrgId()).maybeSingle();
  if (error) throw new Error(`Kunde inte hämta offerten: ${error.message}`);
  return data ? fromRow(data as Row) : null;
}

/** A quote read for the customer portal, where the caller is a customer and
 *  RLS would hide the quotes table. The portal route has already checked that
 *  the caller is a member of the project the quote belongs to. */
export async function getQuoteForPortal(id: string): Promise<Quote | null> {
  if (isDemo()) return getQuote(id);
  const { data, error } = await createAdminClient().from("quotes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Kunde inte hämta offerten: ${error.message}`);
  return data ? fromRow(data as Row) : null;
}

/** Quotes linked to a lead, newest first. */
export async function listQuotesForLead(leadId: string): Promise<Quote[]> {
  if (isDemo()) return demoQuotes().filter((r) => r.lead_id === leadId).map(fromRow);
  const supabase = await createSessionClient();
  const { data } = await inOrg(supabase.from("quotes").select("*").eq("lead_id", leadId), await readOrgId()).order("created_at", { ascending: false });
  return ((data ?? []) as Row[]).map(fromRow);
}

export async function createQuote(data: QuoteData, createdBy: string | null): Promise<string> {
  if (isDemo()) {
    const now = new Date().toISOString();
    const row: Row = {
      id: crypto.randomUUID(),
      number: nextDemoNumber(),
      status: "draft",
      ...summary(data),
      created_by: createdBy,
      created_at: now,
      updated_at: now,
      sent_at: null,
    };
    demoQuotes().push(row);
    return row.id;
  }
  const supabase = await createSessionClient();
  const { data: inserted, error } = await supabase
    .from("quotes")
    .insert({ ...summary(data), org_id: await currentOrgId(), created_by: createdBy })
    .select("id")
    .single();
  if (error) throw new Error(`Kunde inte skapa offerten: ${error.message}`);
  return inserted.id as string;
}

/** The message when a sent or accepted quote is edited; null for a draft. */
export function editProblem(q: Pick<Quote, "status" | "number">): string | null {
  if (q.status === "draft") return null;
  if (q.status === "accepted") return `Offert ${q.number} är accepterad och kan inte ändras. Duplicera den till en ny offert för ändringar.`;
  return `Offert ${q.number} är skickad till kunden och kan inte ändras. Återkalla den till utkast (status Utkast) eller duplicera den till en ny offert.`;
}

export async function updateQuote(id: string, data: QuoteData): Promise<void> {
  const existing = await getQuote(id);
  if (!existing) throw new Error("Offerten finns inte.");
  const problem = editProblem(existing);
  if (problem) throw new Error(problem);
  if (isDemo()) {
    const r = demoQuotes().find((x) => x.id === id)!;
    Object.assign(r, summary(data), { updated_at: new Date().toISOString() });
    return;
  }
  const supabase = await createSessionClient();
  const { data: rows, error } = await inOrg(supabase.from("quotes").update(summary(data)).eq("id", id).eq("status", "draft"), await readOrgId()).select("id");
  if (error) throw new Error(`Kunde inte spara: ${error.message}`);
  if (!rows?.length) throw new Error("Kunde inte spara: offerten finns inte, är skickad eller saknar behörighet.");
}

async function patchQuote(id: string, patch: Partial<Row>): Promise<void> {
  if (isDemo()) {
    const r = demoQuotes().find((x) => x.id === id);
    if (!r) throw new Error("Offerten finns inte.");
    Object.assign(r, patch, { updated_at: new Date().toISOString() });
    return;
  }
  const supabase = await createSessionClient();
  const { data: rows, error } = await inOrg(supabase.from("quotes").update(patch).eq("id", id), await readOrgId()).select("id");
  if (error) throw new Error(`Kunde inte spara status: ${error.message}`);
  if (!rows?.length) throw new Error("Offerten finns inte eller saknar behörighet.");
}

/**
 * Sent: the document is frozen as the version the customer has (sent_hash,
 * sent_data). Editing it again means withdrawing it to a draft (the offer
 * is revoked, avtalslagen 7 §) or duplicating it to a new quote.
 */
export async function markQuoteSent(id: string, actor: Actor, options: { to?: string; manual?: boolean } = {}): Promise<void> {
  const q = await getQuote(id);
  if (!q) throw new Error("Offerten finns inte.");
  if (q.status === "accepted") throw new Error(`Offert ${q.number} är redan accepterad.`);
  const hash = quoteHash(q.data);
  await patchQuote(id, { status: "sent", sent_at: new Date().toISOString(), sent_hash: hash, sent_data: q.data });
  await logQuoteEvent(q, "quote.sent", { hash, to: options.to ?? "", manual: options.manual ?? false, customerType: q.data.customer.type }, actor);
}

/** Back to a draft: the sent version no longer stands (sent_* are cleared by the database as well). */
export async function withdrawQuote(id: string, actor: Actor): Promise<void> {
  const q = await getQuote(id);
  if (!q) throw new Error("Offerten finns inte.");
  if (q.status === "accepted") throw new Error(`Offert ${q.number} är accepterad och kan inte återkallas. Duplicera den i stället.`);
  if (q.status === "draft") return;
  await patchQuote(id, { status: "draft", sent_at: null, sent_hash: null, sent_data: null });
  await logQuoteEvent(q, "quote.withdrawn", { from: q.status }, actor);
}

export async function declineQuote(id: string, actor: Actor): Promise<void> {
  const q = await getQuote(id);
  if (!q) throw new Error("Offerten finns inte.");
  if (q.status === "accepted") throw new Error(`Offert ${q.number} är accepterad och kan inte avböjas i efterhand.`);
  if (q.status === "declined") return;
  await patchQuote(id, { status: "declined" });
  await logQuoteEvent(q, "quote.declined", {}, actor);
}

/**
 * Accepted: only a sent, unexpired quote, and only the version that was
 * sent (its hash). Records who registered it and when, and for a consumer
 * whether they expressly asked for the work to start during the ångerfrist.
 */
export async function acceptQuote(id: string, actor: Actor, options: { earlyStart?: boolean; today?: string } = {}): Promise<void> {
  const q = await getQuote(id);
  if (!q) throw new Error("Offerten finns inte.");
  const problem = acceptanceProblem(q, options.today ?? todayIso());
  if (problem) throw new Error(problem);
  const hash = quoteHash(q.data);
  if (q.sent_hash && q.sent_hash !== hash) throw new Error(`Offert ${q.number} har ändrats sedan den skickades. Skicka den igen innan den accepteras.`);
  const acceptance: QuoteAcceptance = { at: new Date().toISOString(), by: actor.name, hash, earlyStart: q.data.customer.type === "privat" && Boolean(options.earlyStart) };
  await patchQuote(id, { status: "accepted", acceptance, accepted_at: acceptance.at });
  await logQuoteEvent(q, "quote.accepted", { hash, earlyStart: acceptance.earlyStart, customerType: q.data.customer.type, totalKronor: quoteTotals(q.data).gross }, actor);
}

export async function removeQuote(id: string): Promise<void> {
  const q = await getQuote(id);
  if (!q) return;
  if (q.status === "accepted") throw new Error(`Offert ${q.number} är accepterad och kan inte tas bort.`);
  if (isDemo()) {
    g.__binaafyQuotes = demoQuotes().filter((x) => x.id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await inOrg(supabase.from("quotes").delete().eq("id", id), await readOrgId());
  if (error) throw new Error(`Kunde inte ta bort: ${error.message}`);
}

/* ---------- saved templates ---------- */

export async function listSavedTemplates(division?: QuoteDivision): Promise<QuoteTemplateRecord[]> {
  if (isDemo()) return demoTemplates().filter((t) => !division || t.division === division).map((t) => ({ ...t, data: withQuoteDefaults(t.data) }));
  const supabase = await createSessionClient();
  let query = inOrg(supabase.from("quote_templates").select("*").order("name"), await readOrgId());
  if (division) query = query.eq("division", division);
  const { data, error } = await query;
  if (error) throw new Error(`Kunde inte hämta mallar: ${error.message}`);
  return ((data ?? []) as QuoteTemplateRecord[]).map((t) => ({ ...t, data: withQuoteDefaults(t.data) }));
}

export async function getSavedTemplate(id: string): Promise<QuoteTemplateRecord | null> {
  return (await listSavedTemplates()).find((t) => t.id === id) ?? null;
}

export async function saveTemplate(name: string, data: QuoteData): Promise<void> {
  const record = { name, division: data.division, data };
  if (isDemo()) {
    demoTemplates().push({ id: crypto.randomUUID(), created_at: new Date().toISOString(), ...record });
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("quote_templates").insert({ ...record, org_id: await currentOrgId() });
  if (error) throw new Error(`Kunde inte spara mallen: ${error.message}`);
}

export async function removeTemplate(id: string): Promise<void> {
  if (isDemo()) {
    g.__binaafyQuoteTemplates = demoTemplates().filter((t) => t.id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await inOrg(supabase.from("quote_templates").delete().eq("id", id), await readOrgId());
  if (error) throw new Error(`Kunde inte ta bort mallen: ${error.message}`);
}
