/**
 * Semester balances per semesterår (docs/hr-lon.md, section 3
 * "leave_balances"; semesterlagen 3, 7, 17, 17 a and 18 §§). Pure: from the
 * contracts, the absences and the row's stored model (when the year starts,
 * and whether days are earned the year before or the same year), every
 * semesterår from the first contract to `asOf` gets the paid days earned
 * (paidDaysEarned), the days taken (semester absences on scheduled days)
 * and the days saved to later years (savableDays). The store writes them to
 * leave_balances; the semesterlöneskuld in öre is the payroll run's
 * (phase 3).
 */

import { addDays, type IsoDate } from "../rules/index";
import { paidDaysEarned, qualifyingAbsence, savableDays, vacationYear, vacationYears, type VacationYearModel } from "../payroll/vacation";
import type { WorkSchedule } from "../payroll/sick-pay";
import { absenceWorkdays, sickRules, wholeDaysAbsent, type Absence } from "./absence";
import type { EmploymentVersion } from "./schema";

export type VacationBalance = {
  /** The semesterår. */
  yearFrom: IsoDate;
  yearTo: IsoDate;
  /** The intjänandeår that paid for it. */
  earnedFrom: IsoDate;
  earnedTo: IsoDate;
  /** Paid days earned for this year. */
  earnedDays: number;
  /** Semester taken in this year (scheduled days × extent). */
  takenDays: number;
  /** Of the taken days, how many came from saved days. */
  takenFromSavedDays: number;
  /** Saved days brought in from earlier years and still valid. */
  savedInDays: number;
  /** Days of this year's paid days saved to later years (only once the year has ended). */
  savedDays: number;
  /** Paid days left to take this year: earned + saved in − taken. */
  remainingDays: number;
  /** The year has not ended on asOf. */
  current: boolean;
};

export type BalancesInput = {
  model: VacationYearModel;
  /** The person's employment versions (any contract); those with vacation rule "none" are left out. */
  versions: readonly EmploymentVersion[];
  /** The person's absences. */
  absences: readonly Absence[];
  /** Working days for counting semester taken; null: Monday–Friday without helgdagar. */
  schedule: WorkSchedule | null;
  asOf: IsoDate;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The employment span: the first start and the last end (null while employed) of the contracts that give semester. */
function employmentSpan(versions: readonly EmploymentVersion[]): { from: IsoDate; to: IsoDate | null; daysPerYear: number } | null {
  const v = versions.filter((x) => x.vacationRule !== "none" && !(x.validTo !== null && x.validTo < x.validFrom));
  if (!v.length) return null;
  const from = v.reduce((m, x) => (x.startsOn < m ? x.startsOn : m), v[0].startsOn);
  const to = v.some((x) => x.endsOn === null) ? null : v.reduce((m, x) => ((x.endsOn as IsoDate) > m ? (x.endsOn as IsoDate) : m), v[0].endsOn as IsoDate);
  const latest = [...v].sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.version - a.version)[0];
  return { from, to, daysPerYear: latest.vacationDays };
}

/**
 * Semester per semesterår, oldest first. Saved days are used before the
 * year's own once its own are gone (the employee may take saved days in any
 * year, 18 §); a year in which saved days were taken saves none.
 */
export function vacationBalances(input: BalancesInput): VacationBalance[] {
  const span = employmentSpan(input.versions);
  if (!span) return [];
  const { model, asOf } = input;
  const out: VacationBalance[] = [];
  const saved: { earnedIn: IsoDate; days: number }[] = [];
  const last = vacationYear(span.to && span.to < asOf ? span.to : asOf, model.startMonthDay);
  for (let year = vacationYear(span.from, model.startMonthDay); year.from <= last.from; year = vacationYear(addDays(year.to, 1), model.startMonthDay)) {
    const rules = sickRules(year.from);
    const earning = vacationYears(year.from, model).paidBy;
    const range = { from: earning.from, to: earning.to };
    // Wholly absent days in the intjänandeår: sick and parental count up to their caps (17, 17 a §§), unpaid leave never.
    let sick = 0;
    let parental = 0;
    let unpaid = 0;
    for (const a of input.absences) {
      const n = wholeDaysAbsent(a, range, asOf);
      if (a.kind === "sjuk") sick += n;
      else if (a.kind === "foraldraledig" || a.kind === "vab") parental += n;
      else if (a.kind === "tjanstledig") unpaid += n;
    }
    const { nonQualifyingDays } = qualifyingAbsence(rules, { sick, parental, unpaid });
    const earnedDays = paidDaysEarned({
      rules,
      yearFrom: earning.from,
      yearTo: earning.to,
      employedFrom: span.from,
      employedTo: span.to,
      nonQualifyingDays,
      daysPerYear: span.daysPerYear,
    }).paidDays + 0;

    const takenDays = round2(input.absences.filter((a) => a.kind === "semester").reduce((s, a) => s + absenceWorkdays(a, year, input.schedule, asOf), 0));
    // Saved days still valid this year (at most maxSavedYears old).
    const valid = saved.filter((s) => s.days > 0 && Number(year.from.slice(0, 4)) - Number(s.earnedIn.slice(0, 4)) <= rules.vacation.maxSavedYears);
    const savedInDays = round2(valid.reduce((s, x) => s + x.days, 0));
    const overflow = Math.max(0, round2(takenDays - earnedDays));
    let takenFromSavedDays = 0;
    for (const s of valid.sort((a, b) => a.earnedIn.localeCompare(b.earnedIn))) {
      const use = Math.min(s.days, overflow - takenFromSavedDays);
      s.days = round2(s.days - use);
      takenFromSavedDays = round2(takenFromSavedDays + use);
    }
    const current = year.to >= asOf;
    const savedDays = current ? 0 : savableDays(rules, earnedDays, Math.min(takenDays, earnedDays), { savedDaysTakenThisYear: takenFromSavedDays });
    if (savedDays > 0) saved.push({ earnedIn: year.from, days: savedDays });
    out.push({
      yearFrom: year.from,
      yearTo: year.to,
      earnedFrom: earning.from,
      earnedTo: earning.to,
      earnedDays,
      takenDays,
      takenFromSavedDays,
      savedInDays,
      savedDays,
      remainingDays: round2(earnedDays + savedInDays - takenDays),
      current,
    });
  }
  return out;
}
