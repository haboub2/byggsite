/**
 * Sjuklön (docs/hr-lon.md, section 5 step 2; lag (1991:1047) om sjuklön).
 * Sick spells are grouped into sick periods (a spell starting within the
 * rule book's `relapseDays` after the last one ended continues it, 7 § 3
 * st), each calendar day of a period gets its day number, and the employer
 * pays `percent` of the lost pay for the scheduled hours on days 1–14 (6 §,
 * 7 §). One karensavdrag per period of 20 % of an average week's sjuklön
 * (6 § 2 st), at most the period's sjuklön, and none once ten have been
 * made in the last twelve months (6 § 3 st).
 *
 * `sickPayCostOre` is sjuklön after karensavdrag. The AGI no longer asks
 * for it (ruta 499 was used for periods 2018-07 to 2024-06); it stays as a
 * cost figure for reports.
 *
 * The lost pay of an hour is the caller's: timlön, or for månadslön the
 * agreement's hourly figure (månadslön × 12 / (52 × veckoarbetstid)), in
 * which case the hours are also deducted from the salary (`monthlySalary`).
 */

import { fractionOf, lineAmount, rateOf, sumOre, type Ore } from "../money";
import { addDays, daysBetween, type IsoDate } from "../rules/index";
import type { PayrollRuleSet } from "../rules/payroll";
import { holidayName, isoWeekday } from "../../workdays";
import { addMonths } from "./employment-clocks";
import type { PayLineInput } from "./payslip";

/** A reported sickness, calendar days inclusive. */
export type SickSpell = { from: IsoDate; to: IsoDate };

/** Hours the person would have worked: a weekly pattern (Mon–Sun) or booked shifts per date. */
export type WorkSchedule =
  | { kind: "weekly"; hours: readonly [number, number, number, number, number, number, number]; holidaysOff: boolean }
  | { kind: "shifts"; hours: Readonly<Record<IsoDate, number>> };

export function scheduledHours(schedule: WorkSchedule, date: IsoDate): number {
  if (schedule.kind === "shifts") return schedule.hours[date] ?? 0;
  if (schedule.holidaysOff && holidayName(date)) return 0;
  return schedule.hours[isoWeekday(date) - 1];
}

/** Hours per week in a weekly pattern. */
export const weeklyHours = (schedule: Extract<WorkSchedule, { kind: "weekly" }>) => schedule.hours.reduce((a, b) => a + b, 0);

/**
 * Average week for someone without a fixed schedule (behovsanställda): hours
 * worked in a window (normally the last three months) per seven days.
 */
export function averageWeeklyHoursFromHistory(hoursWorked: number, from: IsoDate, to: IsoDate): number {
  const days = daysBetween(from, to) + 1;
  if (days <= 0) throw new RangeError("Perioden för genomsnittsveckan måste vara minst en dag.");
  return Math.round(((hoursWorked * 7) / days) * 100) / 100;
}

export type SickDay = {
  date: IsoDate;
  /** Calendar day of the sick period, 1 = first. */
  dayNo: number;
  lostHours: number;
  /** Paid by us (days 1–14); later days are Försäkringskassan's. */
  employerDay: boolean;
};

export type SickPeriod = {
  firstDay: IsoDate;
  lastDay: IsoDate;
  continuesPrevious: boolean;
  days: SickDay[];
  sickPayHours: number;
  sickPayOre: Ore;
  /** Karensavdrag made in this period (positive), 0 when none. */
  waitingDeductionOre: Ore;
  /** Why there is no karensavdrag, if there is none. */
  noWaitingDeduction: null | "continuation" | "ten-in-twelve-months";
  /** The date a läkarintyg is needed from (day 8), null if the period is shorter. */
  certificateFrom: IsoDate | null;
  /** First day Försäkringskassan pays (day 15), null if the period is shorter. */
  insuranceFrom: IsoDate | null;
};

export type SickPayInput = {
  rules: PayrollRuleSet;
  spells: readonly SickSpell[];
  schedule: WorkSchedule;
  /** Lost pay per hour, öre. */
  hourlyPayOre: Ore;
  /** Average weekly working hours, for the karensavdrag. */
  averageWeeklyHours: number;
  /** Månadslön: deduct the lost hours from the salary as well. */
  monthlySalary: boolean;
  /** Dates of karensavdrag already made (earlier runs), for the ten-in-twelve-months rule. */
  previousWaitingDeductions: readonly IsoDate[];
  /** The last sick period before these spells, if it may continue into them. */
  previousPeriod?: { lastDay: IsoDate; days: number; waitingDeductionLeftOre: Ore };
  codes: { sickPay: string; waitingDeduction: string; sickDeduction: string };
};

export type SickPayResult = {
  periods: SickPeriod[];
  lines: PayLineInput[];
  /** Sjuklön after karensavdrag (sjuklönekostnad). */
  sickPayCostOre: Ore;
  /** Dates of the karensavdrag made here, to store for the next run. */
  waitingDeductionDates: IsoDate[];
};

export function sickPay(input: SickPayInput): SickPayResult {
  const { rules, schedule } = input;
  const s = rules.sickPay;
  const spells = [...input.spells].sort((a, b) => a.from.localeCompare(b.from));
  const periods: SickPeriod[] = [];
  const deductionDates = [...input.previousWaitingDeductions];
  const made: IsoDate[] = [];
  const unitSickPay = rateOf(input.hourlyPayOre, s.percent);
  const weekSickPay = lineAmount(unitSickPay, input.averageWeeklyHours);
  const fullWaitingDeduction = rateOf(weekSickPay, s.waitingDeductionPercentOfWeek);

  let prev: { lastDay: IsoDate; days: number; waitingLeft: Ore } | null = input.previousPeriod
    ? { lastDay: input.previousPeriod.lastDay, days: input.previousPeriod.days, waitingLeft: input.previousPeriod.waitingDeductionLeftOre }
    : null;

  for (const spell of spells) {
    if (spell.to < spell.from) throw new RangeError(`Sjukperioden ${spell.from}–${spell.to} slutar före start.`);
    // Återinsjuknande: a spell starting at most relapseDays calendar days
    // after the last sick day (ended the 10th, sick again by the 15th) continues the period.
    const continues = prev !== null && spell.from > prev.lastDay && daysBetween(prev.lastDay, spell.from) <= s.relapseDays;
    const startNo = continues && prev ? prev.days : 0;
    const days: SickDay[] = [];
    for (let d = spell.from, i = 1; d <= spell.to; d = addDays(d, 1), i++) {
      const dayNo = startNo + i;
      days.push({ date: d, dayNo, lostHours: scheduledHours(schedule, d), employerDay: dayNo <= s.employerDays });
    }
    const sickPayHours = days.filter((d) => d.employerDay).reduce((a, d) => a + d.lostHours, 0);
    const sickPayOre = lineAmount(unitSickPay, sickPayHours);

    let waitingDeductionOre = 0;
    let noWaitingDeduction: SickPeriod["noWaitingDeduction"] = null;
    let waitingLeft = 0;
    if (continues && prev) {
      waitingDeductionOre = Math.min(prev.waitingLeft, sickPayOre);
      waitingLeft = prev.waitingLeft - waitingDeductionOre;
      if (!waitingDeductionOre) noWaitingDeduction = "continuation";
    } else {
      const windowFrom = addMonths(spell.from, -s.waitingDeductionWindowMonths);
      const inWindow = deductionDates.filter((d) => d >= windowFrom && d < spell.from).length;
      if (inWindow >= s.maxWaitingDeductions) noWaitingDeduction = "ten-in-twelve-months";
      else {
        waitingDeductionOre = Math.min(fullWaitingDeduction, sickPayOre);
        waitingLeft = fullWaitingDeduction - waitingDeductionOre;
        // A period without sjuklön (sick only on days off) makes no karensavdrag to count.
        if (waitingDeductionOre) {
          deductionDates.push(spell.from);
          made.push(spell.from);
        }
      }
    }

    const dayAt = (n: number) => (n > startNo && n <= startNo + days.length ? days[n - startNo - 1].date : null);
    const period: SickPeriod = {
      firstDay: continues && periods.length ? periods[periods.length - 1].firstDay : spell.from,
      lastDay: spell.to,
      continuesPrevious: continues,
      days,
      sickPayHours,
      sickPayOre,
      waitingDeductionOre,
      noWaitingDeduction,
      certificateFrom: dayAt(s.certificateFromDay),
      insuranceFrom: dayAt(s.employerDays + 1),
    };
    periods.push(period);
    prev = { lastDay: spell.to, days: startNo + days.length, waitingLeft };
  }

  const lines: PayLineInput[] = [];
  for (const p of periods) {
    const from = p.days[0].date;
    const to = p.days[p.days.length - 1].date;
    const lostHours = p.days.reduce((a, d) => a + d.lostHours, 0);
    if (input.monthlySalary && lostHours > 0) {
      lines.push({ code: input.codes.sickDeduction, text: `Sjukavdrag ${from}–${to}`, quantity: lostHours, unit: "h", unitPriceOre: -input.hourlyPayOre, basisOre: null, ratePercent: null, amountOre: -lineAmount(input.hourlyPayOre, lostHours), from, to });
    }
    if (p.sickPayOre) {
      lines.push({ code: input.codes.sickPay, text: `Sjuklön ${s.percent} % ${from}–${to}`, quantity: p.sickPayHours, unit: "h", unitPriceOre: unitSickPay, basisOre: input.hourlyPayOre, ratePercent: s.percent, amountOre: p.sickPayOre, from, to });
    }
    if (p.waitingDeductionOre) {
      lines.push({ code: input.codes.waitingDeduction, text: `Karensavdrag ${s.waitingDeductionPercentOfWeek} % av veckosjuklön`, quantity: null, unit: null, unitPriceOre: null, basisOre: weekSickPay, ratePercent: s.waitingDeductionPercentOfWeek, amountOre: -p.waitingDeductionOre, from, to });
    }
  }
  return {
    periods,
    lines,
    sickPayCostOre: sumOre(periods.map((p) => p.sickPayOre - p.waitingDeductionOre)),
    waitingDeductionDates: made,
  };
}

/** Hourly lost pay for månadslön, the agreements' formula: månadslön × 12 / (52 × veckoarbetstid). */
export function monthlyToHourlyOre(monthlySalaryOre: Ore, weeklyHoursValue: number): Ore {
  return fractionOf(monthlySalaryOre, 1_200, Math.round(5_200 * weeklyHoursValue));
}
