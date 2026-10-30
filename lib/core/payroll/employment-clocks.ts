/**
 * The statutory clocks of LAS (docs/hr-lon.md, section 2, design
 * consequence 2): days in särskild visstidsanställning and in vikariat
 * during the last five years, and the end of a provanställning. Pure; the
 * database view in phase 1 calls the same rules.
 *
 * Days are calendar days, both ends inclusive, and a day counts once even
 * if two periods overlap. SÄVA's "mer än tolv månader" is counted as
 * Arbetsgivarverket does: a month is 30 days, an unbroken stretch counts
 * whole calendar months date to date, so the limit is 360 and the clock
 * converts when the count first exceeds it. Vikariat's "mer än två år" is
 * counted in days, more than 730 (AD 2019 nr 56).
 */

import { addDays, assertIsoDate, daysBetween, type IsoDate } from "../rules/index";
import type { PayrollRuleSet } from "../rules/payroll";

export type EmploymentForm = "tillsvidare" | "provanstallning" | "vikariat" | "sava" | "sasong" | "vd" | "uppdrag";

export type EmploymentPeriod = {
  form: EmploymentForm;
  startsOn: IsoDate;
  /** Last day, inclusive. Null while open-ended (a provanställning or an open vikariat). */
  endsOn: IsoDate | null;
};

export type Clock = {
  /** Days counted in the five years ending on `asOf` (for SÄVA: day-equivalents, a whole month = 30). */
  daysInWindow: number;
  limitDays: number;
  /** Days left before the limit is passed, never negative. */
  daysLeft: number;
  /** True once the count has passed the limit on or before `asOf`. */
  converted: boolean;
  /** The first day the count exceeds the limit if the booked periods run as booked, null if they do not reach it. */
  convertsOn: IsoDate | null;
};

export type Clocks = {
  sava: Clock;
  vikariat: Clock;
  probation: null | {
    startsOn: IsoDate;
    /** Last day of the provanställning: six months after the start, less a day. */
    endsOn: IsoDate;
    /** Last day to give notice to end it (two weeks before the end). */
    noticeBy: IsoDate;
    daysLeft: number;
    /** It becomes tillsvidare the day after `endsOn` unless ended. */
    convertsOn: IsoDate;
  };
};

const DAY = (d: IsoDate) => Math.round(Date.parse(`${d}T00:00:00Z`) / 86_400_000);
const FROM_DAY = (n: number): IsoDate => new Date(n * 86_400_000).toISOString().slice(0, 10);

/** Same date `months` later (the last day of the month when it does not exist: 31 Aug + 6 = 28/29 Feb). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  assertIsoDate(date);
  const [y, m, d] = date.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** First day of the five-year window that ends on `date`. */
export function windowStart(date: IsoDate, years: number): IsoDate {
  return addDays(addMonths(date, -12 * years), 1);
}

/** The set of days covered by the periods, with SÄVA gaps filled where three or more fall in one calendar month. */
function coveredDays(periods: readonly EmploymentPeriod[], horizon: IsoDate, sameMonthThreshold: number | null): Set<number> {
  const days = new Set<number>();
  const clipped = periods.map((p) => ({ from: DAY(p.startsOn), to: DAY(p.endsOn && p.endsOn < horizon ? p.endsOn : horizon) })).filter((p) => p.to >= p.from);
  for (const p of clipped) for (let d = p.from; d <= p.to; d++) days.add(d);

  if (sameMonthThreshold !== null) {
    // LAS 3 § andra stycket: three or more SÄVA in the same calendar month,
    // the time between them in that month counts as SÄVA time too.
    const months = new Set<string>();
    for (const p of clipped) for (let d = p.from; d <= p.to; d = DAY(addMonths(`${FROM_DAY(d).slice(0, 7)}-01`, 1))) months.add(FROM_DAY(d).slice(0, 7));
    for (const month of months) {
      const first = DAY(`${month}-01`);
      const last = DAY(addDays(addMonths(`${month}-01`, 1), -1));
      const inMonth = clipped.filter((p) => p.from <= last && p.to >= first).sort((a, b) => a.from - b.from);
      if (inMonth.length < sameMonthThreshold) continue;
      for (let i = 1; i < inMonth.length; i++) {
        const gapFrom = Math.max(inMonth[i - 1].to + 1, first);
        const gapTo = Math.min(inMonth[i].from - 1, last);
        for (let d = gapFrom; d <= gapTo; d++) days.add(d);
      }
    }
  }
  return days;
}

/** Last day of the k-th whole month from `start` (15 Jan → 14 Feb; 31 Jan → 28 Feb, the month end when the date does not exist). */
function monthEnd(start: IsoDate, k: number): IsoDate {
  const sameDay = addMonths(start, k);
  return sameDay.slice(8) < start.slice(8) ? sameDay : addDays(sameDay, -1);
}

/**
 * SÄVA time in day-equivalents (Arbetsgivarverket): each unbroken stretch
 * counts whole calendar months date to date as 30 days each plus its odd
 * days, so twelve unbroken months are 360 and scattered days count one each.
 */
function monthEquivalent(from: number, to: number, daysPerMonth: number): number {
  const start = FROM_DAY(from);
  let months = 0;
  while (DAY(monthEnd(start, months + 1)) <= to) months++;
  const rest = to - (months ? DAY(monthEnd(start, months)) : from - 1);
  return months * daysPerMonth + rest;
}

function measure(days: Set<number>, from: number, to: number, daysPerMonth: number | null): number {
  let total = 0;
  for (let d = from; d <= to; d++) {
    if (!days.has(d)) continue;
    let e = d;
    while (e + 1 <= to && days.has(e + 1)) e++;
    total += daysPerMonth === null ? e - d + 1 : monthEquivalent(d, e, daysPerMonth);
    d = e;
  }
  return total;
}

const MAX_STEP = 4;

function clock(periods: readonly EmploymentPeriod[], asOf: IsoDate, limitDays: number, rules: PayrollRuleSet, sava: boolean): Clock {
  const years = rules.las.windowYears;
  const perMonth = sava ? rules.las.savaDaysPerMonth : null;
  // Look far enough ahead to project an open or long booked period.
  const horizon = addDays(asOf, Math.max(limitDays * 2, 3 * 366));
  const days = coveredDays(periods, horizon, sava ? rules.las.savaSameMonthThreshold : null);
  const count = (end: number) => measure(days, DAY(windowStart(FROM_DAY(end), years)), end, perMonth);
  const today = DAY(asOf);
  const daysInWindow = count(today);

  // From one day to the next the count moves by at most MAX_STEP (a day
  // added, a 28-day month completing to 30, a day leaving the window), so
  // the search can jump over days that cannot cross the limit instead of
  // rescanning the window for every day.
  let convertsOn: IsoDate | null = null;
  if (daysInWindow > limitDays) {
    // Already passed: walk back to the first day it passed.
    let d = today;
    let c = daysInWindow;
    while (d > today - 6 * 366) {
      const step = Math.max(1, Math.floor((c - limitDays - 1) / MAX_STEP));
      const prev = count(d - step);
      if (prev > limitDays) {
        d -= step;
        c = prev;
      } else if (step === 1) break;
      else c = limitDays + 1; // overshot: go back to single steps from here
    }
    convertsOn = FROM_DAY(d);
  } else {
    let d = today;
    let c = daysInWindow;
    const end = DAY(horizon);
    while (d < end) {
      d += Math.max(1, Math.floor((limitDays - c) / MAX_STEP));
      c = count(Math.min(d, end));
      if (c > limitDays) {
        // Back up to the first day over the limit.
        while (count(d - 1) > limitDays) d--;
        convertsOn = FROM_DAY(d);
        break;
      }
    }
  }
  return {
    daysInWindow,
    limitDays,
    daysLeft: Math.max(0, limitDays - daysInWindow),
    converted: daysInWindow > limitDays,
    convertsOn,
  };
}

export function employmentClocks(periods: readonly EmploymentPeriod[], asOf: IsoDate, rules: PayrollRuleSet): Clocks {
  assertIsoDate(asOf);
  const known = periods.filter((p) => p.startsOn <= addDays(asOf, 3 * 366));
  const sava = clock(known.filter((p) => p.form === "sava"), asOf, rules.las.savaLimitDays, rules, true);
  const vikariat = clock(known.filter((p) => p.form === "vikariat"), asOf, rules.las.vikariatLimitDays, rules, false);

  const current = [...known]
    .filter((p) => p.form === "provanstallning" && p.startsOn <= asOf && (p.endsOn === null || p.endsOn >= asOf))
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
  let probation: Clocks["probation"] = null;
  if (current) {
    // Six months from 15 Jan end on 14 Jul; from 31 Aug, where 31 Feb does
    // not exist, the period runs to the end of February.
    const maxEnd = monthEnd(current.startsOn, rules.las.probationMaxMonths);
    const endsOn = current.endsOn && current.endsOn < maxEnd ? current.endsOn : maxEnd;
    probation = {
      startsOn: current.startsOn,
      endsOn,
      noticeBy: addDays(endsOn, -rules.las.probationNoticeDays),
      daysLeft: daysBetween(asOf, endsOn),
      convertsOn: addDays(endsOn, 1),
    };
  }
  return { sava, vikariat, probation };
}
