/**
 * The authorities' rows on Idag (docs/hr-lon.md, section 11): the AGI due
 * within ten days and not filed, Fora's report due (the last day of the
 * month after the payout) and not filed, and Försäkringskassan's
 * reminders (fk.ts). The skattekonto payment is payrollTodos()'s. Pure;
 * lib/admin/today.ts reads the data.
 */

import { daysBetween, type IsoDate } from "../rules/index";
import type { FkReminder } from "./fk";
import { foraDueDate } from "./fora";
import { monthLabel } from "./format";
import { agiDueFor, type PayrollSettings } from "./settings";

export type AuthorityTodo = { id: string; kind: "agi" | "fora" | "fk"; tag: string; title: string; meta: string; href: string; weight: number };

const days = (n: number) => (n === 0 ? "i dag" : n === 1 ? "i morgon" : n < 0 ? `${-n} ${n === -1 ? "dag" : "dagar"} sedan` : `om ${n} dagar`);

export function authorityTodos(input: {
  /** Months with an approved run paid in them (the AGI months that need a declaration). */
  agiPeriods: readonly string[];
  /** Months with a filed AGI version. */
  filedAgi: ReadonlySet<string>;
  /** Months with pay to SAF-LO people in closed runs, and those with a filed Fora report. */
  foraPeriods: readonly string[];
  filedFora: ReadonlySet<string>;
  fk: readonly FkReminder[];
  names: ReadonlyMap<string, string>;
  settings: Pick<PayrollSettings, "agi">;
  today: IsoDate;
}): AuthorityTodo[] {
  const { today } = input;
  const out: AuthorityTodo[] = [];
  for (const period of input.agiPeriods) {
    if (input.filedAgi.has(period)) continue;
    const due = agiDueFor(period, input.settings);
    const left = daysBetween(today, due.declareBy);
    if (left > 10) continue;
    out.push({
      id: `agi-${period}`,
      kind: "agi",
      tag: "AGI",
      title: `Lämna arbetsgivardeklarationen för ${monthLabel(period)}`,
      meta: `Senast ${due.declareBy} (${days(left)}); skapa filen i Lönerapporter, ladda upp och signera i Skatteverkets e-tjänst`,
      href: "/admin/rapporter#agi",
      weight: left <= 2 ? 1 : 3,
    });
  }
  for (const period of input.foraPeriods) {
    if (input.filedFora.has(period)) continue;
    const due = foraDueDate(period);
    const left = daysBetween(today, due);
    if (left > 14) continue;
    out.push({
      id: `fora-${period}`,
      kind: "fora",
      tag: "Fora",
      title: `Rapportera lönerna för ${monthLabel(period)} till Fora`,
      meta: `Senast ${due} (${days(left)}); arbetarnas bruttolön, på Foras Mina sidor`,
      href: "/admin/rapporter#fora",
      weight: left <= 3 ? 2 : 6,
    });
  }
  for (const r of input.fk) {
    const name = input.names.get(r.employeeId) ?? "Okänd person";
    if (r.kind === "sick-report" && r.dueBy) {
      const left = daysBetween(today, r.dueBy);
      out.push({
        id: r.id,
        kind: "fk",
        tag: "Försäkringskassan",
        title: `${name}: anmäl sjukfallet till Försäkringskassan`,
        meta: `Sjuk sedan ${r.from}, dag 15 var ${r.dueFrom}; anmälan senast ${r.dueBy} (${days(left)}), sjuklönelagen 12 §`,
        href: `/admin/personal/${r.employeeId}?flik=franvaro`,
        weight: left <= 2 ? 1 : 3,
      });
    } else {
      out.push({
        id: r.id,
        kind: "fk",
        tag: "Försäkringskassan",
        title: `${name}: ${r.kind === "vab" ? "VAB" : "föräldraledighet"} från ${r.from}`,
        meta: "Den anställde ansöker själv hos Försäkringskassan; lönen dras i nästa körning, och Försäkringskassan kan be dig bekräfta frånvaron",
        href: `/admin/personal/${r.employeeId}?flik=franvaro`,
        weight: 9,
      });
    }
  }
  return out.sort((a, b) => a.weight - b.weight || a.id.localeCompare(b.id));
}
