import { test } from "node:test";
import assert from "node:assert/strict";
import { payrollRulesAt } from "../rules/payroll";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import { assemblePayslip } from "./payslip";
import { accrualLines, payslipJournal, reconciliationSums, runJournal } from "./ledger";
import { payrollSettingsSchema } from "./settings";

const accounts = payrollSettingsSchema.parse({}).accounts;
const rules = payrollRulesAt("2026-11-25");
const doc = (id: string, code: string, amountOre: number, extra: { code: string; amountOre: number }[] = []) =>
  assemblePayslip({
    employee: { id, name: id, birthYear: 1980 },
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    payDate: "2026-11-25",
    rules,
    payItems: DEFAULT_PAY_ITEMS,
    lines: [{ code, text: "Lön", quantity: 1, unit: "mån", unitPriceOre: amountOre, basisOre: null, ratePercent: null, amountOre }, ...extra.map((e) => ({ ...e, text: e.code, quantity: null, unit: null, unitPriceOre: null, basisOre: null, ratePercent: null }))],
    tax: { kind: "table", tableNo: 33, columnNo: 1, adjustment: { mode: "percent", percent: 30, validTo: "2026-12-31" }, mainEmployer: true, source: "manual" },
    taxTable: null,
    expectedAnnualPayOre: 12 * amountOre,
    hasRegularSalary: true,
  });

test("the journal: one line per account, as payroll_run_book() sums the stored lines", () => {
  const a = doc("a", "1010", 3_200_000, [{ code: "1820", amountOre: 50_000 }]);
  const b = doc("b", "1100", 1_800_000);
  const lines = payslipJournal([a, b], accounts);
  const by = Object.fromEntries(lines.map((l) => [l.account, l.debitOre - l.creditOre]));
  assert.equal(by["7210"], 3_200_000);
  assert.equal(by["7010"], 1_800_000);
  assert.equal(by["7389"], 50_000);
  assert.equal(by["7399"], -50_000);
  assert.equal(by["2710"], -(a.totals.taxOre + b.totals.taxOre));
  assert.equal(by["2820"], -(a.totals.netOre + b.totals.netOre));
  assert.equal(by["7510"], a.totals.employerContributionOre + b.totals.employerContributionOre);
  assert.equal(lines.reduce((s, l) => s + l.debitOre - l.creditOre, 0), 0);
  assert.equal(reconciliationSums({ docs: [a, b], journal: lines, bankTotalOre: a.totals.netOre + b.totals.netOre, netAccount: "2820" }).ok, true);
});

test("accruals: semesterlöneskuld change with avgifter at the person's rate, the pension premium and its särskild löneskatt", () => {
  const a = doc("a", "1010", 3_200_000);
  const acc = accrualLines([{ document: a, group: "salaried", vacationLiabilityChangeOre: 100_000, pensionPremiumOre: 144_000 }], accounts);
  const by = Object.fromEntries(acc.map((l) => [l.account, l.debitOre - l.creditOre]));
  // Särskild löneskatt 24,26 % × 1 440 kr = 349,34 kr (phase 5); no scheme on the document, no insurance.
  assert.deepEqual(by, { "2514": -34_934, "2920": -100_000, "2941": -31_420, "2950": -144_000, "7290": 100_000, "7410": 144_000, "7519": 31_420, "7533": 34_934 });
  // A falling liability reverses the cost.
  const down = accrualLines([{ document: a, group: "collective", vacationLiabilityChangeOre: -50_000, pensionPremiumOre: 0 }], accounts);
  assert.equal(down.find((l) => l.account === "7090")?.creditOre, 50_000);
  const j = runJournal([{ document: a, group: "salaried", vacationLiabilityChangeOre: 100_000, pensionPremiumOre: 144_000 }], accounts);
  assert.equal(j.debitOre, j.creditOre);
});
