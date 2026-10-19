import { z } from "zod";

/**
 * Betalplan: how a project's quote is split into invoices
 * (payment_plans and payment_plan_steps in 0014_core.sql). A step is a
 * share of the quote (percent) or a fixed amount, becomes billable by a
 * rule, and points at the invoice once one is created. The last step is
 * normally "on_completion" and takes the remainder plus approved ÄTA.
 */

export const DUE_RULES = ["on_start", "on_phase_done", "on_date", "on_completion"] as const;
export type DueRule = (typeof DUE_RULES)[number];
export const DUE_RULE_LABEL: Record<DueRule, string> = {
  on_start: "Vid start",
  on_phase_done: "När fasen är klar",
  on_date: "På datum",
  on_completion: "När projektet är klart (slutfaktura)",
};

export const planStepInputSchema = z
  .object({
    label: z.string().trim().min(1, "Rubrik krävs.").max(80),
    /** Share of the quote total, 0–100, or null for a fixed amount. */
    percent: z.number().min(0).max(100).nullable(),
    /** Fixed amount incl. VAT in öre, used when percent is null. */
    amountOre: z.number().int().min(0).nullable(),
    phaseId: z.string().nullable(),
    dueRule: z.enum(DUE_RULES),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    /** Labour share of this step for ROT, 0–1; null = the quote's own share. */
    laborShare: z.number().min(0).max(1).nullable(),
  })
  .refine((s) => s.percent !== null || s.amountOre !== null || s.dueRule === "on_completion", {
    message: "Ange andel eller belopp (slutfakturan tar resten).",
    path: ["percent"],
  })
  .refine((s) => s.dueRule !== "on_phase_done" || s.phaseId, { message: "Välj vilken fas steget hör till.", path: ["phaseId"] })
  .refine((s) => s.dueRule !== "on_date" || s.dueOn, { message: "Ange datumet.", path: ["dueOn"] });
export type PlanStepInput = z.infer<typeof planStepInputSchema>;

export type PaymentPlanStep = PlanStepInput & {
  id: string;
  planId: string;
  sort: number;
  invoiceId: string | null;
  createdAt: string;
};

export type PaymentPlan = {
  id: string;
  projectId: string | null;
  quoteId: string | null;
  kind: "fixed" | "phases";
  steps: PaymentPlanStep[];
  createdAt: string;
};

/** Built-in templates. Percent steps; the last one takes the remainder and the ÄTA. */
export const PLAN_TEMPLATES: { key: string; name: string; description: string; steps: PlanStepInput[] }[] = [
  {
    key: "30-40-30",
    name: "30 / 40 / 30",
    description: "30 % vid start, 40 % när en vald fas är klar, resten vid klart projekt.",
    steps: [
      { label: "30 % vid start", percent: 30, amountOre: null, phaseId: null, dueRule: "on_start", dueOn: null, laborShare: null },
      { label: "40 % när fasen är klar", percent: 40, amountOre: null, phaseId: null, dueRule: "on_phase_done", dueOn: null, laborShare: null },
      { label: "Slutfaktura", percent: null, amountOre: null, phaseId: null, dueRule: "on_completion", dueOn: null, laborShare: null },
    ],
  },
  {
    key: "50-50",
    name: "50 / 50",
    description: "Hälften vid start, resten vid klart projekt.",
    steps: [
      { label: "50 % vid start", percent: 50, amountOre: null, phaseId: null, dueRule: "on_start", dueOn: null, laborShare: null },
      { label: "Slutfaktura", percent: null, amountOre: null, phaseId: null, dueRule: "on_completion", dueOn: null, laborShare: null },
    ],
  },
  {
    key: "slut",
    name: "Allt vid klart",
    description: "En faktura när projektet är klart, inklusive ÄTA.",
    steps: [{ label: "Slutfaktura", percent: null, amountOre: null, phaseId: null, dueRule: "on_completion", dueOn: null, laborShare: null }],
  },
];
