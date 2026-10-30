/**
 * Time entries (docs/hr-lon.md, sections 3 and 11; time_entries in
 * supabase/migrations/0037_time.sql). Pure: types and labels, which rows
 * count once corrections are taken into account, the blocks the payroll
 * calculators take (`hourlyPay`, `monthlyOvertime` in
 * lib/core/payroll/time-to-pay.ts), day, week and month sums, and the
 * arbetstidslagen checks Tid shows as warnings, never as blocks.
 *
 * A correction never edits an approved row: it adds a reversal (the same
 * day, kind and project with the hours negated, `correctsId` pointing at
 * the row) and usually a replacement. Sums add the reversal; blocks leave
 * out both the reversed row and the reversal.
 */

import { addDays, daysBetween, type IsoDate } from "../rules/index";
import { PAYROLL_RULE_SETS, payrollRulesAt, type PayrollRuleSet } from "../rules/payroll";
import type { WorkBlock } from "../payroll/time-to-pay";
import { isoWeekday } from "../../workdays";

export const TIME_KINDS = ["work", "overtime", "ob", "travel", "on_call"] as const;
export type TimeKind = (typeof TIME_KINDS)[number];
export const TIME_KIND_LABEL: Record<TimeKind, string> = {
  work: "Arbete",
  overtime: "Övertid",
  ob: "Obekväm tid",
  travel: "Restid",
  on_call: "Beredskap",
};
export const TIME_KIND_SHORT: Record<TimeKind, string> = { work: "", overtime: "ÖT", ob: "OB", travel: "Res", on_call: "Ber" };

export const TIME_STATUSES = ["draft", "submitted", "approved", "locked"] as const;
export type TimeStatus = (typeof TIME_STATUSES)[number];
export const TIME_STATUS_LABEL: Record<TimeStatus, string> = { draft: "Utkast", submitted: "Inskickad", approved: "Godkänd", locked: "Låst" };

export const TIME_SOURCES = ["clock", "manual", "imported"] as const;
export type TimeSource = (typeof TIME_SOURCES)[number];

export type TimeEntry = {
  id: string;
  employeeId: string;
  workDate: IsoDate;
  /** "HH:MM", or null for a row with hours only. */
  start: string | null;
  /** Null with a start: clocked in, not out yet. */
  end: string | null;
  breakMinutes: number;
  /** Negative only on a reversal. */
  hours: number;
  kind: TimeKind;
  projectId: string | null;
  shiftId: string | null;
  note: string;
  source: TimeSource;
  status: TimeStatus;
  /** The approved row this one reverses (hours < 0) or replaces (hours ≥ 0). */
  correctsId: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

/** Kinds that are worked time on a project and so cost on it. Beredskap is paid per agreement, not as project labour. */
export const COSTED_KINDS: readonly TimeKind[] = ["work", "overtime", "ob", "travel"];

export const isApproved = (e: Pick<TimeEntry, "status">) => e.status === "approved" || e.status === "locked";
export const isReversal = (e: Pick<TimeEntry, "correctsId" | "hours">) => e.correctsId !== null && e.hours < 0;
export const isOpenClock = (e: Pick<TimeEntry, "start" | "end">) => e.start !== null && e.end === null;

function minutesOf(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})/.exec(hhmm);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new RangeError(`Tid skrivs TT:MM, fick "${hhmm}".`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Minutes from start to end; an end at or before the start runs past midnight (as the database and `hourlyPay` count). */
export function spanMinutes(start: string, end: string): number {
  const s = minutesOf(start);
  const e = minutesOf(end);
  return e > s ? e - s : e - s + 24 * 60;
}

/** Hours of a block less its break, to two decimals (time_block_hours() in 0037). */
export function blockHours(start: string, end: string, breakMinutes = 0): number {
  return Math.round(((spanMinutes(start, end) - breakMinutes) / 60) * 100) / 100;
}

/**
 * The rows in `statuses` that count, corrections applied: a row is dropped
 * once a reversal of it is among the rows, and the reversal with it. What is
 * left are the rows as they stand (originals and replacements).
 */
export function currentEntries<T extends Pick<TimeEntry, "id" | "status" | "correctsId" | "hours">>(entries: readonly T[], statuses: readonly TimeStatus[] = ["approved", "locked"]): T[] {
  const counted = entries.filter((e) => statuses.includes(e.status));
  const reversed = new Set(counted.filter(isReversal).map((e) => e.correctsId as string));
  return counted.filter((e) => !isReversal(e) && !reversed.has(e.id));
}

/** Net hours of the rows in `statuses` (a reversal subtracts). */
export function netHours(entries: readonly Pick<TimeEntry, "hours" | "status">[], statuses: readonly TimeStatus[] = ["approved", "locked"]): number {
  return round2(entries.filter((e) => statuses.includes(e.status)).reduce((a, e) => a + e.hours, 0));
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type WorkBlocksResult = {
  /** Approved work, OB and övertid with clock times, for `hourlyPay`; övertid flagged. */
  blocks: WorkBlock[];
  /** Approved work without times: base hours only, no OB (the time of day is not known). */
  untimed: { date: IsoDate; hours: number; overtime: boolean }[];
  /** Restid and beredskap, paid per the agreement's own rules (phase 3). */
  other: { date: IsoDate; hours: number; kind: TimeKind }[];
};

/**
 * Approved rows as the payroll calculators take them. OB is worked time
 * whose band the calculator finds from the clock; a row marked `ob` is
 * worked time like any other. The break is taken from the end of the block
 * so the hours match the row (the calculator has no break).
 */
export function toWorkBlocks(entries: readonly TimeEntry[]): WorkBlocksResult {
  const out: WorkBlocksResult = { blocks: [], untimed: [], other: [] };
  for (const e of currentEntries(entries)) {
    if (e.kind === "travel" || e.kind === "on_call") {
      out.other.push({ date: e.workDate, hours: e.hours, kind: e.kind });
      continue;
    }
    const overtime = e.kind === "overtime";
    if (e.start && e.end) {
      const end = e.breakMinutes ? clockAfter(e.start, spanMinutes(e.start, e.end) - e.breakMinutes) : e.end;
      out.blocks.push(overtime ? { date: e.workDate, start: e.start, end, overtime } : { date: e.workDate, start: e.start, end });
    } else {
      out.untimed.push({ date: e.workDate, hours: e.hours, overtime });
    }
  }
  return out;
}

function clockAfter(start: string, minutes: number): string {
  const m = (minutesOf(start) + minutes) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/* ---------- sums ---------- */

export type HourSums = Record<TimeKind, number> & { total: number };
const emptySums = (): HourSums => ({ work: 0, overtime: 0, ob: 0, travel: 0, on_call: 0, total: 0 });

function addTo(s: HourSums, e: Pick<TimeEntry, "kind" | "hours">) {
  s[e.kind] = round2(s[e.kind] + e.hours);
  s.total = round2(s.total + e.hours);
}

/** Net hours per kind of the rows in `statuses`. */
export function sumByKind(entries: readonly Pick<TimeEntry, "kind" | "hours" | "status">[], statuses: readonly TimeStatus[] = ["approved", "locked"]): HourSums {
  const s = emptySums();
  for (const e of entries) if (statuses.includes(e.status)) addTo(s, e);
  return s;
}

/** Net hours per date (and kind). */
export function sumByDay(entries: readonly Pick<TimeEntry, "workDate" | "kind" | "hours" | "status">[], statuses: readonly TimeStatus[] = ["approved", "locked"]): Map<IsoDate, HourSums> {
  const map = new Map<IsoDate, HourSums>();
  for (const e of entries) {
    if (!statuses.includes(e.status)) continue;
    const s = map.get(e.workDate) ?? emptySums();
    addTo(s, e);
    map.set(e.workDate, s);
  }
  return map;
}

/** The Monday of the ISO week holding `date`. */
export const weekStart = (date: IsoDate): IsoDate => addDays(date, 1 - isoWeekday(date));

/** ISO week number (the week with the year's first Thursday is week 1). */
export function isoWeek(date: IsoDate): { year: number; week: number } {
  const thursday = addDays(date, 4 - isoWeekday(date));
  const year = Number(thursday.slice(0, 4));
  return { year, week: Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1 };
}

/** The seven dates Monday–Sunday of the week starting `monday`. */
export const weekDates = (monday: IsoDate): IsoDate[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));

/** Every date of a month "YYYY-MM". */
export function monthDates(month: string): IsoDate[] {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new RangeError(`Månaden skrivs ÅÅÅÅ-MM, fick "${month}".`);
  const out: IsoDate[] = [];
  for (let d = `${month}-01`; d.slice(0, 7) === month; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Sums for the week starting `monday` and for the month `month` (YYYY-MM). */
export function weekSums(entries: readonly TimeEntry[], monday: IsoDate, statuses?: readonly TimeStatus[]): HourSums {
  const end = addDays(monday, 6);
  return sumByKind(entries.filter((e) => e.workDate >= monday && e.workDate <= end), statuses);
}
export function monthSums(entries: readonly TimeEntry[], month: string, statuses?: readonly TimeStatus[]): HourSums {
  return sumByKind(entries.filter((e) => e.workDate.slice(0, 7) === month), statuses);
}

/* ---------- arbetstidslagen ---------- */

/**
 * The rule book's arbetstidslagen values. They are the law's, not a year's,
 * so a date after the last rule set (which payrollRulesAt refuses) uses the
 * last set.
 */
export function workingTimeRules(date: IsoDate): PayrollRuleSet["workingTime"] {
  try {
    return payrollRulesAt(date).workingTime;
  } catch {
    return PAYROLL_RULE_SETS[PAYROLL_RULE_SETS.length - 1].workingTime;
  }
}

export type AtlCode = "overtime-year" | "overtime-4-weeks" | "overtime-month" | "daily-rest" | "weekly-rest";
export type AtlWarning = {
  code: AtlCode;
  employeeId: string;
  /** The day the limit is passed, or the day (week's Monday) without the rest. */
  date: IsoDate;
  value: number;
  limit: number;
  message: string;
};

const fmtH = (n: number) => `${String(round2(n)).replace(".", ",")} h`;

/**
 * Arbetstidslagen as warnings for one person's rows (pass the rows that
 * count for the check, normally submitted and approved, with some days
 * before and after the period shown so the rest checks see the
 * neighbours):
 *
 *   - allmän övertid (8 §): 200 h per calendar year; 48 h in four weeks
 *     (any 28 days in a row here) or 50 h in a calendar month, both shown
 *     since the law lets the employer pick one;
 *   - dygnsvila (13 §): 11 h in a row in every 24 h. Approximated: blocks
 *     with less than 11 h between them are one stretch, and a stretch longer
 *     than 13 h (24 − 11) leaves less than 11 h of rest;
 *   - veckovila (14 §): 36 h in a row in every seven days. Each ISO week
 *     with work needs a gap of at least 36 h between two blocks that
 *     touches the week.
 *
 * Rows without clock times count for övertid but not for the rest checks.
 */
export function atlWarnings(entries: readonly TimeEntry[], options: { from?: IsoDate; to?: IsoDate } = {}): AtlWarning[] {
  const out: AtlWarning[] = [];
  const byPerson = new Map<string, TimeEntry[]>();
  for (const e of currentEntries(entries, ["submitted", "approved", "locked"])) {
    const list = byPerson.get(e.employeeId) ?? [];
    list.push(e);
    byPerson.set(e.employeeId, list);
  }
  const inRange = (d: IsoDate) => (!options.from || d >= options.from) && (!options.to || d <= options.to);
  for (const [employeeId, list] of byPerson) {
    for (const w of [...overtimeWarnings(employeeId, list), ...restWarnings(employeeId, list)]) if (inRange(w.date)) out.push(w);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
}

function overtimeWarnings(employeeId: string, list: readonly TimeEntry[]): AtlWarning[] {
  const out: AtlWarning[] = [];
  const byDay = new Map<IsoDate, number>();
  for (const e of list) if (e.kind === "overtime") byDay.set(e.workDate, (byDay.get(e.workDate) ?? 0) + e.hours);
  const days = [...byDay.keys()].sort();
  const sumBetween = (from: IsoDate, to: IsoDate) => days.filter((d) => d >= from && d <= to).reduce((a, d) => a + (byDay.get(d) ?? 0), 0);
  const once = new Set<string>();
  for (const d of days) {
    const r = workingTimeRules(d);
    const year = sumBetween(`${d.slice(0, 4)}-01-01`, d);
    if (year > r.overtimePerYearHours && !once.has(`y${d.slice(0, 4)}`)) {
      once.add(`y${d.slice(0, 4)}`);
      out.push({ code: "overtime-year", employeeId, date: d, value: round2(year), limit: r.overtimePerYearHours, message: `Övertiden i år är ${fmtH(year)}, över ${r.overtimePerYearHours} h (ATL 8 §).` });
    }
    const four = sumBetween(addDays(d, -27), d);
    if (four > r.overtimePer4WeeksHours && !once.has(`f${addDays(d, -27)}`)) {
      // One warning per stretch: skip the following days of the same window.
      for (let i = 0; i < 28; i++) once.add(`f${addDays(d, -27 + i)}`);
      out.push({ code: "overtime-4-weeks", employeeId, date: d, value: round2(four), limit: r.overtimePer4WeeksHours, message: `Övertiden de senaste fyra veckorna är ${fmtH(four)}, över ${r.overtimePer4WeeksHours} h (ATL 8 §, om ni räknar per fyra veckor).` });
    }
    const month = sumBetween(`${d.slice(0, 7)}-01`, d);
    if (month > r.overtimePerMonthHours && !once.has(`m${d.slice(0, 7)}`)) {
      once.add(`m${d.slice(0, 7)}`);
      out.push({ code: "overtime-month", employeeId, date: d, value: round2(month), limit: r.overtimePerMonthHours, message: `Övertiden i månaden är ${fmtH(month)}, över ${r.overtimePerMonthHours} h (ATL 8 §, om ni räknar per kalendermånad).` });
    }
  }
  return out;
}

type Interval = { from: number; to: number; date: IsoDate };
const DAY_MIN = 24 * 60;
const minuteOfDate = (date: IsoDate) => daysBetween("2000-01-01", date) * DAY_MIN;

function intervals(list: readonly TimeEntry[]): Interval[] {
  const raw = list
    .filter((e) => e.start && e.end)
    .map((e) => {
      const from = minuteOfDate(e.workDate) + minutesOf(e.start as string);
      return { from, to: from + spanMinutes(e.start as string, e.end as string), date: e.workDate };
    })
    .sort((a, b) => a.from - b.from);
  // Overlapping or touching blocks are one.
  const merged: Interval[] = [];
  for (const i of raw) {
    const last = merged[merged.length - 1];
    if (last && i.from <= last.to) last.to = Math.max(last.to, i.to);
    else merged.push({ ...i });
  }
  return merged;
}

function restWarnings(employeeId: string, list: readonly TimeEntry[]): AtlWarning[] {
  const out: AtlWarning[] = [];
  const iv = intervals(list);
  if (!iv.length) return out;
  const r = workingTimeRules(iv[0].date);
  const dailyRest = r.dailyRestHours * 60;
  // Daily rest: stretches of blocks closer than the rest.
  let start = iv[0];
  let end = iv[0].to;
  const flush = (s: Interval, e: number) => {
    const span = e - s.from;
    if (span > DAY_MIN - dailyRest) {
      out.push({ code: "daily-rest", employeeId, date: s.date, value: round2(span / 60), limit: 24 - r.dailyRestHours, message: `Arbetspasset från ${s.date} sträcker sig över ${fmtH(span / 60)} utan ${r.dailyRestHours} timmars vila (dygnsvila, ATL 13 §).` });
    }
  };
  for (let i = 1; i < iv.length; i++) {
    if (iv[i].from - end < dailyRest) {
      end = Math.max(end, iv[i].to);
    } else {
      flush(start, end);
      start = iv[i];
      end = iv[i].to;
    }
  }
  flush(start, end);

  // Weekly rest: a gap of 36 h touching each week with work.
  const weeklyRest = r.weeklyRestHours * 60;
  const gaps: { from: number; to: number }[] = [{ from: -Infinity, to: iv[0].from }];
  for (let i = 1; i < iv.length; i++) gaps.push({ from: iv[i - 1].to, to: iv[i].from });
  gaps.push({ from: iv[iv.length - 1].to, to: Infinity });
  const weeks = new Set(iv.map((i) => weekStart(i.date)));
  for (const monday of [...weeks].sort()) {
    const wFrom = minuteOfDate(monday);
    const wTo = wFrom + 7 * DAY_MIN;
    const longest = Math.max(...gaps.filter((g) => g.to > wFrom && g.from < wTo).map((g) => g.to - g.from));
    if (longest < weeklyRest) {
      const { week } = isoWeek(monday);
      out.push({ code: "weekly-rest", employeeId, date: monday, value: round2(longest / 60), limit: r.weeklyRestHours, message: `Vecka ${week} har ingen sammanhängande vila på ${r.weeklyRestHours} h; längsta är ${fmtH(longest / 60)} (veckovila, ATL 14 §).` });
    }
  }
  return out;
}

/* ---------- the clock in Sweden ---------- */

/** "HH:MM" in Swedish time for an instant, for clocking in and out on the server. */
export function stockholmClock(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Stockholm" }).format(now);
}
