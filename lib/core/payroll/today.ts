/**
 * The payroll rows on Idag (docs/hr-lon.md, section 11): a run that is due
 * (five workdays before pay day with nothing computed), a computed run
 * waiting for approval, and the skattekonto payment for a run's AGI
 * period: the stored declaration's amount (whole kronor per rate, as
 * Skatteverket computes) once there is one, gone when it is marked paid.
 * Pure; lib/admin/today.ts reads the runs and the settings.
 */

import { addDays, daysBetween, type IsoDate } from "../rules/index";
import { agiDueDate } from "../rules/payroll";
import { monthLabel } from "./format";
import { agiDueFor, payDateFor, runDueFrom, type PayrollSettings } from "./settings";

export type PayrollTodo = { id: string; kind: "run-due" | "approve" | "tax-account"; tag: string; title: string; meta: string; href: string; weight: number };

type RunLike = { id: string; periodStart: IsoDate; payDate: IsoDate; agiPeriod: string; status: string; totals: { taxOre?: number; employerContributionOre?: number } };

const kr = (ore: number) => `${Math.round(ore / 100).toLocaleString("sv-SE").replace(/\s/g, " ")} kr`;

/** The latest stored AGI per period: what to pay, and whether the owner has marked it paid. */
export type AgiPayment = { amountOre: number; version: number; paid: boolean };

export function payrollTodos(input: {
  runs: readonly RunLike[];
  settings: Pick<PayrollSettings, "payDay"> & Partial<Pick<PayrollSettings, "agi">>;
  today: IsoDate;
  canApprove: boolean;
  hasPeople: boolean;
  agi?: ReadonlyMap<string, AgiPayment>;
}): PayrollTodo[] {
  const { today } = input;
  const out: PayrollTodo[] = [];
  if (input.hasPeople) {
    for (const month of [today.slice(0, 7), addDays(`${today.slice(0, 7)}-28`, 7).slice(0, 7)]) {
      const payDate = payDateFor(month, input.settings);
      const from = runDueFrom(payDate);
      const run = input.runs.find((r) => r.periodStart.startsWith(month));
      if (today < from || today > payDate || (run && run.status !== "draft")) continue;
      const days = daysBetween(today, payDate);
      out.push({
        id: `run-due-${month}`,
        kind: "run-due",
        tag: "Lön",
        title: `Lönen för ${monthLabel(`${month}-01`)} ska räknas`,
        meta: `Lönedag ${payDate}, om ${days} ${days === 1 ? "dag" : "dagar"}`,
        href: run ? `/admin/lon/${run.id}` : "/admin/lon",
        weight: days <= 2 ? 1 : 4,
      });
    }
  }
  for (const r of input.runs) {
    if (r.status === "calculated" && input.canApprove) {
      out.push({ id: `approve-${r.id}`, kind: "approve", tag: "Lön", title: `Lönen för ${monthLabel(r.periodStart)} väntar på godkännande`, meta: `Lönedag ${r.payDate}; den som räknade godkänner inte`, href: `/admin/lon/${r.id}`, weight: 2 });
    }
    if (r.status === "draft" || r.status === "calculated") continue;
    const due = input.settings.agi ? agiDueFor(r.agiPeriod, { agi: input.settings.agi }) : agiDueDate(r.agiPeriod);
    const days = daysBetween(today, due.payBy);
    if (days < 0 || days > 21) continue;
    const declared = input.agi?.get(r.agiPeriod);
    if (declared?.paid) continue;
    const amount = declared ? declared.amountOre : (r.totals.taxOre ?? 0) + (r.totals.employerContributionOre ?? 0);
    out.push({
      id: `tax-${r.id}`,
      kind: "tax-account",
      tag: "Skattekonto",
      title: `Betala ${kr(amount)} till skattekontot (AGI ${r.agiPeriod})`,
      meta: `Skatteavdrag och arbetsgivaravgifter senast ${due.payBy}${declared ? `, enligt AGI version ${declared.version}` : ", ungefär (AGI är inte skapad)"}; ${due.declareBy === due.payBy ? "AGI lämnas samma dag" : `AGI senast ${due.declareBy}`}`,
      href: "/admin/rapporter#skattekonto",
      weight: days <= 3 ? 1 : 8,
    });
  }
  return out.sort((a, b) => a.weight - b.weight);
}
