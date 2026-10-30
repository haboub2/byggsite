import { test } from "node:test";
import assert from "node:assert/strict";
import { fractionOf } from "../money";
import { agiDueDate, PAYROLL_RULE_SETS, payrollRulesAt, ruleSources, unverifiedRules, type ContributionPart } from "./payroll";

const PARTS: ContributionPart[] = ["alderspension", "efterlevandepension", "sjukforsakring", "foraldraforsakring", "arbetsmarknad", "arbetsskada", "allmanLoneavgift"];
const sumPercent = (p: Record<ContributionPart, number>) => Number(PARTS.reduce((s, k) => s + p[k], 0).toFixed(2));

test("rule sets are ordered, dated, and a year without a set is refused", () => {
  for (let i = 1; i < PAYROLL_RULE_SETS.length; i++) assert.ok(PAYROLL_RULE_SETS[i - 1].validFrom < PAYROLL_RULE_SETS[i].validFrom);
  assert.equal(payrollRulesAt("2026-03-31").validFrom, "2026-01-01");
  assert.equal(payrollRulesAt("2026-04-01").validFrom, "2026-04-01");
  assert.equal(payrollRulesAt("2025-12-25").validFrom, "2026-01-01");
  assert.throws(() => payrollRulesAt("2027-01-25"), /2027 är inte inlagda/);
  assert.throws(() => payrollRulesAt("2026-1-25"), RangeError);
});

test("every rule group has a primary source and a check date; the unverified ones are exactly these", () => {
  for (const set of PAYROLL_RULE_SETS) {
    const sources = ruleSources(set);
    assert.ok(sources.length >= 18, `${set.validFrom}: ${sources.length} sources`);
    for (const { path, source } of sources) {
      assert.match(source.url, /^https?:\/\/[^ ]+\.[a-z]{2,}/, path);
      assert.match(source.checked, /^2026-10-\d{2}$/, path);
      if (source.unverified) assert.ok(source.note && source.note.length > 20, `${path} is unverified without a note`);
    }
  }
  // Shown here so a reviewer sees what is not confirmed; docs/hr-lon.md "Läge" lists the same.
  assert.deepEqual(unverifiedRules(payrollRulesAt("2026-06-25")).map((u) => u.path), ["preliminaryTax", "las", "pension.safLo"]);
});

test("arbetsgivaravgifter 2026: 31,42 % in seven parts; 10,21 % for born 1938–1958; nothing for 1937 and earlier", () => {
  const c = payrollRulesAt("2026-06-25").employerContributions;
  assert.equal(sumPercent(c.parts), 31.42);
  assert.equal(c.fullPercent, 31.42);
  assert.equal(c.parts.allmanLoneavgift, 12.62);
  assert.deepEqual(c.olderReduced, { bornFrom: 1938, bornTo: 1958, percent: 10.21 });
  assert.equal(c.exemptBornUpTo, 1937);
  assert.equal(c.minAnnualPayOre, 100_000);
});

test("young people 2026: from 1 April, born 2003–2007, 20,81 % on pay up to 25 000 kr a month", () => {
  assert.equal(payrollRulesAt("2026-03-25").employerContributions.young, null);
  const y = payrollRulesAt("2026-04-25").employerContributions.young;
  assert.ok(y);
  assert.equal(y.bornFrom, 2003);
  assert.equal(y.bornTo, 2007);
  assert.equal(y.capPerMonthOre, 2_500_000);
  assert.equal(sumPercent(y.parts), 20.81);
  assert.equal(y.percent, 20.81);
  // Lag (2026:100) 2 §: the whole ålderspensionsavgift, half of the others, decimals beyond two dropped.
  const full = payrollRulesAt("2026-04-25").employerContributions.parts;
  for (const k of PARTS) assert.equal(y.parts[k], k === "alderspension" ? full[k] : Math.floor((full[k] * 100) / 2) / 100, k);
});

test("växa-stöd, sjuklön, semester, ATL and LAS figures", () => {
  const r = payrollRulesAt("2026-06-25");
  assert.deepEqual(
    [r.vaxaStod.capPerMonthOre, r.vaxaStod.capPerMonthEarlierOre, r.vaxaStod.maxEmployees, r.vaxaStod.months, r.vaxaStod.minHoursPerWeek, r.vaxaStod.minEmploymentMonths],
    [3_500_000, 2_500_000, 2, 24, 20, 3],
  );
  assert.deepEqual([r.sickPay.percent, r.sickPay.waitingDeductionPercentOfWeek, r.sickPay.employerDays, r.sickPay.relapseDays, r.sickPay.certificateFromDay, r.sickPay.maxWaitingDeductions], [80, 20, 14, 5, 8, 10]);
  assert.equal(r.sickPay.agiBox, null);
  assert.deepEqual([r.vacation.daysPerYear, r.vacation.percentRule, r.vacation.sameSalaryDailyPercent, r.vacation.sameSalaryVariablePercent, r.vacation.yearStartMonthDay], [25, 12, 0.43, 12, "04-01"]);
  assert.deepEqual([r.workingTime.overtimePerYearHours, r.workingTime.overtimePer4WeeksHours, r.workingTime.overtimePerMonthHours, r.workingTime.dailyRestHours, r.workingTime.weeklyRestHours], [200, 48, 50, 11, 36]);
  assert.deepEqual([r.las.savaLimitDays, r.las.vikariatLimitDays, r.las.windowYears, r.las.probationMaxMonths, r.las.probationNoticeDays], [360, 730, 5, 6, 14]);
  assert.equal(r.retention.years, 7);
});

test("agreements: Byggavtalet 13 %, OB 20/40/70, övertid 30/50/70/100 with no OB on övertid; Tjänstemannaavtalet /94 and /72", () => {
  const b = payrollRulesAt("2026-06-25").agreements.byggavtalet;
  assert.equal(b.vacationPercent, 13);
  assert.deepEqual([...new Set(b.ob.map((x) => x.percent))], [20, 40, 70]);
  assert.deepEqual([...new Set(b.overtime.map((x) => x.percent))], [50, 30, 70, 100]);
  assert.equal(b.obOnOvertime, false);
  assert.equal(b.overtimeIncludesBase, true);
  assert.equal(b.atf.hoursPerYear, 40);
  const t = payrollRulesAt("2026-06-25").agreements.tjanstemannaavtalet;
  assert.deepEqual(t.overtime.map((x) => x.monthlyDivisor), [94, 72, 72]);
  assert.equal(t.vacationDailySupplementPercent, 0.8);
  assert.equal(payrollRulesAt("2026-03-25").agreements.tjanstemannaavtalet.atf.daysPerYear, 5);
  assert.equal(payrollRulesAt("2026-04-25").agreements.tjanstemannaavtalet.atf.daysPerYear, 6);
});

test("basbelopp, pension caps, traktamente, milersättning, 3:12", () => {
  const r = payrollRulesAt("2026-06-25");
  assert.deepEqual([r.baseAmounts.prisbasbeloppOre, r.baseAmounts.forhojtPrisbasbeloppOre, r.baseAmounts.inkomstbasbeloppOre], [5_920_000, 6_050_000, 8_340_000]);
  // SAF-LO and ITP1 cap: 7,5 × 83 400 / 12 = 52 125 kr a month.
  assert.equal(fractionOf(r.baseAmounts.inkomstbasbeloppOre, 75, 120), 5_212_500);
  assert.equal(r.pension.safLo.chargedPercentBelowCap, 4.4);
  assert.deepEqual([r.expenses.perDiem.fullDayOre, r.expenses.perDiem.halfDayOre, r.expenses.perDiem.nightOre, r.expenses.perDiem.after3MonthsOre, r.expenses.perDiem.after2YearsOre], [30_000, 15_000, 15_000, 21_000, 15_000]);
  assert.deepEqual([r.expenses.mileage.ownCarPerMilOre, r.expenses.mileage.companyCarPerMilOre, r.expenses.mileage.companyElectricCarPerMilOre], [2_500, 1_200, 950]);
  // Grundbelopp: 4 × the previous year's IBB (80 600) = 322 400 kr.
  assert.equal(r.closeCompany.grundbeloppIbb * r.baseAmounts.inkomstbasbeloppPreviousYearOre, 32_240_000);
  assert.equal(r.closeCompany.salaryRequirement, false);
  assert.equal(r.closeCompany.ownershipThresholdPercent, null);
});

test("AGI 2026, up to 40 MSEK: the 12th, the 17th in January and August, next working day", () => {
  const due = (m: string) => agiDueDate(m).declareBy;
  assert.deepEqual(
    ["2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"].map(due),
    ["2026-01-19", "2026-02-12", "2026-03-12", "2026-04-13", "2026-05-12", "2026-06-12", "2026-07-13", "2026-08-17", "2026-09-14", "2026-10-12", "2026-11-12", "2026-12-14", "2027-01-18"],
  );
  assert.equal(agiDueDate("2026-06").payBy, "2026-07-13");
});

test("AGI 2026, above 40 MSEK: declare on the 26th, pay on the 12th (17th in January)", () => {
  const large = { turnoverOre: 5_000_000_000 };
  assert.deepEqual(
    ["2026-03", "2026-06", "2026-08", "2026-11", "2026-12"].map((m) => agiDueDate(m, large).declareBy),
    ["2026-04-27", "2026-07-27", "2026-09-28", "2026-12-28", "2027-01-26"],
  );
  assert.equal(agiDueDate("2026-07", large).payBy, "2026-08-12");
  assert.equal(agiDueDate("2026-12", large).payBy, "2027-01-18");
  assert.throws(() => agiDueDate("2026-6"), RangeError);
});
