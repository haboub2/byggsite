/**
 * Försäkringskassan reminders on Idag (docs/hr-lon.md, section 8). Pure;
 * lib/admin/today.ts reads the absences.
 *
 * - Sjukanmälan: when a sick period goes on past the sjuklöneperiod (day 1
 *   and the following thirteen calendar days of the period, 7 §), the
 *   employer must report it to Försäkringskassan within seven calendar
 *   days (sjuklönelagen 12 §; a fine under 19 § otherwise). Days are counted
 *   in the period's spells, återinsjuknande included, as certificatesDue()
 *   counts the läkarintyg day.
 * - VAB and föräldraledighet: Försäkringskassan pays, the employee applies;
 *   the row reminds that the pay deduction follows and that Försäkringskassan
 *   may ask the employer to confirm the absence. Shown for a period started
 *   in the last `recentDays`.
 */

import { eachDay, addDays, daysBetween, type IsoDate } from "../rules/index";
import { AUTHORITY_RULES } from "../rules/authorities";
import { lastDay, linkSickPeriods, sickRules, type Absence } from "../hr/absence";

export type FkReminder = {
  id: string;
  kind: "sick-report" | "vab" | "parental";
  employeeId: string;
  /** The sick period's first day, or the VAB/parental absence's first day. */
  from: IsoDate;
  /** Sjukanmälan: the day the period passed the sjuklöneperiod (day 15). */
  dueFrom: IsoDate | null;
  /** Sjukanmälan: the last day to report (day 14 + 7). */
  dueBy: IsoDate | null;
  absenceIds: string[];
};

export function fkReminders(absences: readonly Absence[], asOf: IsoDate, options: { recentDays?: number } = {}): FkReminder[] {
  const rules = AUTHORITY_RULES.forsakringskassan;
  const recent = options.recentDays ?? rules.leaveReminderDays;
  const out: FkReminder[] = [];
  const sickByPerson = new Map<string, Absence[]>();
  for (const a of absences) {
    if (a.kind === "sjuk") sickByPerson.set(a.employeeId, [...(sickByPerson.get(a.employeeId) ?? []), a]);
    else if ((a.kind === "vab" || a.kind === "foraldraledig") && a.from <= asOf && daysBetween(a.from, asOf) <= recent) {
      out.push({ id: `fk-${a.kind}-${a.id}`, kind: a.kind === "vab" ? "vab" : "parental", employeeId: a.employeeId, from: a.from, dueFrom: null, dueBy: null, absenceIds: [a.id] });
    }
  }
  for (const [employeeId, list] of sickByPerson) {
    const sick = sickRules(list[0].from).sickPay;
    for (const p of linkSickPeriods(list, sick.relapseDays)) {
      const spells = list.filter((a) => p.absenceIds.includes(a.id)).sort((a, b) => a.from.localeCompare(b.from));
      // The calendar day that is day employerDays + 1 of the period.
      let n = 0;
      let dueFrom: IsoDate | null = null;
      for (const s of spells) {
        for (const d of eachDay(s.from, lastDay(s, asOf))) {
          if (d > asOf) break;
          if (++n === sick.employerDays + 1) dueFrom = d;
        }
      }
      if (!dueFrom) continue;
      const dueBy = addDays(addDays(dueFrom, -1), rules.sickReportWithinDays);
      // Long past the deadline the row has done its job; the period stays on Person › Frånvaro.
      if (daysBetween(dueBy, asOf) > rules.sickReportShowAfterDays) continue;
      out.push({ id: `fk-sick-${employeeId}-${p.firstDay}`, kind: "sick-report", employeeId, from: p.firstDay, dueFrom, dueBy, absenceIds: p.absenceIds });
    }
  }
  return out.sort((a, b) => (a.dueBy ?? "9999").localeCompare(b.dueBy ?? "9999") || a.from.localeCompare(b.from));
}
