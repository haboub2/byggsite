import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollRulesAt } from "../rules/payroll";
import { hourlyPay } from "../payroll/time-to-pay";
import { addDays } from "../rules/index";
import { atlWarnings, blockHours, currentEntries, isoWeek, monthDates, netHours, sumByDay, toWorkBlocks, weekDates, weekStart, weekSums, type TimeEntry } from "./time";

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
  // A night shift 22–06 followed by a day shift at 14 the same day: 8 h rest.
  const night = [entry({ workDate: "2026-10-21", start: "22:00", end: "06:00", breakMinutes: 0, hours: 8 }), entry({ workDate: "2026-10-22", start: "14:00", end: "18:00", breakMinutes: 0, hours: 4 })];
  assert.deepEqual(atlWarnings(night).map((x) => x.code), ["daily-rest"]);
});

test("ATL veckovila: seven days in a row without 36 h off warns for that week", () => {
  const days = Array.from({ length: 15 }, (_, i) => entry({ workDate: addDays("2026-10-12", i) }));
  const w = atlWarnings(days, { from: "2026-10-19", to: "2026-10-25" });
  assert.deepEqual(w.map((x) => [x.code, x.date]), [["weekly-rest", "2026-10-19"]]);
  assert.match(w[0].message, /Vecka 43/);
});
