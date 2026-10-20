import "server-only";
import { getDb } from "./db";
import { isDemo } from "../leads";
import { readOrgId } from "./org/current";
import type { Actor, CoreEvent, EventType } from "./events";

/** The newest events across everything, for the dashboard's feed. */
export async function listRecentEvents(limit = 10): Promise<CoreEvent[]> {
  if (isDemo()) {
    const g = globalThis as unknown as { __binaafyInvoices?: { events: CoreEvent[] } };
    return [...(g.__binaafyInvoices?.events ?? [])].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("events").select("org_id, aggregate_type, aggregate_id, type, data, actor, created_at");
  if (org) q = q.eq("org_id", org);
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
  if (error) throw new Error(`Kunde inte hämta händelser: ${error.message}`);
  return (data ?? []).map((r) => ({
    orgId: r.org_id as string,
    aggregateType: r.aggregate_type as CoreEvent["aggregateType"],
    aggregateId: r.aggregate_id as string,
    type: r.type as EventType,
    data: (r.data ?? {}) as CoreEvent["data"],
    actor: r.actor as Actor,
    at: r.created_at as string,
  }));
}
