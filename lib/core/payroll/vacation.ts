/**
 * Semester (docs/hr-lon.md, section 4 "Semester"; semesterlagen
 * (1977:480)). Paid days earned in an intjänandeår, semesterlön by
 * procentregeln or sammalöneregeln, semesterersättning (at termination,
 * or per month for SÄVA and timlön), saved days, and the
 * semesterlöneskuld the balance sheet carries.
 *
 * The intjänandeår and the semesterår are the same year by default
 * (1 April–31 March, `vacation.yearStartMonthDay`), or a calendar year by
 * setting.
 */

import { fractionOf, lineAmount, rateOf, sumOre, type Ore } from "../money";
import { addDays, daysBetween, type IsoDate } from "../rules/index";
import type { PayrollRuleSet } from "../rules/payroll";

/** The vacation year that holds `date`, for a start like "04-01". */
export function vacationYear(date: IsoDate, startMonthDay: string): { from: IsoDate; to: IsoDate } {
  const year = Number(date.slice(0, 4));
  const startThisYear = `${year}-${startMonthDay}`;
  const from = date >= startThisYear ? startThisYear : `${year - 1}-${startMonthDay}`;
  const to = addDays(`${Number(from.slice(0, 4)) + 1}-${startMonthDay}`, -1);
  return { from, to };
}

export type AbsenceDays = {
  /** Sick days in the intjänandeår (calendar days with sjuklön or sjukpenning). */
  sick: number;
  /** Föräldraledighet and tillfällig föräldrapenning days. */
  parental: number;
  /** Ensamstående förälder: the higher cap for parental days. */
  singleParent?: boolean;
  /** Absence that never counts (tjänstledighet, unpaid leave). */
  unpaid: number;
};

/** Split absence into semesterlönegrundande days (up to the caps) and the rest. */
export function qualifyingAbsence(rules: PayrollRuleSet, absence: AbsenceDays): { qualifyingDays: number; nonQualifyingDays: number } {
  const v = rules.vacation;
  const parentalCap = absence.singleParent ? v.parentalCountedDaysSingle : v.parentalCountedDays;
  const sickQ = Math.min(absence.sick, v.sickCountedDays);
  const parentalQ = Math.min(absence.parental, parentalCap);
  return {
    qualifyingDays: sickQ + parentalQ,
    nonQualifyingDays: absence.sick - sickQ + (absence.parental - parentalQ) + absence.unpaid,
  };
}

export type EarnedDaysInput = {
  rules: PayrollRuleSet;
  /** The intjänandeår. */
  yearFrom: IsoDate;
  yearTo: IsoDate;
  employedFrom: IsoDate;
  /** Null while employed. */
  employedTo: IsoDate | null;
  /** Days in the year's employment that are not semesterlönegrundande. */
  nonQualifyingDays: number;
  /** Agreed days per year if more than the law's 25. */
  daysPerYear?: number;
};

/**
 * Paid vacation days earned (7 §): the employment days of the intjänandeår
 * less the days wholly absent without semesterlönegrundande reason, divided
 * by the days of the intjänandeår, times 25, "avrundas ... till närmast
 * högre hela tal".
 */
export function paidDaysEarned(input: EarnedDaysInput): { paidDays: number; employmentDays: number; qualifyingDays: number; yearDays: number } {
  const perYear = input.daysPerYear ?? input.rules.vacation.daysPerYear;
  const yearDays = daysBetween(input.yearFrom, input.yearTo) + 1;
  const from = input.employedFrom > input.yearFrom ? input.employedFrom : input.yearFrom;
  const to = input.employedTo && input.employedTo < input.yearTo ? input.employedTo : input.yearTo;
  const employmentDays = to < from ? 0 : daysBetween(from, to) + 1;
  const qualifyingDays = Math.max(0, employmentDays - input.nonQualifyingDays);
  // Integer arithmetic so 25 × 365 / 365 is exactly 25.
  const paidDays = Math.ceil((perYear * qualifyingDays) / yearDays - 1e-9);
  return { paidDays, employmentDays, qualifyingDays, yearDays };
}

/**
 * Procentregeln (16 b §): semesterlön is `percent` of the semesterlönegrundande
 * pay in the intjänandeår, including what the person would have earned during
 * semesterlönegrundande absence. Per paid day: the total divided by the paid days.
 */
export function percentRuleVacationPay(basisOre: Ore, absenceImputedOre: Ore, percent: number, paidDays: number): { totalOre: Ore; perDayOre: Ore } {
  const totalOre = rateOf(basisOre + absenceImputedOre, percent);
  return { totalOre, perDayOre: paidDays > 0 ? fractionOf(totalOre, 1, paidDays) : 0 };
}

/**
 * Sammalöneregeln (16 a §): the monthly salary continues during vacation,
 * plus a semestertillägg per paid day taken, plus vacation pay on the
 * variable pay of the intjänandeår: the law's 12 % in total (paid within a
 * month after the semesterår), or an agreement's percent per paid day.
 */
export function sameSalaryVacationPay(input: {
  monthlySalaryOre: Ore;
  daysTaken: number;
  dailySupplementPercent: number;
  variablePayOre: Ore;
  variable: { mode: "total" | "perDay"; percent: number };
}): { supplementOre: Ore; variableOre: Ore } {
  const supplementOre = lineAmount(rateOf(input.monthlySalaryOre, input.dailySupplementPercent), input.daysTaken);
  const variableOre =
    input.variable.mode === "total"
      ? rateOf(input.variablePayOre, input.variable.percent)
      : lineAmount(rateOf(input.variablePayOre, input.variable.percent), input.daysTaken);
  return { supplementOre, variableOre };
}

/**
 * The value of one vacation day on monthly salary under an agreement
 * (4,6 % of månadslön + the daily semestertillägg): semesterersättning per
 * untaken day and the deduction per unpaid vacation day.
 */
export function monthlyVacationDayValue(monthlySalaryOre: Ore, dayValuePercent: number, dailySupplementPercent: number): Ore {
  return rateOf(monthlySalaryOre, dayValuePercent) + rateOf(monthlySalaryOre, dailySupplementPercent);
}

/** Semesterersättning per month for SÄVA and timlön: `percent` of the month's semesterlönegrundande pay. */
export function monthlyVacationCompensation(monthBasisOre: Ore, percent: number): Ore {
  return rateOf(monthBasisOre, percent);
}

/** Semesterersättning at termination: the unused paid days at the value of a day. */
export function terminationCompensation(unusedPaidDays: number, perDayOre: Ore): Ore {
  return lineAmount(perDayOre, unusedPaidDays);
}

export type SavedDays = { earnedIn: string; days: number };

/**
 * Days that may be saved from a year (18 §): only paid days above 20, only
 * those not taken, and none in a year when saved days are taken. Saved days
 * must be used within `maxSavedYears` after the semesterår they come from.
 */
export function savableDays(rules: PayrollRuleSet, paidDays: number, daysTaken: number, options: { savedDaysTakenThisYear?: number } = {}): number {
  if ((options.savedDaysTakenThisYear ?? 0) > 0) return 0;
  const above = Math.max(0, paidDays - rules.vacation.minDaysTakenPerYear);
  return Math.max(0, Math.min(above, paidDays - daysTaken));
}

/** Saved days still valid in the semesterår starting `yearFrom` (saved in an earlier year, at most maxSavedYears ago). */
export function validSavedDays(rules: PayrollRuleSet, saved: readonly SavedDays[], yearFrom: IsoDate): SavedDays[] {
  const year = Number(yearFrom.slice(0, 4));
  return saved.filter((s) => {
    const y = Number(s.earnedIn.slice(0, 4));
    return y < year && year - y <= rules.vacation.maxSavedYears;
  });
}

/**
 * Semesterlöneskuld: what we owe for earned, unpaid vacation. Unused paid
 * days (current and saved) at their day value, plus procentregeln vacation
 * pay accrued on this year's pay so far that has not been paid out.
 * Arbetsgivaravgifter on the debt are added by the caller at the
 * employee's rate.
 */
export function vacationLiability(input: { unusedDays: number; perDayOre: Ore; accruedPercentPayOre?: Ore; paidOutOre?: Ore }): Ore {
  return sumOre([lineAmount(input.perDayOre, input.unusedDays), input.accruedPercentPayOre ?? 0, -(input.paidOutOre ?? 0)]);
}
