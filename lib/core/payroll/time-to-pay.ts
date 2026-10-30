/**
 * Approved time to pay lines (docs/hr-lon.md, section 5 step 1). Hourly
 * pay: base hours, OB per band and övertid per band, the bands taken from
 * the agreement in the rule book. Monthly pay: the salary, less unpaid
 * absence by arbetsdagsavdrag or kalenderdagsavdrag as the agreement says.
 *
 * Time blocks are what was actually worked: a break is a gap between two
 * blocks. A block ending at or before its start runs past midnight, and
 * each minute is classified by its own date (Friday 22–02 is two hours of
 * Friday night and two of Saturday).
 */

import { fractionOf, lineAmount, rateOf, sumOre, type Ore } from "../money";
import { addDays, type IsoDate } from "../rules/index";
import type { AgreementRules, DayKind, TimeBand } from "../rules/payroll";
import { holidayName, isoWeekday, isWorkday } from "../../workdays";
import type { PayLineInput } from "./payslip";
import { scheduledHours, type WorkSchedule } from "./sick-pay";

export type WorkBlock = {
  date: IsoDate;
  start: string;
  end: string;
  /** Approved as övertid (beyond the schedule). Övertid is never also paid OB. */
  overtime?: boolean;
};

export function dayKind(date: IsoDate): DayKind {
  if (holidayName(date)) return "holiday";
  const wd = isoWeekday(date);
  return wd === 6 ? "saturday" : wd === 7 ? "sunday" : "weekday";
}

function minutesOf(hhmm: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m || Number(m[1]) > 24 || Number(m[2]) > 59) throw new RangeError(`Tid skrivs TT:MM, fick "${hhmm}".`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** One band per code, in the agreement's order (a code may cover several day/time ranges at one rate). */
function firstOfEachCode(bands: readonly TimeBand[]): TimeBand[] {
  const seen = new Set<string>();
  return bands.filter((b) => !seen.has(b.code) && seen.add(b.code));
}

type CompiledBand = { band: TimeBand; from: number; to: number };
const compiled = new WeakMap<readonly TimeBand[], CompiledBand[]>();

/** The bands with their times parsed once per agreement, not once per worked minute. */
function compile(bands: readonly TimeBand[]): CompiledBand[] {
  let list = compiled.get(bands);
  if (!list) {
    list = bands.map((band) => ({ band, from: minutesOf(band.from), to: minutesOf(band.to) }));
    compiled.set(bands, list);
  }
  return list;
}

/** The band (highest percent, or lowest divisor, if several match) for one minute, or null. */
function bandAt(bands: readonly TimeBand[], kind: DayKind, minute: number): TimeBand | null {
  let best: TimeBand | null = null;
  for (const { band: b, from, to } of compile(bands)) {
    if (!b.days.includes(kind)) continue;
    const inside = from < to ? minute >= from && minute < to : minute >= from || minute < to;
    const better = !best || (b.percent ?? 0) > (best.percent ?? 0) || (b.monthlyDivisor ?? Infinity) < (best.monthlyDivisor ?? Infinity);
    if (inside && better) best = b;
  }
  return best;
}

/** Each worked minute of a block as [date, minute of day]. */
function* minutes(block: WorkBlock): Generator<[IsoDate, number]> {
  const start = minutesOf(block.start);
  let end = minutesOf(block.end);
  if (end <= start) end += 24 * 60;
  for (let m = start; m < end; m++) yield m < 24 * 60 ? [block.date, m] : [addDays(block.date, 1), m - 24 * 60];
}

const hours = (mins: number) => Number((mins / 60).toFixed(4));

export type HourlyPayInput = {
  agreement: AgreementRules;
  hourlyRateOre: Ore;
  blocks: readonly WorkBlock[];
  codes: { base: string; ob: string; overtime: string };
};

export type HourlyPayResult = {
  lines: PayLineInput[];
  baseHours: number;
  obHours: Record<string, number>;
  overtimeHours: Record<string, number>;
};

export function hourlyPay(input: HourlyPayInput): HourlyPayResult {
  const { agreement, hourlyRateOre } = input;
  let baseMinutes = 0;
  const obMinutes = new Map<string, number>();
  const overtimeMinutes = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string) => map.set(key, (map.get(key) ?? 0) + 1);

  for (const block of input.blocks) {
    for (const [date, minute] of minutes(block)) {
      const kind = dayKind(date);
      if (block.overtime) {
        const band = bandAt(agreement.overtime, kind, minute);
        if (!band) throw new Error(`${agreement.name} har inget övertidsband för ${date} kl. ${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}.`);
        bump(overtimeMinutes, band.code);
        if (agreement.obOnOvertime) {
          const ob = bandAt(agreement.ob, kind, minute);
          if (ob) bump(obMinutes, ob.code);
        }
      } else {
        baseMinutes++;
        const ob = bandAt(agreement.ob, kind, minute);
        if (ob) bump(obMinutes, ob.code);
      }
    }
  }

  const lines: PayLineInput[] = [];
  if (baseMinutes) {
    lines.push({ code: input.codes.base, text: "Timlön", quantity: hours(baseMinutes), unit: "h", unitPriceOre: hourlyRateOre, basisOre: null, ratePercent: null, amountOre: lineAmount(hourlyRateOre, baseMinutes / 60) });
  }
  for (const band of firstOfEachCode(agreement.ob)) {
    const mins = obMinutes.get(band.code);
    if (!mins) continue;
    const pct = percentOf(band, agreement);
    const unit = rateOf(hourlyRateOre, pct);
    lines.push({ code: input.codes.ob, text: `OB ${band.code} ${pct} %`, quantity: hours(mins), unit: "h", unitPriceOre: unit, basisOre: hourlyRateOre, ratePercent: pct, amountOre: lineAmount(unit, mins / 60) });
  }
  for (const band of firstOfEachCode(agreement.overtime)) {
    const mins = overtimeMinutes.get(band.code);
    if (!mins) continue;
    const pct = percentOf(band, agreement);
    const unit = (agreement.overtimeIncludesBase ? hourlyRateOre : 0) + rateOf(hourlyRateOre, pct);
    lines.push({ code: input.codes.overtime, text: `Övertid ${band.code} ${pct} %`, quantity: hours(mins), unit: "h", unitPriceOre: unit, basisOre: hourlyRateOre, ratePercent: pct, amountOre: lineAmount(unit, mins / 60) });
  }
  const toHours = (m: Map<string, number>) => Object.fromEntries([...m].map(([k, v]) => [k, hours(v)]));
  return { lines, baseHours: hours(baseMinutes), obHours: toHours(obMinutes), overtimeHours: toHours(overtimeMinutes) };
}

/** A band's percent, refusing bands that are priced by a monthly divisor. */
function percentOf(band: TimeBand, agreement: AgreementRules): number {
  if (band.percent === null) throw new Error(`${agreement.name}: bandet ${band.code} ersätts per månadslön, inte i procent av timlön.`);
  return band.percent;
}

/** Unpaid absence on monthly salary: whole days, or hours on a single day. */
export type UnpaidAbsence = { from: IsoDate; to: IsoDate; hours?: number; text?: string };

export type MonthlyPayInput = {
  agreement: AgreementRules;
  monthlySalaryOre: Ore;
  /** Unpaid absence in the month (tjänstledighet); the salary is already the part-time salary if any. */
  absences: readonly UnpaidAbsence[];
  /** The employee's schedule: working days are the scheduled ones. Without it, the national calendar (Mon–Fri, not helgdag). */
  schedule?: WorkSchedule;
  codes: { salary: string; deduction: string };
  text?: string;
};

export type MonthlyPayResult = { lines: PayLineInput[]; deductionOre: Ore };

/**
 * The month's salary and deductions for unpaid absence. A spell of at most
 * `workdayMethodMaxDays` working days is deducted per working day
 * (månadslön / workdayDivisor) or per hour (månadslön / hourDivisor); a
 * longer spell per calendar day (månadslön × 12 / 365).
 *
 * Working days are the employee's scheduled days when `schedule` is given;
 * a weekly schedule with fewer days than a full week also scales the
 * divisor (Mon–Wed: månadslön / (3 × 21 / 5)). Without a schedule the
 * national calendar is used, which is right only for full-time Mon–Fri.
 */
export function monthlyPay(input: MonthlyPayInput): MonthlyPayResult {
  const { agreement, monthlySalaryOre } = input;
  const d = agreement.absenceDeduction;
  const lines: PayLineInput[] = [
    { code: input.codes.salary, text: input.text ?? "Månadslön", quantity: 1, unit: "mån", unitPriceOre: monthlySalaryOre, basisOre: null, ratePercent: null, amountOre: monthlySalaryOre },
  ];
  if (!input.absences.length) return { lines, deductionOre: 0 };
  if (!d) throw new Error(`${agreement.name}: löneavdrag vid tjänstledighet för månadslön finns inte i regelboken.`);
  const schedule = input.schedule;
  const weekDays = schedule?.kind === "weekly" ? Math.min(d.fullWeekDays, schedule.hours.filter((h) => h > 0).length) || d.fullWeekDays : d.fullWeekDays;
  for (const a of input.absences) {
    const label = a.text ?? "Tjänstledig";
    if (a.hours !== undefined) {
      if (a.from !== a.to) throw new RangeError("Frånvaro i timmar gäller en dag.");
      const unit = fractionOf(monthlySalaryOre, 1, d.hourDivisor);
      lines.push({ code: input.codes.deduction, text: `${label} ${a.from}`, quantity: a.hours, unit: "h", unitPriceOre: -unit, basisOre: monthlySalaryOre, ratePercent: null, amountOre: -lineAmount(unit, a.hours), from: a.from, to: a.to });
      continue;
    }
    let workdays = 0;
    let calendarDays = 0;
    for (let day = a.from; day <= a.to; day = addDays(day, 1)) {
      calendarDays++;
      if (schedule ? scheduledHours(schedule, day) > 0 : isWorkday(day)) workdays++;
    }
    if (workdays <= d.workdayMethodMaxDays) {
      const unit = fractionOf(monthlySalaryOre, d.fullWeekDays, d.workdayDivisor * weekDays);
      lines.push({ code: input.codes.deduction, text: `${label} ${a.from}–${a.to}, arbetsdagsavdrag`, quantity: workdays, unit: "dag", unitPriceOre: -unit, basisOre: monthlySalaryOre, ratePercent: null, amountOre: -unit * workdays, from: a.from, to: a.to });
    } else {
      const amount = fractionOf(monthlySalaryOre, d.calendarDayNumerator * calendarDays, d.calendarDayDenominator);
      const unit = fractionOf(monthlySalaryOre, d.calendarDayNumerator, d.calendarDayDenominator);
      lines.push({ code: input.codes.deduction, text: `${label} ${a.from}–${a.to}, kalenderdagsavdrag`, quantity: calendarDays, unit: "dag", unitPriceOre: -unit, basisOre: monthlySalaryOre, ratePercent: null, amountOre: -amount, from: a.from, to: a.to });
    }
  }
  return { lines, deductionOre: -sumOre(lines.slice(1).map((l) => l.amountOre)) };
}

export type MonthlyOvertimeInput = {
  agreement: AgreementRules;
  monthlySalaryOre: Ore;
  blocks: readonly WorkBlock[];
  code: string;
};

/**
 * Övertid on monthly salary where the agreement prices an hour as
 * månadslön / divisor (Tjänstemannaavtalet: /94 weekdays 06–20, /72
 * otherwise). Bands priced in percent use `hourlyPay` with the agreement's
 * hourly conversion instead.
 */
export function monthlyOvertime(input: MonthlyOvertimeInput): PayLineInput[] {
  const { agreement } = input;
  const minutesByCode = new Map<string, number>();
  for (const block of input.blocks) {
    for (const [date, minute] of minutes({ ...block, overtime: true })) {
      const band = bandAt(agreement.overtime, dayKind(date), minute);
      if (!band) throw new Error(`${agreement.name} har inget övertidsband för ${date}.`);
      minutesByCode.set(band.code, (minutesByCode.get(band.code) ?? 0) + 1);
    }
  }
  const lines: PayLineInput[] = [];
  for (const band of firstOfEachCode(agreement.overtime)) {
    const mins = minutesByCode.get(band.code);
    if (!mins) continue;
    if (band.monthlyDivisor === null) throw new Error(`${agreement.name}: bandet ${band.code} ersätts i procent, inte per månadslön.`);
    const unit = fractionOf(input.monthlySalaryOre, 1, band.monthlyDivisor);
    lines.push({ code: input.code, text: `Övertid ${band.label}, månadslön/${band.monthlyDivisor}`, quantity: hours(mins), unit: "h", unitPriceOre: unit, basisOre: input.monthlySalaryOre, ratePercent: null, amountOre: lineAmount(unit, mins / 60) });
  }
  return lines;
}

/**
 * Arbetstidsförkortning earned for days employed in the intjänandeår, as a
 * rate per day (Byggavtalet § 4 p. 7.1: 40 h × days / 365, rounded to a
 * whole hour on 31 March). Returns hours or days as the agreement counts.
 */
export function atfAccrual(agreement: AgreementRules, employedDays: number, options: { roundToWhole?: boolean } = {}): { hours: number | null; days: number | null } {
  const accrue = (perYear: number | null) => {
    if (perYear === null) return null;
    const value = (perYear * employedDays) / 365;
    return options.roundToWhole ? Math.round(value) : Number(value.toFixed(4));
  };
  return { hours: accrue(agreement.atf.hoursPerYear), days: accrue(agreement.atf.daysPerYear) };
}
