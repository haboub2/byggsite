import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays } from "../rules/index";
import { payrollRulesAt } from "../rules/payroll";
import { monthlyToHourlyOre } from "../payroll/sick-pay";
import { absenceWorkdays, certificatesDue, linkSickPeriods, scheduleFromRules, sickBreakdown, sickHours, type Absence } from "./absence";

const rules = payrollRulesAt("2026-09-01");
const sick = (id: string, from: string, to: string | null, over: Partial<Absence> = {}): Absence => ({
  id,
  employeeId: "erik",
  kind: "sjuk",
  from,
  to,
  extent: 1,
  certificateReceivedOn: null,
  sickPeriodId: null,
  note: "",
  approvedAt: null,
  createdAt: "",
  ...over,
});
const MON_FRI = scheduleFromRules([1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "07:00", end: "16:00", breakMinutes: 60 })));

test("sick_rules() in 0037 has the rule book's days (återinsjuknande, sjuklönedagar, läkarintyg)", () => {
  const migration = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "0037_time.sql"), "utf8");
  const m = /function public\.sick_rules\([\s\S]*?as \$\$ select ([\d, ]+) \$\$/.exec(migration);
  assert.ok(m, "sick_rules() not found");
  assert.deepEqual(m[1].split(",").map((s) => Number(s.trim())), [rules.sickPay.relapseDays, rules.sickPay.employerDays, rules.sickPay.certificateFromDay]);
});

test("schedule rules → a weekly WorkSchedule: Mon–Fri 07–16 with an hour's lunch is 8 h a day", () => {
  assert.deepEqual(MON_FRI, { kind: "weekly", hours: [8, 8, 8, 8, 8, 0, 0], holidaysOff: true });
});

test("återinsjuknande: five days after the last sick day continues the period, six days starts a new one", () => {
  const a = sick("a", "2026-09-01", "2026-09-02");
  const b = sick("b", "2026-09-07", "2026-09-08");
  const c = sick("c", "2026-09-14", "2026-09-15");
  assert.deepEqual(linkSickPeriods([c, a, b], 5), [
    { firstDay: "2026-09-01", lastDay: "2026-09-08", absenceIds: ["a", "b"] },
    { firstDay: "2026-09-14", lastDay: "2026-09-15", absenceIds: ["c"] },
  ]);
  assert.equal(linkSickPeriods([a, { ...b, from: "2026-09-08" }, c], 5).length, 3);
  // Still sick (no end): the period is open, and nothing after it can continue it.
  assert.deepEqual(linkSickPeriods([sick("o", "2026-10-01", null)], 5), [{ firstDay: "2026-10-01", lastDay: null, absenceIds: ["o"] }]);
});

test("day by day: månadslön 32 000 kr, sick Tue–Wed and again Mon–Tue: one karensavdrag, days 1–4", () => {
  // Timme 18 462 öre (monthlyToHourlyOre), sjuklön 80 % = 14 770 öre/h. 16 h per spell = 236 320 öre.
  // Veckosjuklön 40 × 14 770 = 590 800; karensavdrag 20 % = 118 160, once.
  const hourly = monthlyToHourlyOre(3_200_000, 40);
  const r = sickBreakdown({
    absences: [sick("a", "2026-09-01", "2026-09-02"), sick("b", "2026-09-07", "2026-09-08")],
    schedule: MON_FRI,
    hourlyPayOre: hourly,
    averageWeeklyHours: 40,
    monthlySalary: true,
    asOf: "2026-10-30",
  });
  const [s1, s2] = r.spells;
  assert.deepEqual(s1.days.map((d) => [d.date, d.dayNo, d.lostHours]), [["2026-09-01", 1, 8], ["2026-09-02", 2, 8]]);
  assert.deepEqual(s2.days.map((d) => [d.date, d.dayNo]), [["2026-09-07", 3], ["2026-09-08", 4]]);
  assert.equal(s2.firstDay, "2026-09-01");
  assert.equal(s1.sickPayOre, 236_320);
  assert.equal(s1.waitingDeductionOre, 118_160);
  assert.equal(s2.waitingDeductionOre, 0);
  assert.equal(s2.noWaitingDeduction, "continuation");
  assert.equal(r.result.sickPayCostOre, 236_320 * 2 - 118_160);
  assert.equal(r.waitingDeductionsLast12Months, 1);
  // Sjukavdrag (the salary's lost hours) as well as sjuklön on månadslön.
  assert.deepEqual(r.result.lines.map((l) => l.code), ["sjukavdrag", "sjuklon", "karensavdrag", "sjukavdrag", "sjuklon"]);
});

test("a half day sick loses half the scheduled hours", () => {
  const spells = [sick("h", "2026-10-05", "2026-10-06", { extent: 0.5 })];
  assert.deepEqual(sickHours(MON_FRI, spells, "2026-10-30").hours, { "2026-10-05": 4, "2026-10-06": 4 });
  const r = sickBreakdown({ absences: spells, schedule: MON_FRI, hourlyPayOre: 20_000, averageWeeklyHours: 40, monthlySalary: false, asOf: "2026-10-30" });
  assert.equal(r.spells[0].sickPayHours, 8);
  assert.equal(r.spells[0].sickPayOre, 128_000);
});

test("ten karensavdrag in twelve months: the eleventh period has none", () => {
  const spells = Array.from({ length: 11 }, (_, i) => sick(`s${i}`, addDays("2026-01-05", 21 * i), addDays("2026-01-05", 21 * i)));
  const r = sickBreakdown({ absences: spells, schedule: MON_FRI, hourlyPayOre: 20_000, averageWeeklyHours: 40, monthlySalary: false, asOf: "2026-08-31" });
  assert.equal(r.spells.filter((s) => s.waitingDeductionOre > 0).length, 10);
  assert.equal(r.spells[10].noWaitingDeduction, "ten-in-twelve-months");
  assert.equal(r.waitingDeductionsLast12Months, 10);
});

test("läkarintyg from day 8 of the period, counting the days of återinsjuknande", () => {
  // Sick 1–5 Sep (days 1–5), again 8–12 Sep (days 6–10): day 8 is 10 Sep.
  const list = [sick("a", "2026-09-01", "2026-09-05"), sick("b", "2026-09-08", "2026-09-12")];
  assert.deepEqual(certificatesDue(list, "2026-09-12"), [{ employeeId: "erik", firstDay: "2026-09-01", dueFrom: "2026-09-10", absenceIds: ["a", "b"] }]);
  assert.deepEqual(certificatesDue(list, "2026-09-09"), []);
  assert.deepEqual(certificatesDue([list[0], { ...list[1], certificateReceivedOn: "2026-09-10" }], "2026-09-12"), []);
  // Still sick: counted to today.
  assert.equal(certificatesDue([sick("o", "2026-10-20", null)], "2026-10-30")[0]?.dueFrom, "2026-10-27");
});

test("semester taken counts scheduled days, a half day as 0,5", () => {
  const year = { from: "2026-04-01", to: "2027-03-31" };
  const three = { from: "2026-07-06", to: "2026-07-24", extent: 1 as const };
  assert.equal(absenceWorkdays(three, year, MON_FRI, "2026-10-30"), 15);
  assert.equal(absenceWorkdays(three, year, null, "2026-10-30"), 15);
  assert.equal(absenceWorkdays({ from: "2026-07-06", to: "2026-07-06", extent: 0.5 }, year, MON_FRI, "2026-10-30"), 0.5);
  // Kristi himmelfärds dag (Thursday 14 May 2026) is not a scheduled day: the week is four.
  assert.equal(absenceWorkdays({ from: "2026-05-11", to: "2026-05-15", extent: 1 }, { from: "2026-04-01", to: "2027-03-31" }, MON_FRI, "2026-10-30"), 4);
});
