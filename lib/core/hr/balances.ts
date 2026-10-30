/**
 * Semester balances per semesterår (docs/hr-lon.md, section 3
 * "leave_balances"; semesterlagen 3, 7, 17, 17 a and 18 §§). Pure: from the
 * contracts, the absences and the row's stored model (when the year starts,
 * and whether days are earned the year before or the same year), every
 * semesterår from the first contract to `asOf` gets the paid days earned
 * (paidDaysEarned, on the days actually employed: gaps between contracts
 * do not earn), the days taken (semester absences on scheduled days)
 * and the days saved to later years (savableDays). The store writes them to
 * leave_balances; the semesterlöneskuld in öre is the payroll run's
 * (phase 3).
 */

import { addDays, daysBetween, type IsoDate } from "../rules/index";
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

/**
 * The days employed, as merged intervals: each version from max(start,
 * valid from) to min(end, valid to) (null while it runs), overlapping or
 * touching intervals joined. Contracts without semester (styrelseuppdrag)
 * and versions replaced before they took effect are left out. Gaps between
 * contracts, or between a behovsanställd's one-day shifts, are not employment.
 */
export function employedIntervals(versions: readonly EmploymentVersion[]): { from: IsoDate; to: IsoDate | null }[] {
  const raw = versions
    .filter((x) => x.vacationRule !== "none" && !(x.validTo !== null && x.validTo < x.validFrom))
    .map((x) => {
      const from = x.validFrom > x.startsOn ? x.validFrom : x.startsOn;
      const ends = [x.endsOn, x.validTo].filter((d): d is IsoDate => d !== null);
      return { from, to: ends.length ? ends.reduce((m, d) => (d < m ? d : m)) : null };
    })
    .filter((i) => i.to === null || i.to >= i.from)
    .sort((a, b) => a.from.localeCompare(b.from));
  const out: { from: IsoDate; to: IsoDate | null }[] = [];
  for (const i of raw) {
    const last = out[out.length - 1];
    if (last && (last.to === null || i.from <= addDays(last.to, 1))) {
      if (last.to !== null && (i.to === null || i.to > last.to)) last.to = i.to;
    } else out.push({ ...i });
  }
  return out;
}

/** Days of the intervals inside [from, to]. */
function daysWithin(intervals: readonly { from: IsoDate; to: IsoDate | null }[], range: { from: IsoDate; to: IsoDate }): number {
  let n = 0;
  for (const i of intervals) {
    const from = i.from > range.from ? i.from : range.from;
    const to = i.to === null || i.to > range.to ? range.to : i.to;
    if (to >= from) n += daysBetween(from, to) + 1;
  }
  return n;
}

/**
 * Semester per semesterår, oldest first. Saved days are used before the
 * year's own once its own are gone (the employee may take saved days in any
 * year, 18 §); a year in which saved days were taken saves none.
 */
export function vacationBalances(input: BalancesInput): VacationBalance[] {
  const intervals = employedIntervals(input.versions);
  if (!intervals.length) return [];
  const { model, asOf } = input;
  const first = intervals[0].from;
  const lastInterval = intervals[intervals.length - 1];
  const daysPerYear = [...input.versions].filter((x) => x.vacationRule !== "none").sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.version - a.version)[0].vacationDays;
  const out: VacationBalance[] = [];
  const saved: { earnedIn: IsoDate; days: number }[] = [];
  // Up to today, or, once the last contract has ended, the semesterår its last days paid for.
  const paysFor = lastInterval.to ? vacationYears(lastInterval.to, model).paysFor.from : asOf;
  const last = vacationYear(paysFor < asOf ? paysFor : asOf, model.startMonthDay);
  for (let year = vacationYear(first, model.startMonthDay); year.from <= last.from; year = vacationYear(addDays(year.to, 1), model.startMonthDay)) {
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
      employedFrom: first,
      employedTo: lastInterval.to,
      employmentDays: daysWithin(intervals, range),
      nonQualifyingDays,
      daysPerYear,
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
