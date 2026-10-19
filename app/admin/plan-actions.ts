"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { checkAdmin } from "@/lib/admin";
import { customerFromBuyerLike } from "@/lib/core/customers/schema";
import { createCustomer, findSimilarCustomer } from "@/lib/core/customers/store";
import { invoiceDocumentForStep } from "@/lib/core/invoices/from-plan";
import { createInvoice } from "@/lib/core/invoices/store";
import { PLAN_TEMPLATES, planStepInputSchema, type PlanStepInput } from "@/lib/core/plans/schema";
import { addStep, changeOrderInvoiceIds, createPlan, getPlanForProject, markStepInvoiced, removePlan, removeStep } from "@/lib/core/plans/store";
import { stepIsBillable } from "@/lib/core/plans/billing";
import { parseKronor } from "@/lib/core/money";
import { getProjectBundle } from "@/lib/portal/store";
import { getQuote } from "@/lib/quotes/store";
import { todayIso } from "@/lib/quotes/schema";

const projectUrl = (id: string, q?: Record<string, string>) => `/admin/projekt/${id}${q ? `?${new URLSearchParams(q)}` : ""}#ekonomi`;

function refresh(projectId: string) {
  revalidatePath(`/admin/projekt/${projectId}`);
  revalidatePath("/admin/fakturor", "layout");
  revalidatePath(`/mitt-projekt/${projectId}`, "layout");
}

/** A plan from a template. The template's "on_phase_done" step gets the chosen phase. */
export async function createPlanAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) redirect("/admin/login");
  const projectId = String(formData.get("project") ?? "");
  const key = String(formData.get("template") ?? "");
  const phaseId = String(formData.get("phase") ?? "") || null;
  const bundle = await getProjectBundle(projectId);
  if (!bundle) redirect("/admin/projekt");
  if (!bundle.project.quote_id) redirect(projectUrl(projectId, { fel: "Projektet saknar offert. Koppla en offert först; betalplanen är andelar av den." }));
  const template = PLAN_TEMPLATES.find((t) => t.key === key);
  if (!template) redirect(projectUrl(projectId, { fel: "Mallen hittades inte." }));
  const steps = template.steps.map((s) => (s.dueRule === "on_phase_done" ? { ...s, phaseId } : s));
  if (steps.some((s) => s.dueRule === "on_phase_done" && !s.phaseId)) redirect(projectUrl(projectId, { fel: "Välj vilken fas mittsteget ska knytas till." }));
  if (await getPlanForProject(projectId)) redirect(projectUrl(projectId, { fel: "Projektet har redan en betalplan." }));
  await createPlan({ projectId, quoteId: bundle.project.quote_id, steps });
  refresh(projectId);
  redirect(projectUrl(projectId, { sparat: "plan" }));
}

export async function addStepAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const projectId = String(formData.get("project") ?? "");
  const plan = await getPlanForProject(projectId);
  if (!plan) return;
  const dueRule = String(formData.get("dueRule") ?? "on_start") as PlanStepInput["dueRule"];
  const percentRaw = String(formData.get("percent") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const input = {
    label: String(formData.get("label") ?? "").trim() || (dueRule === "on_completion" ? "Slutfaktura" : "Delfaktura"),
    percent: percentRaw ? Number(percentRaw.replace(",", ".")) : null,
    amountOre: !percentRaw && amountRaw ? parseKronor(amountRaw) : null,
    phaseId: String(formData.get("phase") ?? "") || null,
    dueRule,
    dueOn: String(formData.get("dueOn") ?? "") || null,
    laborShare: null,
  };
  const parsed = planStepInputSchema.safeParse(input);
  if (!parsed.success) redirect(projectUrl(projectId, { fel: parsed.error.issues[0]?.message ?? "Steget kunde inte sparas." }));
  await addStep(plan.id, parsed.data);
  refresh(projectId);
  redirect(projectUrl(projectId));
}

export async function removeStepAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const projectId = String(formData.get("project") ?? "");
  try {
    await removeStep(String(formData.get("step") ?? ""));
  } catch (err) {
    redirect(projectUrl(projectId, { fel: err instanceof Error ? err.message : "Kunde inte ta bort steget." }));
  }
  refresh(projectId);
  redirect(projectUrl(projectId));
}

export async function removePlanAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const projectId = String(formData.get("project") ?? "");
  try {
    await removePlan(String(formData.get("plan") ?? ""));
  } catch (err) {
    redirect(projectUrl(projectId, { fel: err instanceof Error ? err.message : "Kunde inte ta bort betalplanen." }));
  }
  refresh(projectId);
  redirect(projectUrl(projectId));
}

/** The draft for a billable step; opens in the invoice editor. */
export async function createStepInvoiceAction(formData: FormData): Promise<void> {
  const check = await checkAdmin();
  if (!check.ok) return;
  const projectId = String(formData.get("project") ?? "");
  const stepId = String(formData.get("step") ?? "");
  const bundle = await getProjectBundle(projectId);
  const plan = await getPlanForProject(projectId);
  const step = plan?.steps.find((s) => s.id === stepId);
  if (!bundle || !plan || !step) redirect(projectUrl(projectId, { fel: "Steget finns inte." }));
  const billable = stepIsBillable(step, bundle.phases, bundle.project, todayIso());
  if (!billable.ok) redirect(projectUrl(projectId, { fel: `Steget kan inte faktureras än: ${billable.reason.toLowerCase()}.` }));
  const quote = plan.quoteId ? await getQuote(plan.quoteId) : null;
  if (!quote) redirect(projectUrl(projectId, { fel: "Offerten som betalplanen bygger på finns inte." }));

  const c = quote.data.customer;
  const customerInput = customerFromBuyerLike({ ...c, type: c.type === "foretag" ? "foretag" : "privat" });
  const existing = await findSimilarCustomer(customerInput);
  const customerId = existing?.id ?? (await createCustomer(customerInput, check.email));
  const invoicedOn = await changeOrderInvoiceIds(projectId);
  const changeOrders = bundle.changeOrders.map((co) => ({ ...co, invoiceId: invoicedOn[co.id] ?? null }));
  const { document, changeOrderIds } = await invoiceDocumentForStep({ project: bundle.project, plan, step, quote, customerId, changeOrders, issueDate: todayIso() });
  const invoiceId = await createInvoice({ document, quoteId: quote.id, projectId }, check.email);
  await markStepInvoiced(step.id, invoiceId, changeOrderIds);
  refresh(projectId);
  redirect(`/admin/fakturor/${invoiceId}`);
}
