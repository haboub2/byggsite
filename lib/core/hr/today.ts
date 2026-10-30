/**
 * The personnel rows on Idag (docs/hr-lon.md, section 11): LAS clocks that
 * convert within 30 days, provanställningar ending within 14 days (the
 * notice must be given two weeks before), and contracts that end within
 * 30 days. Pure; lib/admin/today.ts turns them into to-do rows.
 */

import { addDays, daysBetween, type IsoDate } from "../rules/index";
import type { ClockRow } from "./clocks";
import { FORM_SHORT, latestVersions, type Employee, type EmploymentVersion } from "./schema";

export const CLOCK_WARN_DAYS = 30;
export const PROBATION_WARN_DAYS = 14;
export const CONTRACT_END_WARN_DAYS = 30;

export type HrTodo = {
  id: string;
  kind: "clock" | "probation" | "contract-end";
  employeeId: string;
  tag: string;
  title: string;
  meta: string;
  /** Days until it happens; sorts the rows. */
  days: number;
};

const inDays = (n: number) => (n <= 0 ? "i dag" : n === 1 ? "i morgon" : `om ${n} dagar`);

export function hrTodos(input: { employees: readonly Employee[]; versions: readonly EmploymentVersion[]; clocks: ReadonlyMap<string, ClockRow>; today: IsoDate }): HrTodo[] {
  const { employees, versions, clocks, today } = input;
  const todos: HrTodo[] = [];
  for (const e of employees) {
    if (e.endedAt) continue;
    const c = clocks.get(e.id);
    if (c) {
      for (const [kind, name, days, limit, on, converted] of [
        ["sava", "SÄVA", c.sava_days, c.sava_limit, c.sava_converts_on, c.sava_converted],
        ["vikariat", "Vikariatet", c.vikariat_days, c.vikariat_limit, c.vikariat_converts_on, c.vikariat_converted],
      ] as const) {
        if (!on || converted) continue;
        const until = daysBetween(today, on);
        if (until < 0 || until > CLOCK_WARN_DAYS) continue;
        todos.push({
          id: `clock-${kind}-${e.id}`,
          kind: "clock",
          employeeId: e.id,
          tag: "LAS",
          title: `${e.name}: ${name} blir tillsvidare ${on}`,
          meta: `${days} av ${limit} dagar räknade · ${inDays(until)}. Avsluta i tid eller erbjud tillsvidare.`,
          days: until,
        });
      }
      if (c.probation_ends_on && c.probation_notice_by && c.probation_days_left !== null && c.probation_days_left <= PROBATION_WARN_DAYS) {
        const noticeIn = daysBetween(today, c.probation_notice_by);
        todos.push({
          id: `probation-${e.id}`,
          kind: "probation",
          employeeId: e.id,
          tag: "Provanställning",
          title: `${e.name}: provanställningen slutar ${c.probation_ends_on}`,
          meta:
            noticeIn >= 0
              ? `Besked senast ${c.probation_notice_by} (${inDays(noticeIn)}) om den inte ska fortsätta; annars tillsvidare ${c.probation_converts_on}.`
              : `Sista dag för besked var ${c.probation_notice_by}; blir tillsvidare ${c.probation_converts_on}.`,
          days: c.probation_days_left,
        });
      }
    }
    for (const v of latestVersions(versions.filter((x) => x.employeeId === e.id))) {
      if (!v.endsOn || v.endsOn < today || v.endsOn > addDays(today, CONTRACT_END_WARN_DAYS)) continue;
      const until = daysBetween(today, v.endsOn);
      todos.push({
        id: `end-${v.contractId}`,
        kind: "contract-end",
        employeeId: e.id,
        tag: "Avtal slutar",
        title: `${e.name}: ${FORM_SHORT[v.form].toLowerCase()} slutar ${v.endsOn}`,
        meta: `${inDays(until)}. Förläng med en ny version, eller låt det löpa ut.`,
        days: until,
      });
    }
  }
  return todos.sort((a, b) => a.days - b.days);
}
