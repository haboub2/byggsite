/**
 * The payroll rows on Idag (docs/hr-lon.md, section 11): a run that is due
 * (five workdays before pay day with nothing computed), a computed run
 * waiting for approval, and the skattekonto payment for a run's AGI
 * period. Pure; lib/admin/today.ts reads the runs and the settings.
 */

import { addDays, daysBetween, type IsoDate } from "../rules/index";
import { agiDueDate } from "../rules/payroll";
import { monthLabel } from "./format";
import { payDateFor, runDueFrom, type PayrollSettings } from "./settings";

export type PayrollTodo = { id: string; kind: "run-due" | "approve" | "tax-account"; tag: string; title: string; meta: string; href: string; weight: number };

type RunLike = { id: string; periodStart: IsoDate; payDate: IsoDate; agiPeriod: string; status: string; totals: { taxOre?: number; employerContributionOre?: number } };

const kr = (ore: number) => `${Math.round(ore / 100).toLocaleString("sv-SE").replace(/\s/g, " ")} kr`;

export function payrollTodos(input: { runs: readonly RunLike[]; settings: Pick<PayrollSettings, "payDay">; today: IsoDate; canApprove: boolean; hasPeople: boolean }): PayrollTodo[] {
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
    const due = agiDueDate(r.agiPeriod);
    const days = daysBetween(today, due.payBy);
    if (days < 0 || days > 21) continue;
    const amount = (r.totals.taxOre ?? 0) + (r.totals.employerContributionOre ?? 0);
    out.push({
      id: `tax-${r.id}`,
      kind: "tax-account",
      tag: "Skattekonto",
      title: `Betala ${kr(amount)} till skattekontot (AGI ${r.agiPeriod})`,
      meta: `Skatteavdrag och arbetsgivaravgifter senast ${due.payBy}; AGI lämnas samma dag`,
      href: "/admin/rapporter#skattekonto",
      weight: days <= 3 ? 1 : 8,
    });
  }
  return out.sort((a, b) => a.weight - b.weight);
}
