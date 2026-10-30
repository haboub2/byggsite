/**
 * Fixture 1 (docs/hr-lon.md, section 12, phase 0): a tjänsteman on
 * månadslön under Tjänstemannaavtalet Byggföretagen with one week of
 * semester in June 2026.
 *
 *   Person: born 1990, skattetabell 33 kolumn 1 (A-skattsedel), main employer.
 *   Månadslön 38 000 kr. Semester 8–12 June 2026 (five paid days).
 *   Pay date 2026-06-25, period June.
 *
 *   Månadslön (continues during semester)              38 000,00
 *   Semestertillägg 5 × 0,8 % × 38 000 = 5 × 304          1 520,00
 *   Bruttolön                                           39 520,00
 *   Skatteavdrag tabell 33 kol 1, 39 401–39 600 kr       −8 289
 *   Nettolön                                            31 231,00
 *   Arbetsgivaravgifter 31,42 % × 39 520                12 417,18 (AGI: 12 417)
 *
 *   Semester left: 25 earned (2025-04-01–2026-03-31) − 5 = 20 days.
 *   Semesterlöneskuld for them: 20 × (4,6 % + 0,8 %) × 38 000 = 20 × 2 052 = 41 040 kr.
 *
 * How it was checked: 8 289 kr is read from SKVFS 2025:20's table PDF
 * (tabell 33, 39 401–39 600, kolumn 1), not from the CSV the code uses;
 * 0,8 % and 4,6 % are Tjänstemannaavtalet § 4 mom 4; 31,42 % is
 * Skatteverket's 2026 rate. Everything else is arithmetic shown above.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payrollRulesAt } from "../../rules/payroll";
import { agiContributions, agiContributionTotal } from "../contributions";
import { DEFAULT_PAY_ITEMS } from "../pay-items.default";
import { assemblePayslip, reconcile } from "../payslip";
import { indexTaxTable, parseTaxTableCsv } from "../tax-tables";
import { monthlyPay } from "../time-to-pay";
import { lawVacationYearModel, monthlyVacationDayValue, paidDaysEarned, sameSalaryVacationPay, vacationLiability, vacationYears } from "../vacation";

const file = parseTaxTableCsv(readFileSync(join(__dirname, "skattetabell-manad-2026.sample.csv")));
const rules = payrollRulesAt("2026-06-25");
const tjm = rules.agreements.tjanstemannaavtalet;
const SALARY = 3_800_000;

test("fixture: månadslön 38 000 kr with five days of semester in June 2026", () => {
  const salary = monthlyPay({ agreement: tjm, monthlySalaryOre: SALARY, absences: [], codes: { salary: "1010", deduction: "1150" } });
  const vacation = sameSalaryVacationPay({ monthlySalaryOre: SALARY, daysTaken: 5, dailySupplementPercent: tjm.vacationDailySupplementPercent, variablePayOre: 0, variable: tjm.vacationVariablePay });
  assert.equal(vacation.supplementOre, 152_000);

  const doc = assemblePayslip({
    employee: { id: "anna", name: "Anna Andersson", birthYear: 1990 },
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    payDate: "2026-06-25",
    rules,
    payItems: DEFAULT_PAY_ITEMS,
    lines: [
      ...salary.lines,
      { code: "1510", text: "Semestertillägg 8–12 juni", quantity: 5, unit: "dag", unitPriceOre: 30_400, basisOre: SALARY, ratePercent: 0.8, amountOre: vacation.supplementOre, from: "2026-06-08", to: "2026-06-12" },
    ],
    tax: { kind: "table", tableNo: 33, columnNo: 1, adjustment: null, mainEmployer: true, source: "a-skattsedel" },
    taxTable: { version: file.sha256, rows: indexTaxTable(file.rows) },
    expectedAnnualPayOre: 12 * SALARY,
    hasRegularSalary: true,
  });

  assert.equal(doc.totals.cashGrossOre, 3_952_000);
  assert.equal(doc.totals.taxOre, 828_900);
  assert.equal(doc.totals.netOre, 3_123_100);
  assert.equal(doc.totals.employerContributionOre, 1_241_718);
  assert.equal(agiContributionTotal(agiContributions(rules, [doc.contributions])), 1_241_700);
  assert.deepEqual(doc.lines.map((l) => l.item.flags.account), ["7210", "7282"]);
  assert.equal(doc.taxTableVersion, file.sha256);
  assert.equal(reconcile(doc).ok, true);

  // By law June 2026's semester is paid by intjänandeår 2025-04-01–2026-03-31.
  const { paidBy } = vacationYears("2026-06-08", lawVacationYearModel(rules));
  assert.deepEqual(paidBy, { from: "2025-04-01", to: "2026-03-31" });
  const earned = paidDaysEarned({ rules, yearFrom: paidBy.from, yearTo: paidBy.to, employedFrom: "2024-01-01", employedTo: null, nonQualifyingDays: 0 });
  assert.equal(earned.paidDays, 25);
  const day = monthlyVacationDayValue(SALARY, tjm.vacationDayValuePercent, tjm.vacationDailySupplementPercent);
  assert.equal(day, 205_200);
  assert.equal(vacationLiability({ unusedDays: earned.paidDays - 5, perDayOre: day }), 4_104_000);
});
