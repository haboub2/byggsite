import "server-only";
import { createClient as createSessionClient } from "../../supabase/server";
import { isDemo } from "../../leads";
import type { Customer, CustomerInput } from "./schema";

/**
 * The customers table (supabase/migrations/0014_core.sql), read and written
 * with the admin's session so RLS decides. org_id defaults to default_org()
 * in the database until there is more than one organisation. Demo mode
 * keeps everything in memory, like the quotes.
 */

type Row = {
  id: string;
  type: Customer["type"];
  name: string;
  company: string;
  org_nr: string;
  vat_nr: string;
  email: string;
  phone: string;
  street: string;
  postal_code: string;
  city: string;
  reference: string;
  default_terms_days: number;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const fromRow = (r: Row): Customer => ({
  id: r.id,
  type: r.type,
  name: r.name,
  company: r.company,
  orgNr: r.org_nr,
  vatNr: r.vat_nr,
  email: r.email,
  phone: r.phone,
  street: r.street,
  postalCode: r.postal_code,
  city: r.city,
  reference: r.reference,
  defaultTermsDays: r.default_terms_days,
  notes: r.notes,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toRow = (c: CustomerInput) => ({
  type: c.type,
  name: c.name,
  company: c.company,
  org_nr: c.orgNr,
  vat_nr: c.vatNr,
  email: c.email,
  phone: c.phone,
  street: c.street,
  postal_code: c.postalCode,
  city: c.city,
  reference: c.reference,
  default_terms_days: c.defaultTermsDays,
  notes: c.notes,
});

const g = globalThis as unknown as { __binaafyCustomers?: Row[] };
const demo = () => (g.__binaafyCustomers ??= []);

export async function listCustomers(q?: string): Promise<Customer[]> {
  const term = q?.trim().toLowerCase();
  if (isDemo()) {
    return demo()
      .filter((r) => !r.deleted_at)
      .filter((r) => !term || [r.name, r.company, r.email, r.city, r.org_nr].join(" ").toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name, "sv"))
      .map(fromRow);
  }
  const supabase = await createSessionClient();
  let query = supabase.from("customers").select("*").is("deleted_at", null).order("name").limit(1000);
  if (term) {
    const safe = term.replace(/["\\*%,]/g, " ").trim();
    if (safe) query = query.or([`name.ilike."*${safe}*"`, `company.ilike."*${safe}*"`, `email.ilike."*${safe}*"`, `city.ilike."*${safe}*"`].join(","));
  }
  const { data, error } = await query;
  if (error) throw new Error(`Kunde inte hämta kunder: ${error.message}`);
  return (data as Row[]).map(fromRow);
}

export async function getCustomer(id: string): Promise<Customer | null> {
  if (isDemo()) {
    const r = demo().find((x) => x.id === id && !x.deleted_at);
    return r ? fromRow(r) : null;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(`Kunde inte hämta kunden: ${error.message}`);
  return data ? fromRow(data as Row) : null;
}

export async function createCustomer(input: CustomerInput, createdBy: string | null): Promise<string> {
  if (isDemo()) {
    const now = new Date().toISOString();
    const row: Row = { id: crypto.randomUUID(), ...toRow(input), created_at: now, updated_at: now, deleted_at: null };
    demo().push(row);
    return row.id;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("customers").insert({ ...toRow(input), created_by: createdBy }).select("id").single();
  if (error) throw new Error(`Kunde inte skapa kunden: ${error.message}`);
  return data.id as string;
}

export async function updateCustomer(id: string, input: CustomerInput): Promise<void> {
  if (isDemo()) {
    const r = demo().find((x) => x.id === id);
    if (!r) throw new Error("Kunden finns inte.");
    Object.assign(r, toRow(input), { updated_at: new Date().toISOString() });
    return;
  }
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from("customers").update(toRow(input)).eq("id", id).select("id");
  if (error) throw new Error(`Kunde inte spara kunden: ${error.message}`);
  if (!data?.length) throw new Error("Kunde inte spara: kunden finns inte eller saknar behörighet.");
}

/** Soft delete: invoices keep pointing at the row, the list stops showing it. */
export async function archiveCustomer(id: string): Promise<void> {
  if (isDemo()) {
    const r = demo().find((x) => x.id === id);
    if (r) r.deleted_at = new Date().toISOString();
    return;
  }
  const supabase = await createSessionClient();
  const { error } = await supabase.from("customers").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(`Kunde inte ta bort kunden: ${error.message}`);
}

/** Find a customer that looks like this one (same e-mail, or same org nr), to avoid duplicates when creating from a quote. */
export async function findSimilarCustomer(input: Pick<CustomerInput, "email" | "orgNr" | "name">): Promise<Customer | null> {
  const all = await listCustomers();
  const email = input.email.trim().toLowerCase();
  const org = input.orgNr.replace(/\D/g, "");
  return (
    all.find((c) => (email && c.email.toLowerCase() === email) || (org && c.orgNr.replace(/\D/g, "") === org)) ??
    all.find((c) => !email && !org && c.name.toLowerCase() === input.name.trim().toLowerCase()) ??
    null
  );
}
