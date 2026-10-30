import "server-only";
import { getDb } from "../core/db";
import { currentOrgId } from "../core/org/current";
import { isDemo } from "../leads";
import type { Actor, AggregateType, CoreEvent, EventType } from "../core/events";
import type { PaymentMethod } from "../core/ledger/posting";
import type { PaymentPlan, PaymentPlanStep } from "../core/plans/schema";
import { decodeCursor, encodeCursor, pageInMemory, type ApiPayment } from "./mappers";
import { ApiProblem } from "./route";

/**
 * Reads the API needs and the admin screens do not: every payment plan,
 * payments across invoices and the event log a page at a time. Always
 * inside asSystem(fn, orgId) from lib/api/route.ts, so the service-role
 * client is used and every query is filtered on the key's organisation.
 * Demo mode reads the in-memory stores.
 */

type ApiEvent = CoreEvent & { id: string };

/* ---------- payment plans ---------- */

type PlanRow = { id: string; project_id: string | null; quote_id: string | null; kind: "fixed" | "phases"; created_at: string };
type StepRow = {
  id: string;
  plan_id: string;
  sort: number;
  label: string;
  phase_id: string | null;
  percent: number | string | null;
  amount_ore: number | string | null;
  labor_share: number | string | null;
  due_rule: PaymentPlanStep["dueRule"];
  due_on: string | null;
  invoice_id: string | null;
  created_at: string;
};
const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

function planFromRows(p: PlanRow, steps: StepRow[]): PaymentPlan {
  return {
    id: p.id,
    projectId: p.project_id,
    quoteId: p.quote_id,
    kind: p.kind,
    createdAt: p.created_at,
    steps: steps
      .filter((s) => s.plan_id === p.id)
      .sort((a, b) => a.sort - b.sort)
      .map((s) => ({
        id: s.id,
        planId: s.plan_id,
        sort: s.sort,
        label: s.label,
        phaseId: s.phase_id,
        percent: num(s.percent),
        amountOre: num(s.amount_ore),
        laborShare: num(s.labor_share),
        dueRule: s.due_rule,
        dueOn: s.due_on,
        invoiceId: s.invoice_id,
        createdAt: s.created_at,
      })),
  };
}

/** Newest first. */
export async function listPaymentPlans(filter: { projectId?: string; id?: string; limit: number }): Promise<PaymentPlan[]> {
  if (isDemo()) {
    const g = globalThis as unknown as { __binaafyPlans?: { plans: PlanRow[]; steps: StepRow[] } };
    const plans = (g.__binaafyPlans?.plans ?? [])
      .filter((p) => (!filter.projectId || p.project_id === filter.projectId) && (!filter.id || p.id === filter.id))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, filter.limit);
    return plans.map((p) => planFromRows(p, g.__binaafyPlans?.steps ?? []));
  }
  const db = await getDb();
  let q = db.from("payment_plans").select("id, project_id, quote_id, kind, created_at").eq("org_id", await currentOrgId());
  if (filter.projectId) q = q.eq("project_id", filter.projectId);
  if (filter.id) q = q.eq("id", filter.id);
  const { data: plans, error } = await q.order("created_at", { ascending: false }).limit(filter.limit);
  if (error) throw new Error(`Kunde inte hämta betalplanerna: ${error.message}`);
  if (!plans?.length) return [];
  const { data: steps, error: e2 } = await db
    .from("payment_plan_steps")
    .select("id, plan_id, sort, label, phase_id, percent, amount_ore, labor_share, due_rule, due_on, invoice_id, created_at")
    .in("plan_id", plans.map((p) => p.id as string));
  if (e2) throw new Error(`Kunde inte hämta betalplanernas steg: ${e2.message}`);
  return (plans as PlanRow[]).map((p) => planFromRows(p, (steps ?? []) as StepRow[]));
}

/* ---------- payments ---------- */

/** Newest payment date first. */
export async function listPayments(filter: { invoiceId?: string; from?: string; to?: string; limit: number }): Promise<ApiPayment[]> {
  const inRange = (paidOn: string) => (!filter.from || paidOn >= filter.from) && (!filter.to || paidOn <= filter.to);
  if (isDemo()) {
    const g = globalThis as unknown as { __binaafyInvoices?: { payments: (ApiPayment & { invoiceId: string })[] } };
    return (g.__binaafyInvoices?.payments ?? [])
      .filter((p) => (!filter.invoiceId || p.invoiceId === filter.invoiceId) && inRange(p.paidOn))
      .sort((a, b) => b.paidOn.localeCompare(a.paidOn) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, filter.limit)
      .map((p) => ({ id: p.id, amountOre: p.amountOre, method: p.method, paidOn: p.paidOn, reference: p.reference, note: p.note, createdAt: p.createdAt, allocations: [{ invoiceId: p.invoiceId, amountOre: p.amountOre }] }));
  }
  const db = await getDb();
  const org = await currentOrgId();
  let q = db.from("payments").select("id, amount_ore, method, paid_on, reference, note, created_at, payment_allocations(invoice_id, amount_ore)").eq("org_id", org);
  if (filter.invoiceId) {
    const { data: alloc, error } = await db.from("payment_allocations").select("payment_id").eq("org_id", org).eq("invoice_id", filter.invoiceId);
    if (error) throw new Error(`Kunde inte hämta betalningarna: ${error.message}`);
    const ids = [...new Set((alloc ?? []).map((a) => a.payment_id as string))];
    if (!ids.length) return [];
    q = q.in("id", ids);
  }
  if (filter.from) q = q.gte("paid_on", filter.from);
  if (filter.to) q = q.lte("paid_on", filter.to);
  const { data, error } = await q.order("paid_on", { ascending: false }).order("created_at", { ascending: false }).limit(filter.limit);
  if (error) throw new Error(`Kunde inte hämta betalningarna: ${error.message}`);
  type Row = { id: string; amount_ore: number | string; method: PaymentMethod; paid_on: string; reference: string; note: string; created_at: string; payment_allocations: { invoice_id: string; amount_ore: number | string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    amountOre: Number(r.amount_ore),
    method: r.method,
    paidOn: r.paid_on,
    reference: r.reference,
    note: r.note,
    createdAt: r.created_at,
    allocations: (r.payment_allocations ?? []).map((a) => ({ invoiceId: a.invoice_id, amountOre: Number(a.amount_ore) })),
  }));
}

/* ---------- events ---------- */

export type EventPageQuery = { aggregateType?: AggregateType; aggregateId?: string; type?: EventType; order: "asc" | "desc"; cursor?: string; limit: number };

/**
 * One page of the event log, keyset-paginated on (created_at, id): stable
 * while new events are written, and the cursor never skips or repeats a row.
 */
export async function listEventsPage(query: EventPageQuery): Promise<{ events: ApiEvent[]; nextCursor: string | null }> {
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  if (query.cursor && !cursor) throw new ApiProblem("validation_error", "Anropet innehåller fel.", { cursor: "Okänd cursor. Använd nextCursor från förra svaret." });
  const matches = (e: ApiEvent) =>
    (!query.aggregateType || e.aggregateType === query.aggregateType) && (!query.aggregateId || e.aggregateId === query.aggregateId) && (!query.type || e.type === query.type);

  if (isDemo()) {
    const g = globalThis as unknown as { __binaafyInvoices?: { events: ApiEvent[] } };
    const { page, next } = pageInMemory((g.__binaafyInvoices?.events ?? []).filter(matches), query.order, query.limit, cursor);
    return { events: page, nextCursor: next };
  }

  const db = await getDb();
  const asc = query.order === "asc";
  let q = db.from("events").select("id, org_id, aggregate_type, aggregate_id, type, data, actor, created_at").eq("org_id", await currentOrgId());
  // Personal events (0035) and time locks and call-ins (0037) never leave through the API: the key holder is not a payroll reader.
  q = q.not("aggregate_type", "in", "(employee,time)");
  if (query.aggregateType) q = q.eq("aggregate_type", query.aggregateType);
  if (query.aggregateId) q = q.eq("aggregate_id", query.aggregateId);
  if (query.type) q = q.eq("type", query.type);
  if (cursor) {
    const op = asc ? "gt" : "lt";
    q = q.or(`created_at.${op}."${cursor.at}",and(created_at.eq."${cursor.at}",id.${op}.${cursor.id})`);
  }
  const { data, error } = await q
    .order("created_at", { ascending: asc })
    .order("id", { ascending: asc })
    .limit(query.limit + 1);
  if (error) throw new Error(`Kunde inte hämta händelserna: ${error.message}`);
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    orgId: r.org_id as string,
    aggregateType: r.aggregate_type as AggregateType,
    aggregateId: r.aggregate_id as string,
    type: r.type as EventType,
    data: (r.data ?? {}) as CoreEvent["data"],
    actor: r.actor as Actor,
    at: r.created_at as string,
  }));
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return { events: page, nextCursor: rows.length > query.limit && last ? encodeCursor(last.at, last.id) : null };
}
