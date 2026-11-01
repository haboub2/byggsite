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
import { PAYROLL_RULE_SETS, payrollRulesAt, type AgreementRules, type PayrollRuleSet, type WorkingTimeRules } from "../rules/payroll";
import type { WorkBlock } from "../payroll/time-to-pay";
import { scheduledHours, type WorkSchedule } from "../payroll/sick-pay";
import type { Absence } from "./absence";
import { isWorkday, isoWeekday } from "../../workdays";

export const TIME_KINDS = ["work", "overtime", "mertid", "jour", "ob", "travel", "on_call"] as const;
export type TimeKind = (typeof TIME_KINDS)[number];
export const TIME_KIND_LABEL: Record<TimeKind, string> = {
  work: "Arbete",
  overtime: "Övertid",
  // ATL 10 §: a part-timer's hours above the contract up to full time.
  mertid: "Mertid (deltid)",
  // ATL 6 §: at the workplace, ready to work; not beredskap (on_call), which is at home.
  jour: "Jourtid",
  ob: "Obekväm tid",
  travel: "Restid",
  on_call: "Beredskap",
};
export const TIME_KIND_SHORT: Record<TimeKind, string> = { work: "", overtime: "ÖT", mertid: "MT", jour: "Jour", ob: "OB", travel: "Res", on_call: "Ber" };

/** Which övertid an övertid row is: allmän (8 §), extra (8 a §) or nödfallsövertid (9 §, outside the 8 § limits). */
export const OVERTIME_KINDS = ["allman", "extra", "nodfall"] as const;
export type OvertimeKind = (typeof OVERTIME_KINDS)[number];
export const OVERTIME_KIND_LABEL: Record<OvertimeKind, string> = { allman: "Allmän övertid", extra: "Extra övertid", nodfall: "Nödfallsövertid" };

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
  /** On an övertid row: which kind (0048); null otherwise. Absent in old data means allmän. */
  overtimeKind: OvertimeKind | null;
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
export const COSTED_KINDS: readonly TimeKind[] = ["work", "overtime", "mertid", "ob", "travel"];

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
  /** Restid, beredskap and jourtid, paid per the agreement's own rules (phase 3). */
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
    if (e.kind === "travel" || e.kind === "on_call" || e.kind === "jour") {
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
const emptySums = (): HourSums => ({ work: 0, overtime: 0, mertid: 0, jour: 0, ob: 0, travel: 0, on_call: 0, total: 0 });

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
 * last set (`workingTimeAssumed` says when). An agreement that replaces the
 * law's limits (ATL 3 §) overrides the keys it sets.
 */
export function workingTimeRules(date: IsoDate, agreement?: Pick<AgreementRules, "workingTime"> | null): WorkingTimeRules {
  let set: PayrollRuleSet;
  try {
    set = payrollRulesAt(date);
  } catch {
    set = PAYROLL_RULE_SETS[PAYROLL_RULE_SETS.length - 1];
  }
  return { ...set.workingTime, ...(agreement?.workingTime ?? {}) };
}

/** True when `date` is after the last rule set: the checks run on the latest known limits. */
export function workingTimeAssumed(date: IsoDate): boolean {
  try {
    payrollRulesAt(date);
    return false;
  } catch {
    return true;
  }
}

export type AtlCode =
  | "overtime-year"
  | "overtime-year-extra"
  | "overtime-4-weeks"
  | "overtime-month"
  | "overtime-derived"
  | "mertid-year"
  | "mertid-year-extra"
  | "jour-4-weeks"
  | "jour-month"
  | "average-48"
  | "daily-rest"
  | "weekly-rest"
  | "break-missing"
  | "night-work";
export type AtlWarning = {
  code: AtlCode;
  employeeId: string;
  /** The day the limit is passed, or the day (week's Monday) without the rest. */
  date: IsoDate;
  value: number;
  limit: number;
  message: string;
};

/**
 * What the checks need to know about a person beyond the rows: the
 * contract's ordinary weekly hours (schedule or weeklyHours, else 40 ×
 * working-time percent), so hours above them count as övertid or mertid
 * whatever the rows are labelled (ATL 7, 10 §§), and the schedule for
 * counting absence as working time (10 b §).
 */
export type PersonWorkingTime = {
  weeklyHours: number;
  schedule: WorkSchedule | null;
  /** The agreement's own limits, when it has any (ATL 3 §). */
  agreement?: Pick<AgreementRules, "workingTime"> | null;
};

export type AtlAbsence = Pick<Absence, "employeeId" | "kind" | "from" | "to" | "extent">;

export type AtlOptions = {
  from?: IsoDate;
  to?: IsoDate;
  /** Per employee id; without it only the labelled rows are checked. */
  people?: ReadonlyMap<string, PersonWorkingTime>;
  /** Approved absences: sick days and semester count as working time in the 48-hour average (10 b §). */
  absences?: readonly AtlAbsence[];
};

const fmtH = (n: number) => `${String(round2(n)).replace(".", ",")} h`;
const WORKED_KINDS: readonly TimeKind[] = ["work", "ob", "overtime", "mertid"];

/**
 * Arbetstidslagen as warnings for one person's rows (pass the rows that
 * count for the check, normally submitted and approved, with some days
 * before and after the period shown so the rest checks see the
 * neighbours):
 *
 *   - övertid (7, 8, 8 a §§): hours above the ordinary weekly hours, whether
 *     labelled övertid or not (`overtime-derived` says when the label was
 *     missing); allmän övertid 200 h a year, extra övertid 150 h more;
 *     48 h in four weeks (any 28 days in a row here) or 50 h in a calendar
 *     month, both shown since the law lets the employer pick one;
 *     nödfallsövertid (9 §) is outside the limits;
 *   - mertid (10, 10 a §§): a part-timer's extra hours up to full time,
 *     200 h a year, extra mertid 150 h more;
 *   - jourtid (6 §): 48 h in four weeks or 50 h in a month;
 *   - 48 h a week on average (10 b §) over the reference period, övertid,
 *     mertid, jourtid and semesterlönegrundande absence included;
 *   - dygnsvila (13 §): 11 h in a row in every 24 h. Approximated: blocks
 *     with less than 11 h between them are one stretch, and a stretch longer
 *     than 13 h (24 − 11) leaves less than 11 h of rest;
 *   - veckovila (14 §): 36 h in a row in every seven days. Each ISO week
 *     with work needs a gap of at least 36 h between two blocks that
 *     touches the week;
 *   - rast (15 §): a block longer than five hours without a break;
 *   - nattarbete (13 a §): a day with three hours or more between 22 and 06
 *     and more than eight hours of work, since night workers have 8 h per
 *     24 h on average.
 *
 * Rows without clock times count for the hour limits but not for the rest,
 * break and night checks.
 */
export function atlWarnings(entries: readonly TimeEntry[], options: AtlOptions = {}): AtlWarning[] {
  const out: AtlWarning[] = [];
  const byPerson = new Map<string, TimeEntry[]>();
  for (const e of currentEntries(entries, ["submitted", "approved", "locked"])) {
    const list = byPerson.get(e.employeeId) ?? [];
    list.push(e);
    byPerson.set(e.employeeId, list);
  }
  const inRange = (d: IsoDate) => (!options.from || d >= options.from) && (!options.to || d <= options.to);
  for (const [employeeId, list] of byPerson) {
    const person = options.people?.get(employeeId) ?? null;
    const absences = (options.absences ?? []).filter((a) => a.employeeId === employeeId);
    const all = [...hourWarnings(employeeId, list, person), ...averageWarnings(employeeId, list, person, absences), ...restWarnings(employeeId, list, person), ...breakWarnings(employeeId, list, person), ...nightWarnings(employeeId, list, person)];
    for (const w of all) if (inRange(w.date)) out.push(w);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
}

/** Hours per day of one kind, from the rows (a reversal subtracts). */
function hoursByDay(list: readonly TimeEntry[], pick: (e: TimeEntry) => boolean): Map<IsoDate, number> {
  const byDay = new Map<IsoDate, number>();
  for (const e of list) if (pick(e)) byDay.set(e.workDate, round2((byDay.get(e.workDate) ?? 0) + e.hours));
  return byDay;
}

export type DerivedExtra = { week: IsoDate; date: IsoDate; worked: number; ordinary: number; overtime: number; mertid: number };

/**
 * Hours above the contract per ISO week that the rows did not label as
 * övertid or mertid (ATL 7, 10 §§): for a part-timer first mertid up to full
 * time, the rest övertid. Dated on the week's last worked day.
 */
export function derivedExtra(list: readonly TimeEntry[], person: PersonWorkingTime | null, rules: WorkingTimeRules): DerivedExtra[] {
  if (!person) return [];
  const weeks = new Map<IsoDate, { worked: number; labelledOt: number; labelledMt: number; last: IsoDate }>();
  for (const e of list) {
    if (!WORKED_KINDS.includes(e.kind)) continue;
    const monday = weekStart(e.workDate);
    const w = weeks.get(monday) ?? { worked: 0, labelledOt: 0, labelledMt: 0, last: e.workDate };
    w.worked = round2(w.worked + e.hours);
    if (e.kind === "overtime") w.labelledOt = round2(w.labelledOt + e.hours);
    if (e.kind === "mertid") w.labelledMt = round2(w.labelledMt + e.hours);
    if (e.workDate > w.last) w.last = e.workDate;
    weeks.set(monday, w);
  }
  const out: DerivedExtra[] = [];
  for (const [week, w] of [...weeks].sort((a, b) => a[0].localeCompare(b[0]))) {
    const excess = Math.max(0, round2(w.worked - person.weeklyHours));
    const unlabelled = Math.max(0, round2(excess - w.labelledOt - w.labelledMt));
    if (unlabelled <= 0) continue;
    const room = Math.max(0, round2(rules.fullTimeWeeklyHours - person.weeklyHours - w.labelledMt));
    const mertid = Math.min(unlabelled, room);
    out.push({ week, date: w.last, worked: w.worked, ordinary: person.weeklyHours, overtime: round2(unlabelled - mertid), mertid });
  }
  return out;
}

function hourWarnings(employeeId: string, list: readonly TimeEntry[], person: PersonWorkingTime | null): AtlWarning[] {
  const out: AtlWarning[] = [];
  const first = list.map((e) => e.workDate).sort()[0];
  if (!first) return out;
  const r = workingTimeRules(first, person?.agreement);
  // Övertid for the limits: labelled allmän/extra övertid plus the unlabelled excess; nödfallsövertid (9 §) is outside them.
  const overtime = hoursByDay(list, (e) => e.kind === "overtime" && e.overtimeKind !== "nodfall");
  const mertid = hoursByDay(list, (e) => e.kind === "mertid");
  const jour = hoursByDay(list, (e) => e.kind === "jour");
  for (const d of derivedExtra(list, person, r)) {
    if (d.overtime > 0) overtime.set(d.date, round2((overtime.get(d.date) ?? 0) + d.overtime));
    if (d.mertid > 0) mertid.set(d.date, round2((mertid.get(d.date) ?? 0) + d.mertid));
    const { week } = isoWeek(d.week);
    const parts = [d.overtime > 0 ? `${fmtH(d.overtime)} övertid` : "", d.mertid > 0 ? `${fmtH(d.mertid)} mertid` : ""].filter(Boolean).join(" och ");
    out.push({ code: "overtime-derived", employeeId, date: d.date, value: d.worked, limit: d.ordinary, message: `Vecka ${week}: ${fmtH(d.worked)} mot ${fmtH(d.ordinary)} enligt avtalet; ${parts} utöver det är inte märkt så på raderna men räknas ändå (ATL 7 och 10 §§).` });
  }

  const windows = (byDay: Map<IsoDate, number>, prefix: string, limits: { year: number; extraYear?: number; fourWeeks?: number; month?: number }, what: string, paragraph: string) => {
    const days = [...byDay.keys()].sort();
    const sumBetween = (from: IsoDate, to: IsoDate) => days.filter((d) => d >= from && d <= to).reduce((a, d) => a + (byDay.get(d) ?? 0), 0);
    const once = new Set<string>();
    for (const d of days) {
      const year = sumBetween(`${d.slice(0, 4)}-01-01`, d);
      if (year > limits.year && !once.has(`y${d.slice(0, 4)}`)) {
        once.add(`y${d.slice(0, 4)}`);
        out.push({ code: `${prefix}-year` as AtlCode, employeeId, date: d, value: round2(year), limit: limits.year, message: `${what} i år är ${fmtH(year)}, över ${limits.year} h (${paragraph}).${limits.extraYear ? ` Upp till ${limits.year + limits.extraYear} h kräver särskilda skäl (extra ${what.toLowerCase()}).` : ""}` });
      }
      if (limits.extraYear && year > limits.year + limits.extraYear && !once.has(`x${d.slice(0, 4)}`)) {
        once.add(`x${d.slice(0, 4)}`);
        out.push({ code: `${prefix}-year-extra` as AtlCode, employeeId, date: d, value: round2(year), limit: limits.year + limits.extraYear, message: `${what} i år är ${fmtH(year)}, över ${limits.year + limits.extraYear} h även med extra ${what.toLowerCase()} (${paragraph}); mer kräver dispens.` });
      }
      if (limits.fourWeeks) {
        const four = sumBetween(addDays(d, -27), d);
        if (four > limits.fourWeeks && !once.has(`f${addDays(d, -27)}`)) {
          // One warning per stretch: skip the following days of the same window.
          for (let i = 0; i < 28; i++) once.add(`f${addDays(d, -27 + i)}`);
          out.push({ code: `${prefix}-4-weeks` as AtlCode, employeeId, date: d, value: round2(four), limit: limits.fourWeeks, message: `${what} de senaste fyra veckorna är ${fmtH(four)}, över ${limits.fourWeeks} h (${paragraph}, om ni räknar per fyra veckor).` });
        }
      }
      if (limits.month) {
        const month = sumBetween(`${d.slice(0, 7)}-01`, d);
        if (month > limits.month && !once.has(`m${d.slice(0, 7)}`)) {
          once.add(`m${d.slice(0, 7)}`);
          out.push({ code: `${prefix}-month` as AtlCode, employeeId, date: d, value: round2(month), limit: limits.month, message: `${what} i månaden är ${fmtH(month)}, över ${limits.month} h (${paragraph}, om ni räknar per kalendermånad).` });
        }
      }
    }
  };
  windows(overtime, "overtime", { year: r.overtimePerYearHours, extraYear: r.extraOvertimePerYearHours, fourWeeks: r.overtimePer4WeeksHours, month: r.overtimePerMonthHours }, "Övertiden", "ATL 8 §");
  windows(mertid, "mertid", { year: r.mertidPerYearHours, extraYear: r.extraMertidPerYearHours }, "Mertiden", "ATL 10 §");
  windows(jour, "jour", { year: Infinity, fourWeeks: r.jourPer4WeeksHours, month: r.jourPerMonthHours }, "Jourtiden", "ATL 6 §");
  return out;
}

/** Scheduled hours on a day for a person: the schedule, else the weekly hours over Monday–Friday. */
function scheduledFor(person: PersonWorkingTime, date: IsoDate): number {
  if (person.schedule) return scheduledHours(person.schedule, date);
  return isWorkday(date) ? round2(person.weeklyHours / 5) : 0;
}

/**
 * 10 b §: the total working time (övertid, mertid and jourtid included, and
 * semesterlönegrundande absence counted as if worked) may be at most 48 h
 * per seven days on average over a reference period of at most four
 * months. Rolling windows of the reference weeks; one warning per stretch.
 */
function averageWarnings(employeeId: string, list: readonly TimeEntry[], person: PersonWorkingTime | null, absences: readonly AtlAbsence[]): AtlWarning[] {
  const out: AtlWarning[] = [];
  if (!person) return out;
  const first = list.map((e) => e.workDate).sort()[0];
  if (!first) return out;
  const r = workingTimeRules(first, person.agreement);
  const byWeek = new Map<IsoDate, number>();
  const add = (date: IsoDate, hours: number) => {
    const monday = weekStart(date);
    byWeek.set(monday, round2((byWeek.get(monday) ?? 0) + hours));
  };
  for (const e of list) if (WORKED_KINDS.includes(e.kind) || e.kind === "jour") add(e.workDate, e.hours);
  const last = list.map((e) => e.workDate).sort().at(-1) as IsoDate;
  for (const a of absences) {
    if (a.kind !== "sjuk" && a.kind !== "semester" && a.kind !== "vab" && a.kind !== "foraldraledig") continue;
    const to = a.to && a.to < last ? a.to : last;
    for (let d = a.from < first ? first : a.from; d <= to; d = addDays(d, 1)) add(d, round2(scheduledFor(person, d) * a.extent));
  }
  const weeks = [...byWeek.keys()].sort();
  if (!weeks.length) return out;
  // A single heavy week is not a breach: the average needs at least four weeks of data, and
  // one warning covers a reference period.
  let skipUntil = "";
  for (const monday of weeks) {
    if (monday < skipUntil) continue;
    const windowStart = addDays(monday, -7 * (r.averageReferenceWeeks - 1));
    const from = windowStart < weeks[0] ? weeks[0] : windowStart;
    const n = Math.round(daysBetween(from, monday) / 7) + 1;
    if (n < 4) continue;
    const total = weeks.filter((w) => w >= from && w <= monday).reduce((s, w) => s + (byWeek.get(w) ?? 0), 0);
    const avg = round2(total / n);
    if (avg > r.averageWeeklyMaxHours) {
      out.push({ code: "average-48", employeeId, date: monday, value: avg, limit: r.averageWeeklyMaxHours, message: `Arbetstiden är i genomsnitt ${fmtH(avg)} per vecka över de senaste ${n} veckorna (övertid, mertid, jour och frånvaro medräknade), över ${r.averageWeeklyMaxHours} h (ATL 10 b §).` });
      skipUntil = addDays(monday, 7 * r.averageReferenceWeeks);
    }
  }
  return out;
}

/** 15 §: no more than five hours of work without a break. Rows with clock times and no break only. */
function breakWarnings(employeeId: string, list: readonly TimeEntry[], person: PersonWorkingTime | null): AtlWarning[] {
  const out: AtlWarning[] = [];
  for (const e of list) {
    if (!e.start || !e.end || e.breakMinutes > 0 || !WORKED_KINDS.includes(e.kind)) continue;
    const r = workingTimeRules(e.workDate, person?.agreement);
    const span = spanMinutes(e.start, e.end) / 60;
    if (span > r.maxHoursWithoutBreak) out.push({ code: "break-missing", employeeId, date: e.workDate, value: round2(span), limit: r.maxHoursWithoutBreak, message: `${e.start}–${e.end} den ${e.workDate} är ${fmtH(span)} utan rast; rast ska ges senast efter ${r.maxHoursWithoutBreak} timmar (ATL 15 §).` });
  }
  return out;
}

/** 13 a §: a day with three hours or more in the night (22–06) and more than eight hours of work. */
function nightWarnings(employeeId: string, list: readonly TimeEntry[], person: PersonWorkingTime | null): AtlWarning[] {
  const out: AtlWarning[] = [];
  const night = new Map<IsoDate, number>();
  const total = new Map<IsoDate, number>();
  for (const e of list) {
    if (!WORKED_KINDS.includes(e.kind)) continue;
    total.set(e.workDate, round2((total.get(e.workDate) ?? 0) + e.hours));
    if (!e.start || !e.end) continue;
    const r = workingTimeRules(e.workDate, person?.agreement);
    const nightFrom = minutesOf(r.nightStart);
    const nightTo = minutesOf(r.nightEnd);
    const from = minutesOf(e.start);
    const to = from + spanMinutes(e.start, e.end);
    let mins = 0;
    for (let m = from; m < to; m++) {
      const clock = m % DAY_MIN;
      if (clock >= nightFrom || clock < nightTo) mins++;
    }
    night.set(e.workDate, round2((night.get(e.workDate) ?? 0) + mins / 60));
  }
  for (const [date, hours] of night) {
    const r = workingTimeRules(date, person?.agreement);
    const day = total.get(date) ?? 0;
    if (hours >= 3 && day > r.nightMaxHoursPer24) {
      out.push({ code: "night-work", employeeId, date, value: round2(day), limit: r.nightMaxHoursPer24, message: `${date}: ${fmtH(hours)} mellan ${r.nightStart} och ${r.nightEnd} och ${fmtH(day)} på dygnet; nattarbetande får arbeta högst ${r.nightMaxHoursPer24} h per dygn i genomsnitt (ATL 13 a §).` });
    }
  }
  return out;
}

/* ---------- ATL 11 §: the övertidsjournal ---------- */

export type JournalMonth = {
  employeeId: string;
  /** "YYYY-MM". */
  month: string;
  ordinaryHours: number;
  overtime: { allman: number; extra: number; nodfall: number; derived: number };
  mertid: { labelled: number; derived: number };
  jourHours: number;
};
export type JournalYear = {
  employeeId: string;
  year: number;
  overtimeHours: number;
  overtimeLimit: number;
  extraOvertimeLimit: number;
  nodfallHours: number;
  mertidHours: number;
  mertidLimit: number;
  jourHours: number;
  months: JournalMonth[];
};

/**
 * The record ATL 11 § requires the employer to keep of jourtid, övertid and
 * mertid per employee: per month and the calendar year's totals against
 * the limits. Approved and locked rows; hours above the contract that were
 * not labelled count as derived (7, 10 §§).
 */
export function overtimeJournal(entries: readonly TimeEntry[], options: { year: number; people?: ReadonlyMap<string, PersonWorkingTime> }): JournalYear[] {
  const yearPrefix = String(options.year);
  const byPerson = new Map<string, TimeEntry[]>();
  for (const e of currentEntries(entries, ["approved", "locked"])) {
    if (!e.workDate.startsWith(yearPrefix)) continue;
    const list = byPerson.get(e.employeeId) ?? [];
    list.push(e);
    byPerson.set(e.employeeId, list);
  }
  const out: JournalYear[] = [];
  for (const [employeeId, list] of byPerson) {
    const person = options.people?.get(employeeId) ?? null;
    const r = workingTimeRules(`${yearPrefix}-01-01`, person?.agreement);
    const months = new Map<string, JournalMonth>();
    const monthOf = (month: string) => {
      const m = months.get(month) ?? { employeeId, month, ordinaryHours: 0, overtime: { allman: 0, extra: 0, nodfall: 0, derived: 0 }, mertid: { labelled: 0, derived: 0 }, jourHours: 0 };
      months.set(month, m);
      return m;
    };
    for (const e of list) {
      const m = monthOf(e.workDate.slice(0, 7));
      if (e.kind === "overtime") m.overtime[e.overtimeKind ?? "allman"] = round2(m.overtime[e.overtimeKind ?? "allman"] + e.hours);
      else if (e.kind === "mertid") m.mertid.labelled = round2(m.mertid.labelled + e.hours);
      else if (e.kind === "jour") m.jourHours = round2(m.jourHours + e.hours);
      else if (e.kind === "work" || e.kind === "ob") m.ordinaryHours = round2(m.ordinaryHours + e.hours);
    }
    for (const d of derivedExtra(list, person, r)) {
      const m = monthOf(d.date.slice(0, 7));
      m.overtime.derived = round2(m.overtime.derived + d.overtime);
      m.mertid.derived = round2(m.mertid.derived + d.mertid);
      m.ordinaryHours = round2(m.ordinaryHours - d.overtime - d.mertid);
    }
    const rows = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
    const sum = (f: (m: JournalMonth) => number) => round2(rows.reduce((s, m) => s + f(m), 0));
    out.push({
      employeeId,
      year: options.year,
      overtimeHours: sum((m) => m.overtime.allman + m.overtime.extra + m.overtime.derived),
      overtimeLimit: r.overtimePerYearHours,
      extraOvertimeLimit: r.overtimePerYearHours + r.extraOvertimePerYearHours,
      nodfallHours: sum((m) => m.overtime.nodfall),
      mertidHours: sum((m) => m.mertid.labelled + m.mertid.derived),
      mertidLimit: r.mertidPerYearHours,
      jourHours: sum((m) => m.jourHours),
      months: rows,
    });
  }
  return out.sort((a, b) => a.employeeId.localeCompare(b.employeeId));
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

function restWarnings(employeeId: string, list: readonly TimeEntry[], person: PersonWorkingTime | null): AtlWarning[] {
  const out: AtlWarning[] = [];
  const iv = intervals(list);
  if (!iv.length) return out;
  const r = workingTimeRules(iv[0].date, person?.agreement);
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

/** Demo mode only: the cookie that says whom /min-tid shows (there is no login). */
export const DEMO_PICK_COOKIE = "min_tid_som";

/** "HH:MM" in Swedish time for an instant, for clocking in and out on the server. */
export function stockholmClock(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Europe/Stockholm" }).format(now);
}

/** Swedish wall-clock date and time "YYYY-MM-DDTHH:MM:SS" (a file's Skapad stamp). */
export function stockholmDateTime(now = new Date()): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}

/** A Swedish wall-clock time "YYYY-MM-DDTHH:MM" (a datetime-local field) as an ISO instant, summer time included. */
export function stockholmLocalToIso(local: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
  if (!m) throw new RangeError(`Tiden skrivs ÅÅÅÅ-MM-DDTTT:MM, fick "${local}".`);
  const asUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
  // The offset Stockholm has at that moment: format the UTC guess there and compare.
  const offsetAt = (t: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Stockholm", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute)) - t;
  };
  const first = asUtc - offsetAt(asUtc);
  return new Date(asUtc - offsetAt(first)).toISOString();
}
