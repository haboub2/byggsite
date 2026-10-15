import "server-only";
import { createClient as createSessionClient } from "../supabase/server";
import { isDemo } from "../leads";
import { quoteTotals } from "./math";
import {
  QUOTE_STATUSES,
  withQuoteDefaults,
  type Quote,
  type QuoteData,
  type QuoteDivision,
  type QuoteStatus,
  type QuoteTemplateRecord,
} from "./schema";

/**
 * Quotes and saved templates: the `quotes` and `quote_templates` tables
 * (supabase/migrations/0007_quotes.sql), read and written with the admin's
 * session so RLS decides. Demo mode keeps everything in memory.
 */

type Row = {
  id: string;
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
};

const fromRow = (r: Row): Quote => ({
  id: r.id,
  number: r.number,
  status: QUOTE_STATUSES.includes(r.status as QuoteStatus) ? (r.status as QuoteStatus) : "draft",
  created_at: r.created_at,
  updated_at: r.updated_at,
  sent_at: r.sent_at,
  created_by: r.created_by,
  data: withQuoteDefaults(r.data),
});

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
  let query = supabase.from("quotes").select("*").order("updated_at", { ascending: false }).limit(500);
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
  const { data, error } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Kunde inte hämta offerten: ${error.message}`);
  return data ? fromRow(data as Row) : null;
}

/** Quotes linked to a lead, newest first. */
export async function listQuotesForLead(leadId: string): Promise<Quote[]> {
  if (isDemo()) return demoQuotes().filter((r) => r.lead_id === leadId).map(fromRow);
  const supabase = await createSessionClient();
  const { data } = await supabase.from("quotes").select("*").eq("lead_id", leadId).order("created_at", { ascending: false });
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
    .insert({ ...summary(data), created_by: createdBy })
    .select("id")
    .single();
  if (error) throw new Error(`Kunde inte skapa offerten: ${error.message}`);
  return inserted.id as string;
}

export async function updateQuote(id: string, data: QuoteData): Promise<void> {
  if (isDemo()) {
    const r = demoQuotes().find((x) => x.id === id);
    if (!r) throw new Error("Offerten finns inte.");
    Object.assign(r, summary(data), { updated_at: new Date().toISOString() });
    return;
  }
  const supabase = await createSessionClient();
  const { data: rows, error } = await supabase.from("quotes").update(summary(data)).eq("id", id).select("id");
  if (error) throw new Error(`Kunde inte spara: ${error.message}`);
  if (!rows?.length) throw new Error("Kunde inte spara: offerten finns inte eller saknar behörighet.");
}

export async function setQuoteStatus(id: string, status: QuoteStatus): Promise<void> {
  const patch = status === "sent" ? { status, sent_at: new Date().toISOString() } : { status };
  if (isDemo()) {
    const r = demoQuotes().find((x) => x.id === id);
    if (r) Object.assign(r, patch, { updated_at: new Date().toISOString() });
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("quotes").update(patch).eq("id", id);
  if (error) throw new Error(`Kunde inte spara status: ${error.message}`);
}

export async function removeQuote(id: string): Promise<void> {
  if (isDemo()) {
    g.__binaafyQuotes = demoQuotes().filter((x) => x.id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw new Error(`Kunde inte ta bort: ${error.message}`);
}

/* ---------- saved templates ---------- */

export async function listSavedTemplates(division?: QuoteDivision): Promise<QuoteTemplateRecord[]> {
  if (isDemo()) return demoTemplates().filter((t) => !division || t.division === division).map((t) => ({ ...t, data: withQuoteDefaults(t.data) }));
  const supabase = await createSessionClient();
  let query = supabase.from("quote_templates").select("*").order("name");
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
  const { error } = await supabase.from("quote_templates").insert(record);
  if (error) throw new Error(`Kunde inte spara mallen: ${error.message}`);
}

export async function removeTemplate(id: string): Promise<void> {
  if (isDemo()) {
    g.__binaafyQuoteTemplates = demoTemplates().filter((t) => t.id !== id);
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("quote_templates").delete().eq("id", id);
  if (error) throw new Error(`Kunde inte ta bort mallen: ${error.message}`);
}
