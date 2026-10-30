import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollRulesAt } from "../rules/payroll";
import {
  lawVacationYearModel,
  monthlyVacationCompensation,
  monthlyVacationDayValue,
  paidDaysEarned,
  percentRuleVacationPay,
  qualifyingAbsence,
  sameSalaryVacationPay,
  savableDays,
  terminationCompensation,
  vacationLiability,
  vacationYear,
  vacationYears,
  validSavedDays,
} from "./vacation";

const rules = payrollRulesAt("2026-06-25");
const bygg = rules.agreements.byggavtalet;
const tjm = rules.agreements.tjanstemannaavtalet;

test("the semesterår runs 1 April–31 March by default, or a calendar year", () => {
  assert.deepEqual(vacationYear("2026-06-10", rules.vacation.yearStartMonthDay), { from: "2026-04-01", to: "2027-03-31" });
  assert.deepEqual(vacationYear("2026-02-10", "04-01"), { from: "2025-04-01", to: "2026-03-31" });
  assert.deepEqual(vacationYear("2026-02-10", "01-01"), { from: "2026-01-01", to: "2026-12-31" });
});

test("3 §: by law the intjänandeår is the year before the semesterår; an agreement may use the same year", () => {
  const law = vacationYears("2026-06-10", lawVacationYearModel(rules));
  assert.deepEqual(law.vacationYear, { from: "2026-04-01", to: "2027-03-31" });
  assert.deepEqual(law.paidBy, { from: "2025-04-01", to: "2026-03-31" });
  // Work in June 2026 belongs to intjänandeår 2026/27 and pays for the semesterår starting 1 April 2027.
  assert.deepEqual(law.earningYear, { from: "2026-04-01", to: "2027-03-31" });
  assert.deepEqual(law.paysFor, { from: "2027-04-01", to: "2028-03-31" });
  const sameYear = vacationYears("2026-06-10", { startMonthDay: "01-01", earning: "same-year" });
  assert.deepEqual(sameYear.paidBy, { from: "2026-01-01", to: "2026-12-31" });
  assert.deepEqual(sameYear.paysFor, sameYear.vacationYear);
});

test("7 §: paid days = ceil(25 × (employment days − days wholly absent without pay) / days in the year)", () => {
  const year = { rules, yearFrom: "2025-04-01", yearTo: "2026-03-31" };
  assert.equal(paidDaysEarned({ ...year, employedFrom: "2020-01-01", employedTo: null, nonQualifyingDays: 0 }).paidDays, 25);
  // Started 1 October: 182 of 365 days → 12,47 → 13.
  const late = paidDaysEarned({ ...year, employedFrom: "2025-10-01", employedTo: null, nonQualifyingDays: 0 });
  assert.equal(late.employmentDays, 182);
  assert.equal(late.paidDays, 13);
  // A full year with 30 days of unpaid leave: 335 / 365 × 25 = 22,95 → 23.
  assert.equal(paidDaysEarned({ ...year, employedFrom: "2020-01-01", employedTo: null, nonQualifyingDays: 30 }).paidDays, 23);
  // Ended 30 June: 91 days → 6,23 → 7.
  assert.equal(paidDaysEarned({ ...year, employedFrom: "2020-01-01", employedTo: "2025-06-30", nonQualifyingDays: 0 }).paidDays, 7);
  // An agreement's 30 days.
  assert.equal(paidDaysEarned({ ...year, employedFrom: "2020-01-01", employedTo: null, nonQualifyingDays: 0, daysPerYear: 30 }).paidDays, 30);
});

test("17 § and 17 a §: sick days count up to 180, parental days up to 120 (180 for a single parent)", () => {
  assert.deepEqual(qualifyingAbsence(rules, { sick: 200, parental: 130, unpaid: 10 }), { qualifyingDays: 300, nonQualifyingDays: 40 });
  assert.deepEqual(qualifyingAbsence(rules, { sick: 0, parental: 130, unpaid: 0, singleParent: true }), { qualifyingDays: 130, nonQualifyingDays: 0 });
});

test("procentregeln: 12 % by law, 13 % under Byggavtalet, absence pay added to the basis", () => {
  // 300 000 kr earned + 20 000 kr for semesterlönegrundande sick days = 320 000; 12 % = 38 400; per day /25 = 1 536.
  assert.deepEqual(percentRuleVacationPay(30_000_000, 2_000_000, rules.vacation.percentRule, 25), { totalOre: 3_840_000, perDayOre: 153_600 });
  assert.equal(percentRuleVacationPay(30_000_000, 0, bygg.vacationPercent, 25).totalOre, 3_900_000);
  // SÄVA / timlön paid per month: 20 000 kr × 13 % = 2 600 kr.
  assert.equal(monthlyVacationCompensation(2_000_000, bygg.vacationPercent), 260_000);
});

test("sammalöneregeln: 0,43 % per day and 12 % of variable pay by law; 0,8 % and 0,5 % per day under Tjänstemannaavtalet", () => {
  // 36 000 kr × 0,43 % = 154,80 kr per day, five days 774 kr; variable 10 000 × 12 % = 1 200 kr.
  assert.deepEqual(
    sameSalaryVacationPay({ monthlySalaryOre: 3_600_000, daysTaken: 5, dailySupplementPercent: rules.vacation.sameSalaryDailyPercent, variablePayOre: 1_000_000, variable: { mode: "total", percent: rules.vacation.sameSalaryVariablePercent } }),
    { supplementOre: 77_400, variableOre: 120_000 },
  );
  // 0,8 % = 288 kr a day → 1 440 kr; 0,5 % of 10 000 = 50 kr a day → 250 kr.
  assert.deepEqual(
    sameSalaryVacationPay({ monthlySalaryOre: 3_600_000, daysTaken: 5, dailySupplementPercent: tjm.vacationDailySupplementPercent, variablePayOre: 1_000_000, variable: tjm.vacationVariablePay }),
    { supplementOre: 144_000, variableOre: 25_000 },
  );
});

test("semesterersättning: 4,6 % + 0,8 % per untaken day under the agreements", () => {
  const day = monthlyVacationDayValue(3_600_000, tjm.vacationDayValuePercent, tjm.vacationDailySupplementPercent);
  assert.equal(day, 194_400); // 1 656 + 288
  assert.equal(terminationCompensation(7, day), 1_360_800);
});

test("18 §: only days above 20 can be saved, none in a year when saved days are taken, valid five years", () => {
  assert.equal(savableDays(rules, 25, 20), 5);
  assert.equal(savableDays(rules, 25, 22), 3);
  assert.equal(savableDays(rules, 25, 18), 5);
  assert.equal(savableDays(rules, 20, 10), 0);
  assert.equal(savableDays(rules, 25, 20, { savedDaysTakenThisYear: 2 }), 0);
  const saved = [
    { earnedIn: "2020-04-01", days: 5 },
    { earnedIn: "2021-04-01", days: 5 },
    { earnedIn: "2026-04-01", days: 5 },
  ];
  assert.deepEqual(validSavedDays(rules, saved, "2026-04-01").map((s) => s.earnedIn), ["2021-04-01"]);
});

test("semesterlöneskuld: unused days at the day value plus accrued procentregeln pay not yet paid", () => {
  assert.equal(vacationLiability({ unusedDays: 10, perDayOre: 194_400 }), 1_944_000);
  assert.equal(vacationLiability({ unusedDays: 0, perDayOre: 0, accruedPercentPayOre: 390_000, paidOutOre: 260_000 }), 130_000);
});
