/**
 * Årsskiftet (docs/hr-lon.md, section 12 phase 4): the semester transition
 * and the year summary per person. Pure; authorities-store.ts reads the
 * data and the database's year_close() stores the result once.
 *
 * Semester: the semesterår that ends in the calendar year (31 March under
 * the law's model, 31 December under a calendar-year model) is closed with
 * vacationBalances() as of the first day of the next one. The closing row
 * keeps earned, taken and the days saved to later years (18 §: only days
 * above 20, only untaken, none in a year when saved days were taken); the
 * opening row is the new year's earned days and the saved days still
 * valid; saved days older than five years that were never taken expire
 * and are reported. Own days neither taken nor saved lapse.
 *
 * Year summary: per person, from the approved payslips of runs with pay
 * day in the year (kontrolluppgifter are gone since the AGI; this is the
 * employer's and the employee's own overview): cash gross, benefits,
 * tax-free reimbursements, tax, net and the arbetsgivaravgifter in öre as
 * the payslips carry them, and salary paid back for months of the year
 * (återkrav), which the AGI reports as lower pay.
 */

import { sumOre, type Ore } from "../money";
import { addDays, type IsoDate } from "../rules/index";
import type { WorkSchedule } from "./sick-pay";
import { vacationYear, type VacationYearModel } from "./vacation";
import { vacationBalances, type VacationBalance } from "../hr/balances";
import type { Absence } from "../hr/absence";
import type { EmploymentVersion } from "../hr/schema";
import type { PayslipDocument } from "./payslip";

/** The semesterår that ends in calendar year `year` under the model. */
export function semesterYearEndingIn(year: number, model: Pick<VacationYearModel, "startMonthDay">): { from: IsoDate; to: IsoDate } {
  let end = addDays(`${year}-${model.startMonthDay}`, -1);
  if (!end.startsWith(String(year))) end = addDays(`${year + 1}-${model.startMonthDay}`, -1);
  return vacationYear(end, model.startMonthDay);
}

export type TransitionPerson = {
  employeeId: string;
  name: string;
  versions: readonly EmploymentVersion[];
  absences: readonly Absence[];
  schedule: WorkSchedule | null;
};

export type SemesterTransitionRow = {
  employeeId: string;
  name: string;
  closing: { yearFrom: IsoDate; yearTo: IsoDate; earnedDays: number; takenDays: number; takenFromSavedDays: number; savedInDays: number; savedDays: number };
  /** The new semesterår; null when the person has no employment in it. */
  opening: { yearFrom: IsoDate; yearTo: IsoDate; earnedDays: number; savedInDays: number } | null;
  /** Saved days from earlier years that were not taken and are now too old. */
  expiredDays: number;
  /** The closed year's own days neither taken nor saved. */
  lapsedDays: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function semesterTransition(input: { year: number; model: VacationYearModel; people: readonly TransitionPerson[] }): { closing: { from: IsoDate; to: IsoDate }; opening: { from: IsoDate; to: IsoDate }; rows: SemesterTransitionRow[] } {
  const closing = semesterYearEndingIn(input.year, input.model);
  const opening = vacationYear(addDays(closing.to, 1), input.model.startMonthDay);
  const rows: SemesterTransitionRow[] = [];
  for (const p of input.people) {
    const balances = vacationBalances({ model: input.model, versions: p.versions, absences: p.absences, schedule: p.schedule, asOf: opening.from });
    const c = balances.find((b) => b.yearFrom === closing.from);
    if (!c) continue;
    const o: VacationBalance | undefined = balances.find((b) => b.yearFrom === opening.from);
    const ownTaken = round2(c.takenDays - c.takenFromSavedDays);
    rows.push({
      employeeId: p.employeeId,
      name: p.name,
      closing: { yearFrom: c.yearFrom, yearTo: c.yearTo, earnedDays: c.earnedDays, takenDays: c.takenDays, takenFromSavedDays: c.takenFromSavedDays, savedInDays: c.savedInDays, savedDays: c.savedDays },
      opening: o ? { yearFrom: o.yearFrom, yearTo: o.yearTo, earnedDays: o.earnedDays, savedInDays: o.savedInDays } : null,
      expiredDays: o ? Math.max(0, round2(c.savedInDays - c.takenFromSavedDays + c.savedDays - o.savedInDays)) : 0,
      lapsedDays: Math.max(0, round2(c.earnedDays - ownTaken - c.savedDays)),
    });
  }
  return { closing, opening, rows: rows.sort((a, b) => a.name.localeCompare(b.name, "sv")) };
}

export type YearSummarySlip = { employeeId: string; number: number | null; document: PayslipDocument; employerContributionOre: Ore };

export type YearSummaryRow = {
  employeeId: string;
  name: string;
  payslips: number;
  cashGrossOre: Ore;
  benefitOre: Ore;
  taxFreeReimbursementOre: Ore;
  taxOre: Ore;
  netOre: Ore;
  employerContributionOre: Ore;
  /** Salary paid back for months of the year; the AGI's cash pay is cashGrossOre − repaidOre. */
  repaidOre: Ore;
  /** First and last pay day of the year. */
  firstPayDate: IsoDate;
  lastPayDate: IsoDate;
};

/** The year's approved payslips summed per person (pass only payslips of closed runs with pay day in the year, and the year's repayments). */
export function yearSummary(slips: readonly YearSummarySlip[], repayments: readonly { employeeId: string; amountOre: Ore }[] = []): YearSummaryRow[] {
  const by = new Map<string, YearSummarySlip[]>();
  for (const s of slips) by.set(s.employeeId, [...(by.get(s.employeeId) ?? []), s]);
  const rows: YearSummaryRow[] = [];
  for (const [employeeId, list] of by) {
    const sum = (pick: (s: YearSummarySlip) => Ore) => sumOre(list.map(pick));
    const days = list.map((s) => s.document.payDate).sort();
    rows.push({
      employeeId,
      name: list[list.length - 1].document.employeeName,
      payslips: list.length,
      cashGrossOre: sum((s) => s.document.totals.cashGrossOre),
      benefitOre: sum((s) => s.document.totals.benefitOre),
      taxFreeReimbursementOre: sum((s) => s.document.totals.taxFreeReimbursementOre),
      taxOre: sum((s) => s.document.totals.taxOre),
      netOre: sum((s) => s.document.totals.netOre),
      employerContributionOre: sum((s) => s.employerContributionOre),
      repaidOre: sumOre(repayments.filter((r) => r.employeeId === employeeId).map((r) => r.amountOre)),
      firstPayDate: days[0],
      lastPayDate: days[days.length - 1],
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name, "sv"));
}
