import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollRulesAt } from "../rules/payroll";
import { hourlyPay } from "../payroll/time-to-pay";
import { addDays } from "../rules/index";
import { atlWarnings, blockHours, currentEntries, isoWeek, monthDates, netHours, overtimeJournal, sumByDay, toWorkBlocks, weekDates, weekStart, weekSums, type TimeEntry } from "./time";

let n = 0;
const entry = (over: Partial<TimeEntry>): TimeEntry => ({
  id: `e${++n}`,
  employeeId: "erik",
  workDate: "2026-10-19",
  start: "07:00",
  end: "16:00",
  breakMinutes: 60,
  hours: 8,
  kind: "work",
  overtimeKind: null,
  projectId: "p1",
  shiftId: null,
  note: "",
  source: "manual",
  status: "approved",
  correctsId: null,
  submittedAt: null,
  approvedBy: null,
  approvedAt: null,
  createdAt: "",
  ...over,
});

test("hours from clock times: break taken off, past midnight wraps", () => {
  assert.equal(blockHours("07:00", "16:00", 60), 8);
  assert.equal(blockHours("22:00", "06:00", 30), 7.5);
  assert.equal(blockHours("07:00:00", "07:00:00"), 24);
  assert.equal(blockHours("06:45", "15:05", 40), 7.67);
});

test("a correction: the reversal and the original drop out of the blocks, the net is the replacement", () => {
  const original = entry({ id: "a" });
  const reversal = entry({ id: "r", correctsId: "a", hours: -8, start: null, end: null, breakMinutes: 0 });
  const replacement = entry({ id: "b", correctsId: "a", end: "15:00", hours: 7 });
  const all = [original, reversal, replacement];
  assert.deepEqual(currentEntries(all).map((e) => e.id), ["b"]);
  assert.equal(netHours(all), 7);
  // Before the correction is approved, the original still counts.
  const pending = [original, { ...reversal, status: "submitted" as const }, { ...replacement, status: "submitted" as const }];
  assert.deepEqual(currentEntries(pending).map((e) => e.id), ["a"]);
  assert.equal(netHours(pending), 8);
  assert.equal(netHours(pending, ["approved", "submitted"]), 7);
});

test("work blocks for hourlyPay: break at the end, övertid flagged, rows without times and restid apart", () => {
  const rows = [
    entry({ workDate: "2026-10-19" }),
    entry({ workDate: "2026-10-20", start: "16:00", end: "19:00", breakMinutes: 0, hours: 3, kind: "overtime" }),
    entry({ workDate: "2026-10-21", start: null, end: null, breakMinutes: 0, hours: 6 }),
    entry({ workDate: "2026-10-21", start: null, end: null, breakMinutes: 0, hours: 1.5, kind: "travel" }),
    entry({ workDate: "2026-10-22", status: "submitted" }),
  ];
  const r = toWorkBlocks(rows);
  assert.deepEqual(r.blocks, [
    { date: "2026-10-19", start: "07:00", end: "15:00" },
    { date: "2026-10-20", start: "16:00", end: "19:00", overtime: true },
  ]);
  assert.deepEqual(r.untimed, [{ date: "2026-10-21", hours: 6, overtime: false }]);
  assert.deepEqual(r.other, [{ date: "2026-10-21", hours: 1.5, kind: "travel" }]);
  // The calculator takes them as they are: 8 base hours, 3 övertid hours in Byggavtalet's first band.
  const pay = hourlyPay({ agreement: payrollRulesAt("2026-10-19").agreements.byggavtalet, hourlyRateOre: 20_000, blocks: r.blocks, codes: { base: "1", ob: "2", overtime: "3" } });
  assert.equal(pay.baseHours, 8);
  assert.equal(Object.values(pay.overtimeHours).reduce((a, b) => a + b, 0), 3);
});

test("week and month: ISO week 43 starts Monday 19 October; sums per day and kind", () => {
  assert.equal(weekStart("2026-10-25"), "2026-10-19");
  assert.deepEqual(isoWeek("2026-10-19"), { year: 2026, week: 43 });
  assert.deepEqual(isoWeek("2027-01-01"), { year: 2026, week: 53 });
  assert.equal(weekDates("2026-10-19")[6], "2026-10-25");
  assert.equal(monthDates("2026-02").length, 28);
  const rows = [entry({}), entry({ workDate: "2026-10-20" }), entry({ workDate: "2026-10-20", start: null, end: null, hours: 1, kind: "travel" }), entry({ workDate: "2026-10-26" })];
  const w = weekSums(rows, "2026-10-19");
  assert.equal(w.total, 17);
  assert.equal(w.work, 16);
  assert.equal(w.travel, 1);
  assert.equal(sumByDay(rows).get("2026-10-20")?.total, 9);
});

/** Övertid of `hours` on each of `count` working days from `from`. */
function overtimeDays(from: string, count: number, hours: number): TimeEntry[] {
  const out: TimeEntry[] = [];
  for (let d = from; out.length < count; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd === 0 || wd === 6) continue;
    out.push(entry({ workDate: d, start: "16:00", end: `${String(16 + hours).padStart(2, "0")}:00`, breakMinutes: 0, hours, kind: "overtime" }));
  }
  return out;
}

test("ATL övertid: 48 h in four weeks, 50 h in the month, 200 h in the year, each warned once", () => {
  // 3 h on each weekday from 2 November: the 17th weekday (24 Nov) brings 51 h, past both 48 h in 28 days and 50 h in the month.
  const nov = overtimeDays("2026-11-02", 20, 3);
  const w = atlWarnings(nov).filter((x) => x.code.startsWith("overtime"));
  assert.deepEqual(w.map((x) => [x.code, x.date, x.value]), [
    ["overtime-4-weeks", "2026-11-24", 51],
    ["overtime-month", "2026-11-24", 51],
  ]);
  // 70 weekdays of 3 h from January = 210 h; the year passes 200 h on day 67.
  const year = overtimeDays("2026-01-05", 70, 3);
  const y = atlWarnings(year).filter((x) => x.code === "overtime-year");
  assert.equal(y.length, 1);
  assert.equal(y[0].value, 201);
});

test("ATL dygnsvila: back again the same evening leaves less than 11 h; a normal week does not warn", () => {
  const normal = [0, 1, 2, 3, 4].map((i) => entry({ workDate: addDays("2026-10-19", i) }));
  assert.deepEqual(atlWarnings(normal), []);
  const evening = [...normal, entry({ workDate: "2026-10-20", start: "20:00", end: "23:00", breakMinutes: 0, hours: 3 })];
  const w = atlWarnings(evening);
  assert.deepEqual(w.map((x) => [x.code, x.date]), [["daily-rest", "2026-10-20"]]);
  // A night shift 22–06 followed by a day shift at 14 the same day: 8 h rest (and the 8 h shift had no break, 15 §).
  const night = [entry({ workDate: "2026-10-21", start: "22:00", end: "06:00", breakMinutes: 0, hours: 8 }), entry({ workDate: "2026-10-22", start: "14:00", end: "18:00", breakMinutes: 0, hours: 4 })];
  assert.deepEqual(atlWarnings(night).map((x) => x.code), ["break-missing", "daily-rest"]);
});

test("ATL veckovila: seven days in a row without 36 h off warns for that week", () => {
  const days = Array.from({ length: 15 }, (_, i) => entry({ workDate: addDays("2026-10-12", i) }));
  const w = atlWarnings(days, { from: "2026-10-19", to: "2026-10-25" });
  assert.deepEqual(w.map((x) => [x.code, x.date]), [["weekly-rest", "2026-10-19"]]);
  assert.match(w[0].message, /Vecka 43/);
});

test("Swedish wall-clock time to an instant: winter +01, summer +02", async () => {
  const { stockholmLocalToIso } = await import("./time");
  assert.equal(stockholmLocalToIso("2026-11-05T18:00"), "2026-11-05T17:00:00.000Z");
  assert.equal(stockholmLocalToIso("2026-07-01T07:30"), "2026-07-01T05:30:00.000Z");
});

/* ---------- arbetstidslagen: contract hours, mertid, jour, 48 h average, rast, nattarbete, the journal ---------- */

const fullTime = { weeklyHours: 40, schedule: null };
const partTime = { weeklyHours: 30, schedule: null };
const week = (monday: string, hoursPerDay: number, over: Partial<TimeEntry> = {}) =>
  [0, 1, 2, 3, 4].map((i) => entry({ workDate: addDays(monday, i), start: "07:00", end: `${String(7 + hoursPerDay + 1).padStart(2, "0")}:00`, breakMinutes: 60, hours: hoursPerDay, ...over }));

test("ATL 7 §: hours above the contract count as övertid though the rows say Arbete; a part-timer's are mertid up to full time (10 §)", () => {
  // 10 h a day, five days = 50 h on a 40 h contract: 10 h unlabelled övertid.
  const w = atlWarnings(week("2026-10-19", 10), { people: new Map([["erik", fullTime]]) });
  const derived = w.find((x) => x.code === "overtime-derived")!;
  assert.deepEqual([derived.date, derived.value, derived.limit], ["2026-10-23", 50, 40]);
  assert.match(derived.message, /10 h övertid/);
  // The same week on a 30 h contract: 10 h mertid up to 40, then 10 h övertid.
  const part = atlWarnings(week("2026-10-19", 10), { people: new Map([["erik", partTime]]) }).find((x) => x.code === "overtime-derived")!;
  assert.match(part.message, /10 h övertid och 10 h mertid/);
  // Without the person nothing is derived; labelled rows are what they are.
  assert.equal(atlWarnings(week("2026-10-19", 10)).filter((x) => x.code === "overtime-derived").length, 0);
  // Rows already labelled övertid are not derived again.
  const labelled = [...week("2026-10-19", 8), entry({ workDate: "2026-10-24", start: "08:00", end: "18:00", breakMinutes: 0, hours: 10, kind: "overtime", overtimeKind: "allman" })];
  assert.equal(atlWarnings(labelled, { people: new Map([["erik", fullTime]]) }).filter((x) => x.code === "overtime-derived").length, 0);
});

test("ATL 8 a, 9, 10 §§: 350 h with extra övertid, nödfallsövertid outside the limits, mertid 200 h, jourtid 48 h in four weeks", () => {
  // 88 weekdays × 4 h övertid = 352 h: over 200 (allmän) and over 350 (with extra).
  const days = Array.from({ length: 88 }, (_, i) => entry({ workDate: addDays("2026-01-05", Math.floor(i / 5) * 7 + (i % 5)), start: "16:00", end: "20:00", breakMinutes: 0, hours: 4, kind: "overtime", overtimeKind: "allman" }));
  const codes = atlWarnings(days).map((x) => x.code);
  assert.ok(codes.includes("overtime-year"));
  assert.ok(codes.includes("overtime-year-extra"));
  // Nödfallsövertid is not counted against 8 §.
  const emergency = days.map((e) => ({ ...e, overtimeKind: "nodfall" as const }));
  assert.equal(atlWarnings(emergency).filter((x) => x.code.startsWith("overtime")).length, 0);
  // Mertid: 51 weekdays × 4 h = 204 h.
  const mertid = Array.from({ length: 51 }, (_, i) => entry({ workDate: addDays("2026-01-05", Math.floor(i / 5) * 7 + (i % 5)), start: "16:00", end: "20:00", breakMinutes: 0, hours: 4, kind: "mertid" }));
  const m = atlWarnings(mertid).filter((x) => x.code === "mertid-year");
  assert.equal(m.length, 1);
  assert.equal(m[0].value, 204);
  // Jourtid: 13 days × 4 h = 52 h inside four weeks.
  const jour = Array.from({ length: 13 }, (_, i) => entry({ workDate: addDays("2026-03-02", i), start: "18:00", end: "22:00", breakMinutes: 0, hours: 4, kind: "jour" }));
  assert.deepEqual(atlWarnings(jour).map((x) => x.code), ["jour-4-weeks", "jour-month"]);
});

test("ATL 10 b §: more than 48 h a week on average over the reference period warns once, sick days counted as worked", () => {
  // Nine weeks of 55 h (11 h a day): average 55 > 48.
  const heavy = Array.from({ length: 9 }, (_, i) => week(addDays("2026-01-05", i * 7), 11)).flat();
  const w = atlWarnings(heavy, { people: new Map([["erik", fullTime]]) }).filter((x) => x.code === "average-48");
  assert.equal(w.length, 1);
  assert.equal(w[0].value, 55);
  // A 40 h week plus a week sick: the sick week counts as 40 h, average 40.
  const normal = week("2026-01-05", 8);
  const sick = [{ employeeId: "erik", kind: "sjuk" as const, from: "2026-01-12", to: "2026-01-16", extent: 1 as const }];
  assert.equal(atlWarnings([...normal, ...week("2026-01-19", 8)], { people: new Map([["erik", fullTime]]), absences: sick }).filter((x) => x.code === "average-48").length, 0);
});

test("ATL 15 § and 13 a §: five hours without a break, and a long day with three hours or more at night", () => {
  const noBreak = atlWarnings([entry({ start: "07:00", end: "13:00", breakMinutes: 0, hours: 6 })]).filter((x) => x.code === "break-missing");
  assert.equal(noBreak.length, 1);
  assert.equal(noBreak[0].value, 6);
  assert.equal(atlWarnings([entry({ start: "07:00", end: "12:00", breakMinutes: 0, hours: 5 })]).filter((x) => x.code === "break-missing").length, 0);
  assert.equal(atlWarnings([entry({ start: "07:00", end: "16:00", breakMinutes: 30, hours: 8.5 })]).filter((x) => x.code === "break-missing").length, 0);
  // 20–06 with a break: 9 h on the day, 8 of them in the night.
  const night = atlWarnings([entry({ workDate: "2026-10-19", start: "20:00", end: "06:00", breakMinutes: 60, hours: 9 })]).filter((x) => x.code === "night-work");
  assert.equal(night.length, 1);
  assert.match(night[0].message, /13 a §/);
  // An evening until 23 is not night work in that sense.
  assert.equal(atlWarnings([entry({ workDate: "2026-10-19", start: "14:00", end: "23:00", breakMinutes: 0, hours: 9 })]).filter((x) => x.code === "night-work").length, 0);
});

test("ATL 11 §: the journal per month and year, with unlabelled hours above the contract as derived övertid and mertid", () => {
  const rows = [
    ...week("2026-02-02", 10), // 50 h on a 30 h contract: 10 mertid + 10 övertid derived, 30 ordinary
    entry({ workDate: "2026-03-03", start: "16:00", end: "19:00", breakMinutes: 0, hours: 3, kind: "overtime", overtimeKind: "extra" }),
    entry({ workDate: "2026-03-04", start: "16:00", end: "18:00", breakMinutes: 0, hours: 2, kind: "overtime", overtimeKind: "nodfall" }),
    entry({ workDate: "2026-03-05", start: "18:00", end: "22:00", breakMinutes: 0, hours: 4, kind: "jour" }),
    entry({ workDate: "2025-12-30", start: "07:00", end: "16:00", breakMinutes: 60, hours: 8 }), // last year
  ];
  const [j] = overtimeJournal(rows, { year: 2026, people: new Map([["erik", partTime]]) });
  assert.equal(j.employeeId, "erik");
  assert.deepEqual(j.months.map((m) => m.month), ["2026-02", "2026-03"]);
  assert.deepEqual(j.months[0], { employeeId: "erik", month: "2026-02", ordinaryHours: 30, overtime: { allman: 0, extra: 0, nodfall: 0, derived: 10 }, mertid: { labelled: 0, derived: 10 }, jourHours: 0 });
  assert.deepEqual(j.months[1].overtime, { allman: 0, extra: 3, nodfall: 2, derived: 0 });
  assert.equal(j.months[1].jourHours, 4);
  assert.deepEqual([j.overtimeHours, j.nodfallHours, j.mertidHours, j.jourHours, j.overtimeLimit, j.extraOvertimeLimit, j.mertidLimit], [13, 2, 10, 4, 200, 350, 200]);
  // Drafts and submitted rows are not in the record.
  assert.equal(overtimeJournal(rows.map((e) => ({ ...e, status: "submitted" as const })), { year: 2026 }).length, 0);
});
