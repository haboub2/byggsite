/**
 * The authorities' rows on Idag (docs/hr-lon.md, section 11): the AGI due
 * within ten days and not filed, Fora's report due (the last day of the
 * month after the payout) and not filed, Collectum's (the cutoff in the
 * month after) and not filed, expense claims waiting for approval (phase
 * 5), and Försäkringskassan's reminders (fk.ts). The skattekonto payment is payrollTodos()'s. Pure;
 * lib/admin/today.ts reads the data.
 */

import { daysBetween, type IsoDate } from "../rules/index";
import type { FkReminder } from "./fk";
import { foraDueDate } from "./fora";
import { collectumDueDate } from "./collectum";
import { monthLabel } from "./format";
import { agiDueFor, type PayrollSettings } from "./settings";

export type AuthorityTodo = { id: string; kind: "agi" | "fora" | "collectum" | "expense" | "fk"; tag: string; title: string; meta: string; href: string; weight: number };

const days = (n: number) => (n === 0 ? "i dag" : n === 1 ? "i morgon" : n < 0 ? `${-n} ${n === -1 ? "dag" : "dagar"} sedan` : `om ${n} dagar`);

export function authorityTodos(input: {
  /** Months with an approved run paid in them (the AGI months that need a declaration). */
  agiPeriods: readonly string[];
  /** Months with a filed AGI version. */
  filedAgi: ReadonlySet<string>;
  /** Months with pay to SAF-LO people in closed runs, and those with a filed Fora report. */
  foraPeriods: readonly string[];
  filedFora: ReadonlySet<string>;
  /** Months with pay to ITP1 people in closed runs, and those with a filed Collectum report. */
  collectumPeriods?: readonly string[];
  filedCollectum?: ReadonlySet<string>;
  /** Submitted claims per person, oldest submission first (for those who approve). */
  waitingClaims?: readonly { employeeId: string; count: number; oldest: IsoDate }[];
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
  for (const period of input.collectumPeriods ?? []) {
    if (input.filedCollectum?.has(period)) continue;
    const due = collectumDueDate(period);
    const left = daysBetween(today, due);
    if (left > 14) continue;
    out.push({
      id: `collectum-${period}`,
      kind: "collectum",
      tag: "Collectum",
      title: `Rapportera ITP1-lönerna för ${monthLabel(period)} till Collectum`,
      meta: `Före avstämningen kl. 22 den ${due} (${days(left)}); i Collectums internetkontor`,
      href: "/admin/rapporter#collectum",
      weight: left <= 3 ? 2 : 6,
    });
  }
  for (const w of input.waitingClaims ?? []) {
    const name = input.names.get(w.employeeId) ?? "Okänd person";
    out.push({
      id: `expense-${w.employeeId}`,
      kind: "expense",
      tag: "Utlägg",
      title: `${name}: ${w.count === 1 ? "ett utlägg väntar" : `${w.count} utlägg väntar`} på godkännande`,
      meta: `Inskickat ${w.oldest}; godkända betalas med nästa lönekörning`,
      href: `/admin/personal/${w.employeeId}?flik=utlagg`,
      weight: 5,
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
