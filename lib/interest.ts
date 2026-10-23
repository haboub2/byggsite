import "server-only";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/config";
import { isDemo } from "./leads";
import type { InterestInput, InterestRow, InterestSource } from "./interest-schema";

/**
 * Interest registrations for the invoicing product (/fakturering).
 *
 * The public form writes through submit_product_interest(), a security
 * definer function anon may run (0027_product_interest.sql), so no
 * service-role key is involved. Reading and deleting go through the signed-in
 * admin's session; RLS lets only is_site_admin() through.
 *
 * Demo mode (local development without Supabase, lib/leads.ts isDemo()):
 * everything runs on an in-memory list.
 */

export async function saveInterest(input: InterestInput, source: InterestSource): Promise<void> {
  if (isDemo()) {
    demoStore().unshift({
      id: `demo-${Date.now()}`,
      created_at: new Date().toISOString(),
      company: input.company,
      name: input.name,
      email: input.email.toLowerCase(),
      phone: input.phone || null,
      volume: input.volume,
      current_tool: input.currentTool,
      current_tool_other: input.currentToolOther || null,
      priority: input.priority || null,
      source,
      consent_at: new Date().toISOString(),
    });
    return;
  }
  if (!isSupabaseConfigured()) throw new Error("Formuläret är inte kopplat till databasen än.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_product_interest", {
    p_company: input.company,
    p_name: input.name,
    p_email: input.email,
    p_phone: input.phone || null,
    p_volume: input.volume,
    p_current_tool: input.currentTool,
    p_current_tool_other: input.currentToolOther || null,
    p_priority: input.priority || null,
    p_source: source,
  });
  if (error) throw new Error(`Kunde inte spara anmälan: ${error.message}`);
}

/** Every registration, newest first. */
export async function listInterest(): Promise<InterestRow[]> {
  if (isDemo()) return [...demoStore()];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("product_interest")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`Kunde inte hämta anmälningarna: ${error.message}`);
  return (data ?? []) as InterestRow[];
}

export async function deleteInterest(id: string): Promise<void> {
  if (isDemo()) {
    const list = demoStore();
    const i = list.findIndex((r) => r.id === id);
    if (i >= 0) list.splice(i, 1);
    return;
  }
  const supabase = await createClient();
  // RLS: only is_site_admin(). `select` makes a silently-blocked delete visible.
  const { data, error } = await supabase.from("product_interest").delete().eq("id", id).select("id");
  if (error) throw new Error(`Kunde inte ta bort: ${error.message}`);
  if (!data?.length) throw new Error("Kunde inte ta bort: anmälan finns inte eller saknar behörighet.");
}

/* ---------- demo data (development only) ---------- */

const g = globalThis as unknown as { __binaafyDemoInterest?: InterestRow[] };

function demoStore(): InterestRow[] {
  if (!g.__binaafyDemoInterest) {
    const ago = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
    g.__binaafyDemoInterest = [
      {
        id: "demo-1",
        created_at: ago(5),
        company: "Bergs Bygg AB",
        name: "Jonas Berg",
        email: "jonas@bergsbygg.example",
        phone: "073-555 12 34",
        volume: "10-50",
        current_tool: "fortnox",
        current_tool_other: null,
        priority: "Delfakturor på större jobb utan att räkna för hand.",
        source: { page: "/fakturering", referrer: "https://www.linkedin.com/" },
        consent_at: ago(5),
      },
      {
        id: "demo-2",
        created_at: ago(30),
        company: "Kakel & Golv i Mölndal",
        name: "Sara Holm",
        email: "sara@kakelgolv.example",
        phone: null,
        volume: "under-10",
        current_tool: "word-excel",
        current_tool_other: null,
        priority: null,
        source: { page: "/fakturering" },
        consent_at: ago(30),
      },
    ];
  }
  return g.__binaafyDemoInterest;
}
