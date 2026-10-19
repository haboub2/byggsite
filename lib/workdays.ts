/**
 * The working-day calendar behind Tidplan 2.0 (docs/kundportal-v3.md, 1).
 * Pure and safe on client and server: dates are "YYYY-MM-DD" strings, read
 * as calendar days with no time zone, and arithmetic runs in UTC so DST
 * never moves a day.
 *
 * Durations are working days in half-day steps (0,5). Internally everything
 * counts half days ("slots"): a working day has a morning and an afternoon
 * slot, so two half-day phases can share one day. Weekends and Swedish
 * public holidays are skipped; a project can opt in to Saturdays, but never
 * a holiday that falls on one.
 */

export type WorkCalendar = { saturdays?: boolean };

const DAY_MS = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "2026-10-19" → epoch ms at UTC midnight, or NaN. */
function toMs(date: string): number {
  const m = ISO.exec(date);
  if (!m) return NaN;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Reject 2026-02-31 and friends instead of rolling over.
  return new Date(ms).toISOString().slice(0, 10) === date ? ms : NaN;
}
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(toMs(value));
}

/** The date `n` calendar days after `date` (negative goes back). */
export function addDays(date: string, n: number): string {
  return fromMs(toMs(date) + n * DAY_MS);
}

/** 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  const d = new Date(toMs(date)).getUTCDay();
  return d === 0 ? 7 : d;
}

/* ---------- Swedish public holidays ---------- */

/** Easter Sunday (Gregorian, the anonymous / Meeus algorithm). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** The first date from `from` (inclusive) that falls on `weekday` (1–7). */
function firstWeekdayFrom(from: string, weekday: number): string {
  return addDays(from, (weekday - isoWeekday(from) + 7) % 7);
}

const holidayCache = new Map<number, Map<string, string>>();

/**
 * The days off in a year, date → name. The official red days, plus the
 * eves that the trade treats as holidays (påskafton, midsommarafton,
 * julafton, nyårsafton). Sundays are listed too even though the weekend
 * already skips them, so `holidayName` can name them.
 */
export function swedishHolidays(year: number): Map<string, string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const y = String(year);
  const easter = easterSunday(year);
  const midsummerEve = firstWeekdayFrom(`${y}-06-19`, 5);
  const allSaints = firstWeekdayFrom(`${y}-10-31`, 6);
  const days: [string, string][] = [
    [`${y}-01-01`, "Nyårsdagen"],
    [`${y}-01-06`, "Trettondedag jul"],
    [addDays(easter, -2), "Långfredagen"],
    [addDays(easter, -1), "Påskafton"],
    [easter, "Påskdagen"],
    [addDays(easter, 1), "Annandag påsk"],
    [`${y}-05-01`, "Första maj"],
    [addDays(easter, 39), "Kristi himmelsfärdsdag"],
    [addDays(easter, 49), "Pingstdagen"],
    [`${y}-06-06`, "Sveriges nationaldag"],
    [midsummerEve, "Midsommarafton"],
    [addDays(midsummerEve, 1), "Midsommardagen"],
    [allSaints, "Alla helgons dag"],
    [`${y}-12-24`, "Julafton"],
    [`${y}-12-25`, "Juldagen"],
    [`${y}-12-26`, "Annandag jul"],
    [`${y}-12-31`, "Nyårsafton"],
  ];
  const map = new Map<string, string>();
  // Two names can share a day (Kristi himmelsfärd on 1 May in 2008,
  // Pingstdagen on 6 June in 2027): keep the first.
  for (const [d, name] of days) if (!map.has(d)) map.set(d, name);
  holidayCache.set(year, map);
  return map;
}

export function holidayName(date: string): string | null {
  return swedishHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}

/** A day the team works: Monday–Friday (and Saturday if the project says so), never a holiday. */
export function isWorkday(date: string, cal: WorkCalendar = {}): boolean {
  const wd = isoWeekday(date);
  if (wd === 7 || (wd === 6 && !cal.saturdays)) return false;
  return !holidayName(date);
}

/** `date` itself if it is a working day, else the next one. */
export function nextWorkday(date: string, cal: WorkCalendar = {}): string {
  let d = date;
  for (let guard = 0; !isWorkday(d, cal); guard++) {
    if (guard > 30) throw new Error(`Hittar ingen arbetsdag efter ${date}.`);
    d = addDays(d, 1);
  }
  return d;
}

/** `date` itself if it is a working day, else the previous one. */
export function previousWorkday(date: string, cal: WorkCalendar = {}): string {
  let d = date;
  for (let guard = 0; !isWorkday(d, cal); guard++) {
    if (guard > 30) throw new Error(`Hittar ingen arbetsdag före ${date}.`);
    d = addDays(d, -1);
  }
  return d;
}

/**
 * Move `n` whole working days from `date` (negative goes back). The start
 * is first snapped to a working day in the direction of travel, so
 * shiftWorkdays(friday, 1) is the next Monday and shiftWorkdays(saturday, 0)
 * is that Monday.
 */
export function shiftWorkdays(date: string, n: number, cal: WorkCalendar = {}): string {
  const step = n < 0 ? -1 : 1;
  let d = step > 0 ? nextWorkday(date, cal) : previousWorkday(date, cal);
  for (let left = Math.abs(Math.trunc(n)); left > 0; ) {
    d = addDays(d, step);
    if (isWorkday(d, cal)) left--;
  }
  return d;
}

/** Working days from `from` up to but not including `to` (negative if `to` is earlier). */
export function workdaysBetween(from: string, to: string, cal: WorkCalendar = {}): number {
  if (from === to) return 0;
  const [a, b, sign] = from < to ? [from, to, 1] : [to, from, -1];
  let count = 0;
  for (let d = a; d < b; d = addDays(d, 1)) if (isWorkday(d, cal)) count++;
  return sign * count;
}

/* ---------- half days ---------- */

/** Round to the nearest half day, never below 0. NaN becomes 0. */
export function roundHalf(days: number): number {
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.round(days * 2) / 2;
}

/** Days → slots (half days). */
export const toHalves = (days: number) => Math.round(roundHalf(days) * 2);

/** The calendar date of slot `slot`, counted from the first working day on or after `start`. */
export function slotDate(start: string, slot: number, cal: WorkCalendar = {}): string {
  return shiftWorkdays(nextWorkday(start, cal), Math.floor(slot / 2), cal);
}

export type ScheduledSpan = {
  starts_on: string;
  ends_on: string;
  /** First slot (half day) the span occupies, from the project start. */
  startSlot: number;
  /** Slots it occupies; 0 for a milestone. */
  halves: number;
  /** Starts at noon rather than in the morning. */
  startsAfternoon: boolean;
  /** Ends at noon rather than at the end of the day. */
  endsAtNoon: boolean;
};

/**
 * Lay durations end to end from `start`. Each span begins in the slot after
 * the previous one ends, so 0,5 + 0,5 share a day and 1,5 + 1 runs to noon
 * on day two and then continues that afternoon. A 0-day span is a milestone
 * on the date of the next free slot.
 */
export function schedule(start: string, durations: number[], cal: WorkCalendar = {}): { spans: ScheduledSpan[]; ends_on: string } {
  if (!isIsoDate(start)) throw new Error(`Ogiltigt startdatum: ${start}`);
  // Walk once instead of recomputing from the start for every slot.
  const first = nextWorkday(start, cal);
  const dayCache: string[] = [first];
  const dayOf = (slot: number) => {
    const i = Math.floor(slot / 2);
    while (dayCache.length <= i) dayCache.push(shiftWorkdays(dayCache[dayCache.length - 1], 1, cal));
    return dayCache[i];
  };
  let slot = 0;
  const spans = durations.map((days) => {
    const halves = toHalves(days);
    const last = halves > 0 ? slot + halves - 1 : slot;
    const span: ScheduledSpan = {
      starts_on: dayOf(slot),
      ends_on: dayOf(last),
      startSlot: slot,
      halves,
      startsAfternoon: slot % 2 === 1,
      endsAtNoon: halves > 0 && last % 2 === 0,
    };
    slot += halves;
    return span;
  });
  // The project ends on the day of its last occupied slot (or the start if empty).
  const ends_on = slot > 0 ? dayOf(slot - 1) : first;
  return { spans, ends_on };
}

/* ---------- words ---------- */

/** "0,5 dag", "1 dag", "2,5 dagar". */
export function formatDays(days: number): string {
  const d = roundHalf(Math.abs(days));
  const n = Number.isInteger(d) ? String(d) : String(d).replace(".", ",");
  return `${n} ${d <= 1 ? "dag" : "dagar"}`;
}
