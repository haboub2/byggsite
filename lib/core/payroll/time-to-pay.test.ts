import { test } from "node:test";
import assert from "node:assert/strict";
import { sumOre } from "../money";
import { payrollRulesAt } from "../rules/payroll";
import type { WorkSchedule } from "./sick-pay";
import { atfAccrual, dayKind, hourlyPay, monthlyOvertime, monthlyPay } from "./time-to-pay";

const rules = payrollRulesAt("2026-04-25");
const bygg = rules.agreements.byggavtalet;
const tjm = rules.agreements.tjanstemannaavtalet;
const codes = { base: "1100", ob: "1200", overtime: "1300" };
const pay = (blocks: Parameters<typeof hourlyPay>[0]["blocks"]) => hourlyPay({ agreement: bygg, hourlyRateOre: 25_000, blocks, codes });

test("day kinds: weekday, weekend, helgdag and the eves", () => {
  assert.equal(dayKind("2026-03-09"), "weekday");
  assert.equal(dayKind("2026-03-14"), "saturday");
  assert.equal(dayKind("2026-03-15"), "sunday");
  assert.equal(dayKind("2026-04-06"), "holiday"); // annandag påsk
  assert.equal(dayKind("2026-06-19"), "holiday"); // midsommarafton
});

test("Byggavtalet: ordinary day hours have no OB; 18–22 is OB2 40 %", () => {
  const r = pay([{ date: "2026-03-09", start: "06:00", end: "15:00" }, { date: "2026-03-10", start: "16:00", end: "20:00" }]);
  assert.equal(r.baseHours, 13);
  assert.deepEqual(r.obHours, { OB2: 2 });
  // 13 × 250 = 3 250; 2 × 100 = 200.
  assert.deepEqual(r.lines.map((l) => [l.code, l.quantity, l.unitPriceOre, l.amountOre]), [
    ["1100", 13, 25_000, 325_000],
    ["1200", 2, 10_000, 20_000],
  ]);
});

test("OB1 05–06, OB3 at night, and past midnight into Saturday at the weekend rate", () => {
  const r = pay([{ date: "2026-03-11", start: "05:00", end: "07:00" }, { date: "2026-03-13", start: "22:00", end: "02:00" }]);
  assert.deepEqual(r.obHours, { OB1: 1, OB3: 4 });
  // OB1 1 × 50 = 50; OB3 4 × 175 = 700.
  assert.equal(r.lines.find((l) => l.text.startsWith("OB OB3"))?.amountOre, 70_000);
  assert.equal(r.lines.find((l) => l.text.startsWith("OB OB1"))?.amountOre, 5_000);
});

test("övertid by band, base plus premium, never OB on övertid", () => {
  const r = pay([
    { date: "2026-03-10", start: "17:00", end: "19:00", overtime: true }, // B 50 %
    { date: "2026-03-10", start: "19:00", end: "20:30", overtime: true }, // C 70 %
    { date: "2026-03-14", start: "08:00", end: "10:00", overtime: true }, // D 100 %
    { date: "2026-03-11", start: "15:00", end: "17:00", overtime: true }, // A 30 %
  ]);
  assert.deepEqual(r.overtimeHours, { B: 2, C: 1.5, D: 2, A: 2 });
  assert.deepEqual(r.obHours, {});
  assert.equal(r.baseHours, 0);
  const by = (code: string) => r.lines.find((l) => l.text.startsWith(`Övertid ${code} `))!;
  assert.equal(by("A").amountOre, 2 * 32_500);
  assert.equal(by("B").amountOre, 2 * 37_500);
  assert.equal(by("C").amountOre, 63_750); // 1,5 × 425
  assert.equal(by("D").amountOre, 2 * 50_000);
});

test("bands priced per månadslön are refused for hourly pay", () => {
  assert.throws(() => hourlyPay({ agreement: tjm, hourlyRateOre: 25_000, blocks: [{ date: "2026-03-10", start: "17:00", end: "19:00", overtime: true }], codes }), /ersätts per månadslön/);
});

test("Tjänstemannaavtalet övertid: månadslön/94 weekdays 06–20, /72 otherwise", () => {
  const lines = monthlyOvertime({ agreement: tjm, monthlySalaryOre: 4_700_000, code: "1301", blocks: [{ date: "2026-03-10", start: "18:00", end: "22:00" }] });
  // 47 000 / 94 = 500 kr; 47 000 / 72 = 652,78 kr.
  assert.deepEqual(lines.map((l) => [l.quantity, l.unitPriceOre, l.amountOre]), [
    [2, 50_000, 100_000],
    [2, 65_278, 130_556],
  ]);
});

test("monthly salary: arbetsdagsavdrag 1/21 up to five days, kalenderdagsavdrag × 12/365 beyond, 1/175 per hour", () => {
  const r = monthlyPay({
    agreement: tjm,
    monthlySalaryOre: 3_675_000,
    codes: { salary: "1010", deduction: "1150" },
    absences: [
      { from: "2026-03-02", to: "2026-03-03" }, // two working days: 2 × 1 750
      { from: "2026-03-09", to: "2026-03-18" }, // eight working days, ten calendar days: 10 × 36 750 × 12 / 365
      { from: "2026-03-24", to: "2026-03-24", hours: 3 }, // 3 × 210
    ],
  });
  assert.deepEqual(r.lines.map((l) => [l.code, l.quantity, l.amountOre]), [
    ["1010", 1, 3_675_000],
    ["1150", 2, -350_000],
    ["1150", 10, -1_208_219],
    ["1150", 3, -63_000],
  ]);
  assert.equal(r.deductionOre, 350_000 + 1_208_219 + 63_000);
  assert.equal(sumOre(r.lines.map((l) => l.amountOre)), 3_675_000 - r.deductionOre);
  assert.throws(() => monthlyPay({ agreement: bygg, monthlySalaryOre: 3_500_000, codes: { salary: "1011", deduction: "1151" }, absences: [{ from: "2026-03-02", to: "2026-03-02" }] }), /finns inte i regelboken/);
});

test("a part-timer on Mon–Wed: only scheduled days count, at månadslön / (3 × 21 / 5)", () => {
  const monWed: WorkSchedule = { kind: "weekly", hours: [8, 8, 8, 0, 0, 0, 0], holidaysOff: true };
  // Absent Mon 2 – Fri 6 March: three scheduled days. 21 000 × 5 / 63 = 1 666,67 kr a day.
  const r = monthlyPay({ agreement: tjm, monthlySalaryOre: 2_100_000, schedule: monWed, codes: { salary: "1010", deduction: "1150" }, absences: [{ from: "2026-03-02", to: "2026-03-06" }] });
  assert.deepEqual(r.lines.slice(1).map((l) => [l.quantity, l.unitPriceOre, l.amountOre]), [[3, -166_667, -500_001]]);
  // Without a schedule the calendar counts five days at 1/21 (only right for full time).
  const calendar = monthlyPay({ agreement: tjm, monthlySalaryOre: 2_100_000, codes: { salary: "1010", deduction: "1150" }, absences: [{ from: "2026-03-02", to: "2026-03-06" }] });
  assert.deepEqual(calendar.lines.slice(1).map((l) => [l.quantity, l.amountOre]), [[5, -500_000]]);
});

test("arbetstidsförkortning accrues per day: Byggavtalet 40 h a year, Tjänstemannaavtalet 6 days from April 2026", () => {
  assert.deepEqual(atfAccrual(bygg, 365), { hours: 40, days: null });
  assert.deepEqual(atfAccrual(bygg, 182, { roundToWhole: true }), { hours: 20, days: null });
  assert.equal(atfAccrual(bygg, 182).hours, 19.9452);
  assert.deepEqual(atfAccrual(tjm, 365), { hours: null, days: 6 });
});
