import "server-only";
import { getDb } from "../db";
import { currentOrgId, readOrgId } from "../org/current";
import { isDemo } from "../../leads";
import type { PaymentPlan, PaymentPlanStep, PlanStepInput } from "./schema";

/**
 * payment_plans and payment_plan_steps (0014_core.sql). One plan per
 * project. Demo mode keeps plans in memory and also remembers which
 * change orders went on which invoice, since the demo portal's change
 * orders have no invoice_id column.
 */

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
type PlanRow = { id: string; project_id: string | null; quote_id: string | null; kind: "fixed" | "phases"; created_at: string };

const num = (v: number | string | null): number | null => (v === null ? null : Number(v));

const fromStep = (r: StepRow): PaymentPlanStep => ({
  id: r.id,
  planId: r.plan_id,
  sort: r.sort,
  label: r.label,
  phaseId: r.phase_id,
  percent: num(r.percent),
  amountOre: num(r.amount_ore),
  laborShare: num(r.labor_share),
  dueRule: r.due_rule,
  dueOn: r.due_on,
  invoiceId: r.invoice_id,
  createdAt: r.created_at,
});

const toStep = (s: PlanStepInput, planId: string, sort: number) => ({
  plan_id: planId,
  sort,
  label: s.label,
  phase_id: s.phaseId,
  percent: s.percent,
  amount_ore: s.amountOre,
  labor_share: s.laborShare,
  due_rule: s.dueRule,
  due_on: s.dueOn,
});

type DemoState = { plans: PlanRow[]; steps: StepRow[]; changeOrderInvoices: Record<string, string> };
const g = globalThis as unknown as { __binaafyPlans?: DemoState };
const demo = (): DemoState => (g.__binaafyPlans ??= { plans: [], steps: [], changeOrderInvoices: {} });

export async function getPlanForProject(projectId: string): Promise<PaymentPlan | null> {
  if (isDemo()) {
    const plan = demo().plans.find((p) => p.project_id === projectId);
    if (!plan) return null;
    return { id: plan.id, projectId: plan.project_id, quoteId: plan.quote_id, kind: plan.kind, createdAt: plan.created_at, steps: demo().steps.filter((s) => s.plan_id === plan.id).sort((a, b) => a.sort - b.sort).map(fromStep) };
  }
  const supabase = await getDb();
  const org = await readOrgId();
  let q = supabase.from("payment_plans").select("*").eq("project_id", projectId);
  if (org) q = q.eq("org_id", org);
  const { data: plan, error } = await q.maybeSingle();
  if (error) throw new Error(`Kunde inte hämta betalplanen: ${error.message}`);
  if (!plan) return null;
  const { data: steps, error: e2 } = await supabase.from("payment_plan_steps").select("*").eq("plan_id", plan.id).order("sort");
  if (e2) throw new Error(`Kunde inte hämta betalplanen: ${e2.message}`);
  const p = plan as PlanRow;
  return { id: p.id, projectId: p.project_id, quoteId: p.quote_id, kind: p.kind, createdAt: p.created_at, steps: (steps as StepRow[]).map(fromStep) };
}

export async function createPlan(input: { projectId: string; quoteId: string | null; steps: PlanStepInput[] }): Promise<string> {
  if (isDemo()) {
    const now = new Date().toISOString();
    const plan: PlanRow = { id: crypto.randomUUID(), project_id: input.projectId, quote_id: input.quoteId, kind: "fixed", created_at: now };
    demo().plans.push(plan);
    input.steps.forEach((s, i) => demo().steps.push({ id: crypto.randomUUID(), ...toStep(s, plan.id, i), invoice_id: null, created_at: now }));
    return plan.id;
  }
  const supabase = await getDb();
  const org = await currentOrgId();
  const { data: plan, error } = await supabase.from("payment_plans").insert({ org_id: org, project_id: input.projectId, quote_id: input.quoteId, kind: "fixed" }).select("id").single();
  if (error) throw new Error(`Kunde inte skapa betalplanen: ${error.message}`);
  const { error: e2 } = await supabase.from("payment_plan_steps").insert(input.steps.map((s, i) => ({ ...toStep(s, plan.id as string, i), org_id: org })));
  if (e2) throw new Error(`Kunde inte skapa stegen: ${e2.message}`);
  return plan.id as string;
}

export async function addStep(planId: string, step: PlanStepInput): Promise<void> {
  if (isDemo()) {
    const sort = Math.max(-1, ...demo().steps.filter((s) => s.plan_id === planId).map((s) => s.sort)) + 1;
    demo().steps.push({ id: crypto.randomUUID(), ...toStep(step, planId, sort), invoice_id: null, created_at: new Date().toISOString() });
    return;
  }
  const supabase = await getDb();
  const { data: last } = await supabase.from("payment_plan_steps").select("sort").eq("plan_id", planId).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("payment_plan_steps").insert({ ...toStep(step, planId, ((last?.sort as number | undefined) ?? -1) + 1), org_id: await currentOrgId() });
  if (error) throw new Error(`Kunde inte lägga till steget: ${error.message}`);
}

export async function updateStep(stepId: string, step: PlanStepInput): Promise<void> {
  if (isDemo()) {
    const r = demo().steps.find((s) => s.id === stepId);
    if (!r) throw new Error("Steget finns inte.");
    if (r.invoice_id) throw new Error("Steget är fakturerat och kan inte ändras.");
    Object.assign(r, toStep(step, r.plan_id, r.sort));
    return;
  }
  const supabase = await getDb();
  const { data, error } = await supabase.from("payment_plan_steps").update({ label: step.label, phase_id: step.phaseId, percent: step.percent, amount_ore: step.amountOre, labor_share: step.laborShare, due_rule: step.dueRule, due_on: step.dueOn }).eq("id", stepId).eq("org_id", await currentOrgId()).is("invoice_id", null).select("id");
  if (error) throw new Error(`Kunde inte spara steget: ${error.message}`);
  if (!data?.length) throw new Error("Steget är fakturerat eller finns inte.");
}

export async function removeStep(stepId: string): Promise<void> {
  if (isDemo()) {
    const r = demo().steps.find((s) => s.id === stepId);
    if (r?.invoice_id) throw new Error("Steget är fakturerat och kan inte tas bort.");
    demo().steps = demo().steps.filter((s) => s.id !== stepId);
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("payment_plan_steps").delete().eq("id", stepId).eq("org_id", await currentOrgId()).is("invoice_id", null);
  if (error) throw new Error(`Kunde inte ta bort steget: ${error.message}`);
}

export async function removePlan(planId: string): Promise<void> {
  if (isDemo()) {
    if (demo().steps.some((s) => s.plan_id === planId && s.invoice_id)) throw new Error("Planen har fakturerade steg och kan inte tas bort.");
    demo().steps = demo().steps.filter((s) => s.plan_id !== planId);
    demo().plans = demo().plans.filter((p) => p.id !== planId);
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("payment_plans").delete().eq("id", planId).eq("org_id", await currentOrgId());
  if (error) throw new Error(`Kunde inte ta bort betalplanen: ${error.message}`);
}

/** Link a step to the invoice created for it, and the ÄTA that went on that invoice. */
export async function markStepInvoiced(stepId: string, invoiceId: string, changeOrderIds: string[]): Promise<void> {
  if (isDemo()) {
    const r = demo().steps.find((s) => s.id === stepId);
    if (r) r.invoice_id = invoiceId;
    for (const id of changeOrderIds) demo().changeOrderInvoices[id] = invoiceId;
    return;
  }
  const supabase = await getDb();
  const { error } = await supabase.from("payment_plan_steps").update({ invoice_id: invoiceId }).eq("id", stepId).eq("org_id", await currentOrgId());
  if (error) throw new Error(`Kunde inte koppla steget: ${error.message}`);
  if (changeOrderIds.length) {
    const { error: e2 } = await supabase.from("change_orders").update({ invoice_id: invoiceId }).in("id", changeOrderIds);
    if (e2) throw new Error(`Kunde inte markera ÄTA som fakturerade: ${e2.message}`);
  }
}

/** Which invoice each change order went on (null = not yet). */
export async function changeOrderInvoiceIds(projectId: string): Promise<Record<string, string | null>> {
  if (isDemo()) return { ...demo().changeOrderInvoices };
  const supabase = await getDb();
  const { data } = await supabase.from("change_orders").select("id, invoice_id").eq("project_id", projectId);
  return Object.fromEntries(((data ?? []) as { id: string; invoice_id: string | null }[]).map((r) => [r.id, r.invoice_id]));
}
