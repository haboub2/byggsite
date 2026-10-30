import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "../rules/index";
import { scheduleFromRules, type Absence } from "../hr/absence";
import type { EmploymentVersion } from "../hr/schema";
import { isoWeekday } from "../../workdays";
import type { PayslipDocument } from "./payslip";
import { semesterTransition, semesterYearEndingIn, yearSummary } from "./year-end";

const LAW = { startMonthDay: "04-01", earning: "previous-year" as const };
const MON_FRI = scheduleFromRules([1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "07:00", end: "16:00", breakMinutes: 60 })));
const version = (startsOn: string) =>
  ({ id: "v", employeeId: "erik", contractId: "c", version: 1, form: "tillsvidare", startsOn, endsOn: null, validFrom: startsOn, validTo: null, vacationRule: "sammalon", vacationDays: 25 }) as EmploymentVersion;
const semester = (id: string, from: string, to: string): Absence => ({ id, employeeId: "erik", kind: "semester", from, to, extent: 1, certificateReceivedOn: null, sickPeriodId: null, note: "", approvedAt: null, createdAt: "" });
/** `weeks` whole weeks Monday–Friday from the first Monday of July (no helgdagar in July). */
const july = (year: number, weeks: number): Absence => {
  let d = `${year}-07-01`;
  while (isoWeekday(d) !== 1) d = addDays(d, 1);
  return semester(`s${year}`, d, addDays(d, weeks * 7 - 3));
};

test("the semesterår ending in a calendar year: 31 March under the law, 31 December by the calendar", () => {
  assert.deepEqual(semesterYearEndingIn(2026, LAW), { from: "2025-04-01", to: "2026-03-31" });
  assert.deepEqual(semesterYearEndingIn(2026, { startMonthDay: "01-01" }), { from: "2026-01-01", to: "2026-12-31" });
});

test("20 taken saves 5, which open the next year; 10 taken saves 5 and lets 10 lapse", () => {
  const t = semesterTransition({ year: 2025, model: LAW, people: [{ employeeId: "erik", name: "Erik", versions: [version("2023-01-01")], absences: [july(2024, 4)], schedule: MON_FRI }] });
  assert.deepEqual(t.closing, { from: "2024-04-01", to: "2025-03-31" });
  assert.deepEqual(t.opening, { from: "2025-04-01", to: "2026-03-31" });
  const [r] = t.rows;
  assert.deepEqual([r.closing.earnedDays, r.closing.takenDays, r.closing.savedDays, r.expiredDays, r.lapsedDays], [25, 20, 5, 0, 0]);
  assert.deepEqual(r.opening && [r.opening.earnedDays, r.opening.savedInDays], [25, 5]);

  const [r10] = semesterTransition({ year: 2025, model: LAW, people: [{ employeeId: "erik", name: "Erik", versions: [version("2023-01-01")], absences: [july(2024, 2)], schedule: MON_FRI }] }).rows;
  assert.deepEqual([r10.closing.takenDays, r10.closing.savedDays, r10.lapsedDays], [10, 5, 10]);
});

test("saved days older than five years expire at the transition", () => {
  // Hired 2015, 20 days taken every summer: every year from 2016/17 saves 5 and never takes them.
  const absences = Array.from({ length: 10 }, (_, i) => july(2016 + i, 4));
  const [r] = semesterTransition({ year: 2025, model: LAW, people: [{ employeeId: "erik", name: "Erik", versions: [version("2015-01-01")], absences, schedule: MON_FRI }] }).rows;
  // Brought into 2024/25: the savings of 2019/20–2023/24. Into 2025/26: 2020/21–2024/25, so 2019/20's five expire.
  assert.equal(r.closing.savedInDays, 25);
  assert.equal(r.closing.savedDays, 5);
  assert.equal(r.opening?.savedInDays, 25);
  assert.equal(r.expiredDays, 5);
});

test("the year summary sums each person's payslips", () => {
  const doc = (name: string, payDate: string, gross: number, tax: number, benefit = 0): PayslipDocument =>
    ({ employeeId: name, employeeName: name, payDate, totals: { cashGrossOre: gross, taxFreeReimbursementOre: 0, benefitOre: benefit, taxOre: tax, netAdjustmentOre: 0, netOre: gross - tax, employerContributionOre: 0, sickPayCostOre: 0 } }) as unknown as PayslipDocument;
  const rows = yearSummary(
    [
    { employeeId: "bo", number: 2, document: doc("Bo", "2026-11-25", 3_519_600, 708_500), employerContributionOre: 1_105_858 },
    { employeeId: "anna", number: 1, document: doc("Anna", "2026-11-25", 3_952_000, 828_900, 150_000), employerContributionOre: 1_288_864 },
    { employeeId: "anna", number: 4, document: doc("Anna", "2026-12-23", 4_000_000, 850_000), employerContributionOre: 1_256_800 },
    ],
    [{ employeeId: "bo", amountOre: 200_000 }],
  );
  assert.deepEqual(rows.map((r) => [r.name, r.payslips, r.cashGrossOre, r.benefitOre, r.taxOre, r.netOre, r.employerContributionOre, r.repaidOre, r.firstPayDate, r.lastPayDate]), [
    ["Anna", 2, 7_952_000, 150_000, 1_678_900, 6_273_100, 2_545_664, 0, "2026-11-25", "2026-12-23"],
    ["Bo", 1, 3_519_600, 0, 708_500, 2_811_100, 1_105_858, 200_000, "2026-11-25", "2026-11-25"],
  ]);
});
