import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollRulesAt } from "../rules/payroll";
import { averageWeeklyHoursFromHistory, monthlyToHourlyOre, sickPay, type SickPayInput, type WorkSchedule } from "./sick-pay";

const rules = payrollRulesAt("2026-03-25");
const MON_FRI_8: WorkSchedule = { kind: "weekly", hours: [8, 8, 8, 8, 8, 0, 0], holidaysOff: true };
const codes = { sickPay: "1400", waitingDeduction: "1410", sickDeduction: "1420" };
const base = (over: Partial<SickPayInput>): SickPayInput => ({
  rules,
  spells: [],
  schedule: MON_FRI_8,
  hourlyPayOre: 20_000,
  averageWeeklyHours: 40,
  monthlySalary: false,
  previousWaitingDeductions: [],
  codes,
  ...over,
});

test("timlön, sick Thursday to Tuesday over a weekend: 32 h sjuklön, one karensavdrag", () => {
  // 200 kr/h, 80 % = 160 kr/h. Thu, Fri, Mon, Tue × 8 h = 32 h → 5 120 kr.
  // Veckosjuklön 40 h × 160 = 6 400 kr, karensavdrag 20 % = 1 280 kr. Kostnad 3 840 kr.
  const r = sickPay(base({ spells: [{ from: "2026-03-12", to: "2026-03-17" }] }));
  assert.equal(r.periods.length, 1);
  const p = r.periods[0];
  assert.deepEqual(p.days.map((d) => [d.date, d.dayNo, d.lostHours]), [
    ["2026-03-12", 1, 8],
    ["2026-03-13", 2, 8],
    ["2026-03-14", 3, 0],
    ["2026-03-15", 4, 0],
    ["2026-03-16", 5, 8],
    ["2026-03-17", 6, 8],
  ]);
  assert.equal(p.sickPayOre, 512_000);
  assert.equal(p.waitingDeductionOre, 128_000);
  assert.equal(r.sickPayCostOre, 384_000);
  assert.deepEqual(r.waitingDeductionDates, ["2026-03-12"]);
  assert.deepEqual(r.lines.map((l) => [l.code, l.amountOre]), [["1400", 512_000], ["1410", -128_000]]);
  assert.equal(p.certificateFrom, null);
});

test("återinsjuknande within five days continues the period: day numbers go on, no new karensavdrag", () => {
  const r = sickPay(base({ spells: [{ from: "2026-03-12", to: "2026-03-17" }, { from: "2026-03-22", to: "2026-03-24" }, { from: "2026-04-07", to: "2026-04-07" }] }));
  assert.equal(r.periods[1].continuesPrevious, true);
  assert.equal(r.periods[1].days[0].dayNo, 7);
  assert.equal(r.periods[1].firstDay, "2026-03-12");
  assert.equal(r.periods[1].waitingDeductionOre, 0);
  assert.equal(r.periods[1].noWaitingDeduction, "continuation");
  // 2026-03-22 is a Sunday: Mon and Tue are 16 h.
  assert.equal(r.periods[1].sickPayOre, 256_000);
  // Six days after: 2026-03-24 → 2026-03-30 would be a new period; here 13 days later it is.
  assert.equal(r.periods[2].continuesPrevious, false);
  assert.equal(r.periods[2].waitingDeductionOre, 128_000);
  assert.deepEqual(r.waitingDeductionDates, ["2026-03-12", "2026-04-07"]);
});

test("the five days are calendar days after the last sick day", () => {
  const fifth = sickPay(base({ spells: [{ from: "2026-03-09", to: "2026-03-10" }, { from: "2026-03-15", to: "2026-03-16" }] }));
  assert.equal(fifth.periods[1].continuesPrevious, true);
  const sixth = sickPay(base({ spells: [{ from: "2026-03-09", to: "2026-03-10" }, { from: "2026-03-16", to: "2026-03-17" }] }));
  assert.equal(sixth.periods[1].continuesPrevious, false);
});

test("karensavdrag is at most the period's sjuklön; the rest carries into a continuation", () => {
  // Behovsanställd: a 4 h shift on Monday, average week 40 h → karens 1 280 kr but only 640 kr sjuklön.
  const shifts: WorkSchedule = { kind: "shifts", hours: { "2026-03-09": 4, "2026-03-12": 8 } };
  const r = sickPay(base({ schedule: shifts, spells: [{ from: "2026-03-09", to: "2026-03-09" }, { from: "2026-03-12", to: "2026-03-12" }] }));
  assert.equal(r.periods[0].sickPayOre, 64_000);
  assert.equal(r.periods[0].waitingDeductionOre, 64_000);
  assert.equal(r.periods[1].continuesPrevious, true);
  assert.equal(r.periods[1].sickPayOre, 128_000);
  assert.equal(r.periods[1].waitingDeductionOre, 64_000);
  assert.equal(r.sickPayCostOre, 64_000);
});

test("6 § 3 st: after ten karensavdrag in twelve months, none", () => {
  const ten = Array.from({ length: 10 }, (_, i) => `2025-${String(i + 4).padStart(2, "0")}-01`);
  const r = sickPay(base({ previousWaitingDeductions: ten, spells: [{ from: "2026-03-12", to: "2026-03-13" }] }));
  assert.equal(r.periods[0].waitingDeductionOre, 0);
  assert.equal(r.periods[0].noWaitingDeduction, "ten-in-twelve-months");
  // One of them older than twelve months: the eleventh gets its karensavdrag.
  const older = ["2025-03-01", ...ten.slice(1)];
  assert.equal(sickPay(base({ previousWaitingDeductions: older, spells: [{ from: "2026-03-12", to: "2026-03-13" }] })).periods[0].waitingDeductionOre, 128_000);
});

test("day 8 needs a läkarintyg, from day 15 Försäkringskassan pays", () => {
  const r = sickPay(base({ spells: [{ from: "2026-03-12", to: "2026-03-31" }] }));
  const p = r.periods[0];
  assert.equal(p.certificateFrom, "2026-03-19");
  assert.equal(p.insuranceFrom, "2026-03-26");
  // Employer days 12–25 March: ten working days = 80 h.
  assert.equal(p.sickPayHours, 80);
  assert.equal(p.days.filter((d) => !d.employerDay).length, 6);
});

test("a period continued from an earlier run keeps counting days", () => {
  const r = sickPay(base({ previousPeriod: { lastDay: "2026-02-27", days: 12, waitingDeductionLeftOre: 0 }, spells: [{ from: "2026-03-02", to: "2026-03-06" }] }));
  assert.equal(r.periods[0].continuesPrevious, true);
  assert.deepEqual(r.periods[0].days.map((d) => d.employerDay), [true, true, false, false, false]);
  assert.equal(r.periods[0].sickPayOre, 2 * 8 * 16_000);
});

test("månadslön: the hours are deducted and 80 % paid back", () => {
  const hourly = monthlyToHourlyOre(3_600_000, 40);
  assert.equal(hourly, 20_769); // 36 000 × 12 / 2 080 = 207,69 kr
  const r = sickPay(base({ hourlyPayOre: hourly, monthlySalary: true, spells: [{ from: "2026-03-12", to: "2026-03-17" }] }));
  assert.deepEqual(r.lines.map((l) => [l.code, l.amountOre]), [
    ["1420", -664_608], // 32 × 207,69
    ["1400", 531_680], // 32 × 166,15
    ["1410", -132_920], // 20 % of 40 × 166,15
  ]);
});

test("average week for behovsanställda from the last three months", () => {
  // 312 h over 13 weeks (91 days) = 24 h a week.
  assert.equal(averageWeeklyHoursFromHistory(312, "2026-01-01", "2026-04-01"), 24);
  assert.throws(() => averageWeeklyHoursFromHistory(10, "2026-02-01", "2026-01-01"), RangeError);
});

test("golden: Verksamt's karensavdrag examples", () => {
  // https://verksamt.se/en/employees-recruitment/employee-becomes-ill/deductions-sick-pay (read 2026-10-30)
  // A: 220 kr/h, 40 h a week → sjuklön 176 kr/h, veckosjuklön 7 040 kr, karensavdrag 1 408 kr.
  const a = sickPay(base({ hourlyPayOre: 22_000, averageWeeklyHours: 40, spells: [{ from: "2026-03-09", to: "2026-03-13" }] }));
  assert.equal(a.periods[0].waitingDeductionOre, 140_800);
  // B: 250 kr/h, 32 h (80 %) → 200 kr/h, 6 400 kr, karensavdrag 1 280 kr.
  const part: WorkSchedule = { kind: "weekly", hours: [6.4, 6.4, 6.4, 6.4, 6.4, 0, 0], holidaysOff: true };
  const b = sickPay(base({ schedule: part, hourlyPayOre: 25_000, averageWeeklyHours: 32, spells: [{ from: "2026-03-09", to: "2026-03-13" }] }));
  assert.equal(b.periods[0].waitingDeductionOre, 128_000);
  // C: irregular week Mo 14, Tu 5, We 5, Th 0, Fr 6 = 30 h at 220 kr/h → karensavdrag 1 056 kr;
  // sick all of Monday: 14 × 176 − 1 056 = 1 408 kr.
  const irregular: WorkSchedule = { kind: "weekly", hours: [14, 5, 5, 0, 6, 0, 0], holidaysOff: true };
  const c = sickPay(base({ schedule: irregular, hourlyPayOre: 22_000, averageWeeklyHours: 30, spells: [{ from: "2026-03-09", to: "2026-03-09" }] }));
  assert.equal(c.periods[0].waitingDeductionOre, 105_600);
  assert.equal(c.sickPayCostOre, 140_800);
});
