/**
 * Absence and sick periods (docs/hr-lon.md, sections 3, 5 step 2 and 11;
 * absences and sick_periods in supabase/migrations/0037_time.sql). Pure.
 *
 * The database links sick spells into sick periods (återinsjuknande within
 * five days, sick_relink()); `linkSickPeriods` is the same rule, tested
 * against the rule book. The money (sjuklön, karensavdrag, day numbers,
 * the läkarintyg day, the ten-in-twelve-months rule) is sickPay() from
 * phase 0, fed with the employment's weekly schedule (schedule_rules) and
 * the part of each day the person was sick.
 */

import { eachDay, daysBetween, type IsoDate } from "../rules/index";
import { PAYROLL_RULE_SETS, payrollRulesAt, type PayrollRuleSet } from "../rules/payroll";
import { addMonths } from "../payroll/employment-clocks";
import { scheduledHours, sickPay, type SickPayResult, type SickPeriod, type WorkSchedule } from "../payroll/sick-pay";
import { holidayName, isoWeekday, isWorkday } from "../../workdays";
import { blockHours } from "./time";

export const ABSENCE_KINDS = ["sjuk", "vab", "semester", "foraldraledig", "tjanstledig", "permission", "kompledig"] as const;
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];
export const ABSENCE_KIND_LABEL: Record<AbsenceKind, string> = {
  sjuk: "Sjuk",
  vab: "VAB",
  semester: "Semester",
  foraldraledig: "Föräldraledig",
  tjanstledig: "Tjänstledig",
  permission: "Permission",
  kompledig: "Kompledig",
};
/** What a person may report from /min-tid; the rest is agreed with the employer and entered in admin. */
export const SELF_REPORTED_KINDS: readonly AbsenceKind[] = ["sjuk", "vab", "semester", "foraldraledig", "permission", "kompledig"];

export const ABSENCE_EXTENTS = [1, 0.75, 0.5, 0.25] as const;
export type AbsenceExtent = (typeof ABSENCE_EXTENTS)[number];
export const EXTENT_LABEL: Record<AbsenceExtent, string> = { 1: "Hel dag", 0.75: "75 %", 0.5: "Halv dag", 0.25: "25 %" };

export type Absence = {
  id: string;
  employeeId: string;
  kind: AbsenceKind;
  from: IsoDate;
  /** Null: sick and not back yet. */
  to: IsoDate | null;
  extent: AbsenceExtent;
  certificateReceivedOn: IsoDate | null;
  sickPeriodId: string | null;
  note: string;
  approvedAt: string | null;
  createdAt: string;
};

/** The rule book's sick-pay rules; the law's, so a date after the last set uses the last set. */
export function sickRules(date: IsoDate): PayrollRuleSet {
  try {
    return payrollRulesAt(date);
  } catch {
    return PAYROLL_RULE_SETS[PAYROLL_RULE_SETS.length - 1];
  }
}

/* ---------- schedules ---------- */

export type ScheduleRule = { weekday: number; start: string; end: string; breakMinutes: number };

export const WEEKDAY_LABEL = ["Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag", "Söndag"] as const;
export const WEEKDAY_SHORT = ["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"] as const;

/** A weekly pattern as sickPay() and monthlyPay() take it: hours per weekday, helgdagar off. */
export function scheduleFromRules(rules: readonly ScheduleRule[]): Extract<WorkSchedule, { kind: "weekly" }> {
  const hours = [0, 0, 0, 0, 0, 0, 0] as [number, number, number, number, number, number, number];
  for (const r of rules) {
    if (r.weekday < 1 || r.weekday > 7) throw new RangeError(`Veckodag ${r.weekday} finns inte.`);
    hours[r.weekday - 1] = blockHours(r.start, r.end, r.breakMinutes);
  }
  return { kind: "weekly", hours, holidaysOff: true };
}

/** A spell's last day for counting: its end, or `asOf` while it goes on. */
export const lastDay = (a: Pick<Absence, "from" | "to">, asOf: IsoDate): IsoDate => a.to ?? (asOf > a.from ? asOf : a.from);

/* ---------- sick periods ---------- */

export type LinkedPeriod = { firstDay: IsoDate; lastDay: IsoDate | null; absenceIds: string[] };

/**
 * Sick spells into sick periods, as sick_relink() in 0037: sorted by start,
 * a spell that starts at most `relapseDays` calendar days after the last
 * day of the period so far continues it (ended the 10th, sick again by the
 * 15th: same period, no new karensavdrag); a spell after an open one, or
 * later, starts a new period.
 */
export function linkSickPeriods(spells: readonly Pick<Absence, "id" | "from" | "to">[], relapseDays: number): LinkedPeriod[] {
  const out: LinkedPeriod[] = [];
  let last: IsoDate | null = null;
  let open = false;
  for (const s of [...spells].sort((a, b) => a.from.localeCompare(b.from) || a.id.localeCompare(b.id))) {
    const current = out[out.length - 1];
    if (!current || open || daysBetween(last as IsoDate, s.from) > relapseDays) {
      out.push({ firstDay: s.from, lastDay: s.to, absenceIds: [s.id] });
      last = s.to ?? s.from;
    } else {
      current.absenceIds.push(s.id);
      last = s.to && s.to > (last as IsoDate) ? s.to : (last as IsoDate);
      current.lastDay = s.to === null ? null : last;
    }
    open = s.to === null;
  }
  return out;
}

/**
 * The hours lost each sick day: the schedule's hours for the date times the
 * part of the day the person was sick (a 50 % sjukskrivning loses half the
 * scheduled day). Returned as a schedule of dated hours for sickPay().
 */
export function sickHours(schedule: WorkSchedule, spells: readonly Pick<Absence, "from" | "to" | "extent">[], asOf: IsoDate): Extract<WorkSchedule, { kind: "shifts" }> {
  const hours: Record<IsoDate, number> = {};
  for (const s of spells) for (const d of eachDay(s.from, lastDay(s, asOf))) hours[d] = Math.round(scheduledHours(schedule, d) * s.extent * 100) / 100;
  return { kind: "shifts", hours };
}

export type SickBreakdownInput = {
  /** The person's sick absences (other kinds are ignored). */
  absences: readonly Absence[];
  /** The weekly schedule, or booked shifts for someone without one. */
  schedule: WorkSchedule;
  /** Lost pay per hour (timlön, or monthlyToHourlyOre for månadslön). */
  hourlyPayOre: number;
  /** Average weekly hours for the karensavdrag (the schedule's, or averageWeeklyHoursFromHistory). */
  averageWeeklyHours: number;
  monthlySalary: boolean;
  /** Ongoing sickness is counted to this day. */
  asOf: IsoDate;
};

export type SickBreakdownPeriod = SickPeriod & {
  /** The absences in this spell (one sickPay "period" per spell; spells that continue share firstDay). */
  absenceId: string;
  extent: AbsenceExtent;
};

export type SickBreakdown = {
  /** Per spell, in order; spells of one sick period share `firstDay`. */
  spells: SickBreakdownPeriod[];
  result: SickPayResult;
  /** Karensavdrag made in the twelve months before `asOf` (the högriskskydd counts ten). */
  waitingDeductionsLast12Months: number;
};

/**
 * Day-by-day sick pay for a person, from sickPay(): day numbers through the
 * whole period, karensavdrag once per period (not on återinsjuknande, not
 * after ten in twelve months), sjuklön days 1–14, the läkarintyg day (8)
 * and Försäkringskassan's first day (15). Partial days lose their share of
 * the scheduled hours.
 */
export function sickBreakdown(input: SickBreakdownInput): SickBreakdown {
  const spells = input.absences.filter((a) => a.kind === "sjuk").sort((a, b) => a.from.localeCompare(b.from));
  const rules = sickRules(spells[0]?.from ?? input.asOf);
  const result = sickPay({
    rules,
    spells: spells.map((s) => ({ from: s.from, to: lastDay(s, input.asOf) })),
    schedule: sickHours(input.schedule, spells, input.asOf),
    hourlyPayOre: input.hourlyPayOre,
    averageWeeklyHours: input.averageWeeklyHours,
    monthlySalary: input.monthlySalary,
    previousWaitingDeductions: [],
    codes: { sickPay: "sjuklon", waitingDeduction: "karensavdrag", sickDeduction: "sjukavdrag" },
  });
  const windowFrom = addMonths(input.asOf, -rules.sickPay.waitingDeductionWindowMonths);
  return {
    spells: result.periods.map((p, i) => ({ ...p, absenceId: spells[i].id, extent: spells[i].extent })),
    result,
    waitingDeductionsLast12Months: result.waitingDeductionDates.filter((d) => d > windowFrom && d <= input.asOf).length,
  };
}

export type CertificateDue = { employeeId: string; firstDay: IsoDate; dueFrom: IsoDate; absenceIds: string[] };

/**
 * Sick periods that have reached the läkarintyg day (8, sjuklönelagen 8 §)
 * by `asOf` without a certificate on any of their spells. Counted in
 * calendar days from the period's first day, återinsjuknande included.
 */
export function certificatesDue(absences: readonly Absence[], asOf: IsoDate): CertificateDue[] {
  const out: CertificateDue[] = [];
  const byPerson = new Map<string, Absence[]>();
  for (const a of absences) if (a.kind === "sjuk") byPerson.set(a.employeeId, [...(byPerson.get(a.employeeId) ?? []), a]);
  for (const [employeeId, list] of byPerson) {
    const rules = sickRules(list[0].from).sickPay;
    for (const p of linkSickPeriods(list, rules.relapseDays)) {
      const spells = list.filter((a) => p.absenceIds.includes(a.id)).sort((a, b) => a.from.localeCompare(b.from));
      if (spells.some((s) => s.certificateReceivedOn)) continue;
      // The calendar day that is day N of the period: count the spells' days in order.
      let n = 0;
      let dueFrom: IsoDate | null = null;
      for (const s of spells) {
        for (const d of eachDay(s.from, lastDay(s, asOf))) {
          if (d > asOf) break;
          if (++n === rules.certificateFromDay) dueFrom = d;
        }
      }
      if (dueFrom) out.push({ employeeId, firstDay: p.firstDay, dueFrom, absenceIds: p.absenceIds });
    }
  }
  return out.sort((a, b) => a.dueFrom.localeCompare(b.dueFrom));
}

/* ---------- days of absence ---------- */

/**
 * Working days an absence takes within [from, to], times its extent: the
 * scheduled days when there is a schedule, otherwise Monday–Friday that are
 * not helgdagar. Semester taken is counted this way.
 */
export function absenceWorkdays(a: Pick<Absence, "from" | "to" | "extent">, range: { from: IsoDate; to: IsoDate }, schedule: WorkSchedule | null, asOf: IsoDate): number {
  const from = a.from > range.from ? a.from : range.from;
  const end = lastDay(a, asOf);
  const to = end < range.to ? end : range.to;
  let n = 0;
  for (const d of eachDay(from, to)) if (schedule ? scheduledHours(schedule, d) > 0 : isWorkday(d)) n += 1;
  return Math.round(n * a.extent * 100) / 100;
}

/** Calendar days wholly absent (extent 1) within [from, to]; the semester calculation counts these. */
export function wholeDaysAbsent(a: Pick<Absence, "from" | "to" | "extent">, range: { from: IsoDate; to: IsoDate }, asOf: IsoDate): number {
  if (a.extent !== 1) return 0;
  const from = a.from > range.from ? a.from : range.from;
  const end = lastDay(a, asOf);
  const to = end < range.to ? end : range.to;
  return to < from ? 0 : daysBetween(from, to) + 1;
}

/** Short day label for calendars: "Mån 3". */
export const dayLabel = (d: IsoDate) => `${["Mån", "Tis", "Ons", "Tor", "Fre", "Lör", "Sön"][isoWeekday(d) - 1]} ${Number(d.slice(8))}${holidayName(d) ? " *" : ""}`;
