/**
 * Fixture 3 (docs/hr-lon.md, section 12, phase 0): a styrelseledamot paid
 * a quarterly arvode, where we are not the main employer.
 *
 *   Person: born 1972 (full avgift in 2026), A-skatt with another main employer.
 *   Stämman decided 60 000 kr a year, paid quarterly: 15 000 kr on 2026-03-25.
 *
 *   Skatteavdrag  30 % of 15 000 kr (sidoinkomst, SKV 401)  = 4 500 kr
 *   Netto         15 000 − 4 500                              = 10 500 kr
 *   Avgifter      31,42 % of 15 000 kr                        = 4 713 kr
 *   AGI           ruta 011 15 000 (and 023 "varav styrelsearvode"),
 *                 ruta 001 4 500; avgifter on the month's underlag,
 *                 öre dropped: 4 713 kr
 *   Bokföring     7240 D 15 000; 2710 K 4 500; 2820 K 10 500;
 *                 7510 D 4 713; 2731 K 4 713
 *
 * Checked by hand: 30 % is the flat sidoinkomst rate (rule book
 * preliminaryTax.sideIncomePercent), 31,42 % the full rate; no table is
 * used, so the payslip has no tax table version.
 *
 * And the 1 000 kr rule: a member paid 900 kr for the whole year gets no
 * skatteavdrag and no avgifter; the amount goes in ruta 131.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollRulesAt } from "../../rules/payroll";
import { agiContributions, agiContributionTotal } from "../contributions";
import { DEFAULT_PAY_ITEMS } from "../pay-items.default";
import { assemblePayslip, journalLines, reconcile, type PayLineInput } from "../payslip";

const rules = payrollRulesAt("2026-03-25");
const fee = (amountOre: number): PayLineInput => ({
  code: "1600",
  text: "Styrelsearvode kv 1 2026",
  quantity: 1,
  unit: "st",
  unitPriceOre: amountOre,
  basisOre: null,
  ratePercent: null,
  amountOre,
  from: "2026-01-01",
  to: "2026-03-31",
});

const payslip = (amountOre: number, expectedAnnualPayOre: number, birthYear = 1972) =>
  assemblePayslip({
    employee: { id: "board-1", name: "Styrelseledamot", birthYear },
    periodStart: "2026-01-01",
    periodEnd: "2026-03-31",
    payDate: "2026-03-25",
    rules,
    payItems: DEFAULT_PAY_ITEMS,
    lines: [fee(amountOre)],
    tax: { kind: "table", tableNo: 33, columnNo: 1, adjustment: null, mainEmployer: false, source: "manual" },
    taxTable: null,
    expectedAnnualPayOre,
    hasRegularSalary: false,
  });

test("fixture: styrelsearvode 15 000 kr a quarter, not the main employer", () => {
  const doc = payslip(1_500_000, 6_000_000);
  assert.equal(doc.tax.method, "side-income");
  assert.equal(doc.totals.taxOre, 450_000);
  assert.equal(doc.totals.netOre, 1_050_000);
  assert.equal(doc.contributions.category, "full");
  assert.equal(doc.totals.employerContributionOre, 471_300);
  assert.equal(doc.taxTableVersion, null);
  assert.equal(doc.bases.vacationBasisOre, 0);
  assert.equal(doc.bases.pensionBasisOre, 0);
  assert.equal(doc.lines[0].item.flags.agiBox, "011");
  assert.deepEqual(
    journalLines(doc).map((j) => [j.account, j.debitOre, j.creditOre]),
    [
      ["7240", 1_500_000, 0],
      ["2710", 0, 450_000],
      ["2820", 0, 1_050_000],
      ["7510", 471_300, 0],
      ["2731", 0, 471_300],
    ],
  );
  assert.equal(reconcile(doc).ok, true);
  assert.equal(agiContributionTotal(agiContributions(rules, [doc.contributions])), 471_300);
});

test("fixture: under 1 000 kr for the year, no skatteavdrag and no avgifter", () => {
  const doc = payslip(90_000, 90_000);
  assert.equal(doc.tax.method, "below-annual-threshold");
  assert.equal(doc.totals.taxOre, 0);
  assert.equal(doc.contributions.category, "below-annual-threshold");
  assert.equal(doc.totals.employerContributionOre, 0);
  assert.equal(doc.totals.netOre, 90_000);
});

test("fixture: the same fee to a member born 1955 carries only ålderspensionsavgift", () => {
  const doc = payslip(1_500_000, 6_000_000, 1955);
  assert.equal(doc.contributions.category, "older");
  // 10,21 % of 15 000 kr = 1 531,50 kr
  assert.equal(doc.totals.employerContributionOre, 153_150);
});
