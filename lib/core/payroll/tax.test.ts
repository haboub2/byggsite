import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { payrollRulesAt } from "../rules/payroll";
import { preliminaryTax, type EmployeeTax, type TaxInput } from "./tax";
import { indexTaxTable, parseTaxTableCsv } from "./tax-tables";

const table = indexTaxTable(parseTaxTableCsv(readFileSync(join(__dirname, "fixtures", "skattetabell-manad-2026.sample.csv"))).rows);
const rules = payrollRulesAt("2026-06-25");
const t33: EmployeeTax = { kind: "table", tableNo: 33, columnNo: 1, adjustment: null, mainEmployer: true, source: "a-skattsedel" };
const input = (over: Partial<TaxInput>): TaxInput => ({
  rules,
  payDate: "2026-06-25",
  tax: t33,
  tableBaseOre: 3_500_000,
  lumpSumBaseOre: 0,
  taxTable: table,
  expectedAnnualPayOre: 42_000_000,
  hasRegularSalary: true,
  ...over,
});

test("table tax on the month's pay: tabell 33 kolumn 1, 35 000 kr → 7 134 kr", () => {
  const r = preliminaryTax(input({}));
  assert.equal(r.method, "table");
  assert.equal(r.totalOre, 713_400);
  assert.equal(r.usedTable, true);
});

test("lump sum separately: bonus 20 000 kr at 26 % for an expected 440 000 kr year", () => {
  const r = preliminaryTax(input({ lumpSumBaseOre: 2_000_000, expectedAnnualPayOre: 44_000_000 }));
  assert.equal(r.tableOre, 713_400);
  assert.equal(r.lumpSumPercent, 26);
  assert.equal(r.lumpSumOre, 520_000);
  assert.equal(r.totalOre, 1_233_400);
  // No regular salary from us: 30 %.
  assert.equal(preliminaryTax(input({ tableBaseOre: 0, lumpSumBaseOre: 2_000_000, hasRegularSalary: false })).lumpSumOre, 600_000);
});

test("jämkning: a percent replaces the table while valid; an amount moves the pay before the table", () => {
  const pct = preliminaryTax(input({ tax: { ...t33, adjustment: { mode: "percent", percent: 25, validTo: "2026-12-31" } } }));
  assert.equal(pct.method, "jamkning-percent");
  assert.equal(pct.totalOre, 875_000);
  const expired = preliminaryTax(input({ tax: { ...t33, adjustment: { mode: "percent", percent: 25, validTo: "2026-05-31" } } }));
  assert.equal(expired.method, "table");
  assert.equal(expired.totalOre, 713_400);
  // Pay reduced by 3 000 kr: 32 000 kr in tabell 33 → 6 381 kr.
  const amount = preliminaryTax(input({ tax: { ...t33, adjustment: { mode: "amount", monthlyIncomeChangeOre: -300_000, validTo: "2026-12-31" } } }));
  assert.equal(amount.method, "jamkning-amount");
  assert.equal(amount.totalOre, 638_100);
});

test("not the main employer: 30 % on everything, öre dropped", () => {
  const r = preliminaryTax(input({ tax: { ...t33, mainEmployer: false }, tableBaseOre: 1_234_567, lumpSumBaseOre: 0 }));
  assert.equal(r.method, "side-income");
  // 30 % of 12 345,67 kr = 3 703,70 kr → 3 703 kr.
  assert.equal(r.totalOre, 370_300);
  assert.equal(r.usedTable, false);
});

test("no tax under the 1 000 kr year rule, or for kind none", () => {
  assert.equal(preliminaryTax(input({ tableBaseOre: 90_000, expectedAnnualPayOre: 90_000 })).method, "below-annual-threshold");
  assert.equal(preliminaryTax(input({ tableBaseOre: 90_000, expectedAnnualPayOre: 90_000 })).totalOre, 0);
  assert.equal(preliminaryTax(input({ tax: { ...t33, kind: "none" } })).totalOre, 0);
});

test("refuses to guess: no table imported, or a main employer without the A-skattsedel's table", () => {
  assert.throws(() => preliminaryTax(input({ taxTable: null })), /inte importerade/);
  assert.throws(() => preliminaryTax(input({ tax: { ...t33, tableNo: null } })), /A-skattsedeln/);
  assert.throws(() => preliminaryTax(input({ tax: { ...t33, columnNo: null } })), /A-skattsedeln/);
  // Not the main employer needs no table: 30 %.
  assert.equal(preliminaryTax(input({ tax: { ...t33, tableNo: null, columnNo: null, mainEmployer: false } })).method, "side-income");
});

test("SFL 10 kap. 4 § 1: no skatteavdrag on a payment below 100 kr", () => {
  const small = preliminaryTax(input({ tax: { ...t33, mainEmployer: false }, tableBaseOre: 9_999 }));
  assert.equal(small.method, "below-single-payment");
  assert.equal(small.totalOre, 0);
  assert.equal(preliminaryTax(input({ tax: { ...t33, mainEmployer: false }, tableBaseOre: 10_000 })).totalOre, 3_000);
});
