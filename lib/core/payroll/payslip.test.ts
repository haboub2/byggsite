import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sumOre } from "../money";
import { payrollRulesAt } from "../rules/payroll";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import { assemblePayslip, journalLines, reconcile, type PayLineInput, type PayslipInput } from "./payslip";
import { lineAmount } from "../money";
import { monthlyToHourlyOre, sickPay } from "./sick-pay";
import { indexTaxTable, parseTaxTableCsv } from "./tax-tables";
import { percentRuleVacationPay } from "./vacation";

const file = parseTaxTableCsv(readFileSync(join(__dirname, "fixtures", "skattetabell-manad-2026.sample.csv")));
const taxTable = { version: file.sha256, rows: indexTaxTable(file.rows) };
const rules = payrollRulesAt("2026-06-25");

const line = (code: string, amountOre: number, text = code): PayLineInput => ({ code, text, quantity: null, unit: null, unitPriceOre: null, basisOre: null, ratePercent: null, amountOre });

const slip = (lines: PayLineInput[], over: Partial<PayslipInput> = {}) =>
  assemblePayslip({
    employee: { id: "e1", name: "Test Testsson", birthYear: 1990 },
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    payDate: "2026-06-25",
    rules,
    payItems: DEFAULT_PAY_ITEMS,
    lines,
    tax: { kind: "table", tableNo: 33, columnNo: 1, adjustment: null, mainEmployer: true, source: "a-skattsedel" },
    taxTable,
    expectedAnnualPayOre: 42_000_000,
    hasRegularSalary: true,
    ...over,
  });

test("a plain month: salary, tax by table, net, avgifter at the full rate", () => {
  const doc = slip([line("1010", 3_500_000)]);
  assert.equal(doc.totals.cashGrossOre, 3_500_000);
  assert.equal(doc.totals.taxOre, 713_400);
  assert.equal(doc.totals.netOre, 2_786_600);
  assert.equal(doc.contributions.category, "full");
  assert.equal(doc.totals.employerContributionOre, 1_099_700); // 31,42 % of 35 000
  assert.equal(doc.taxTableVersion, file.sha256);
  assert.equal(doc.ruleSetValidFrom, rules.validFrom);
  assert.equal(doc.lines[0].item.flags.account, "7210");
  assert.equal(reconcile(doc).ok, true);
});

test("benefits are taxed and carry avgifter but are not paid out; tax-free expenses are paid but not taxed", () => {
  const doc = slip([line("1010", 3_000_000), line("1810", 200_000, "Kostförmån"), line("1910", 75_000), line("2000", -50_000)]);
  assert.equal(doc.bases.tableTaxableOre, 3_200_000);
  assert.equal(doc.bases.contributionBaseOre, 3_200_000);
  // Bruttolön is the pay only; the 750 kr tax-free milersättning is paid out with the net.
  assert.equal(doc.totals.cashGrossOre, 3_000_000);
  assert.equal(doc.totals.taxFreeReimbursementOre, 75_000);
  assert.equal(doc.totals.benefitOre, 200_000);
  // Tabell 33 kolumn 1 at 32 000 kr: 6 381 kr.
  assert.equal(doc.totals.taxOre, 638_100);
  assert.equal(doc.totals.netOre, 3_000_000 + 75_000 - 638_100 - 50_000);
  const r = reconcile(doc);
  assert.equal(r.ok, true, r.problems.join(" "));
  const j = journalLines(doc);
  assert.deepEqual(j.find((x) => x.account === "7399"), { account: "7399", debitOre: 0, creditOre: 200_000, text: "Motkonto Kostförmån" });
  assert.equal(j.find((x) => x.account === "2710")?.creditOre, 638_100);
});

test("sjuklön lines sum to the box 499 figure", () => {
  const doc = slip([line("1100", 2_000_000), line("1400", 512_000), line("1410", -128_000)]);
  assert.equal(doc.totals.sickPayCostOre, 384_000);
});

test("reconcile catches a tampered document", () => {
  const doc = slip([line("1010", 3_500_000)]);
  const tampered = { ...doc, totals: { ...doc.totals, netOre: doc.totals.netOre + 100 } };
  const r = reconcile(tampered);
  assert.equal(r.ok, false);
  assert.match(r.problems.join(" "), /Nettolönen/);
  const edited = { ...doc, lines: [{ ...doc.lines[0], amountOre: 3_600_000 }] };
  assert.equal(reconcile(edited).ok, false);
});

test("procentregeln: a månadslön month with sjukavdrag plus the imputed sick pay has the same basis as a month without sickness", () => {
  // 38 000 kr, 40 h a week, sick Monday–Friday 9–13 March: 40 h deducted at 219,23 kr.
  const hourly = monthlyToHourlyOre(3_800_000, 40);
  const sick = sickPay({
    rules,
    spells: [{ from: "2026-03-09", to: "2026-03-13" }],
    schedule: { kind: "weekly", hours: [8, 8, 8, 8, 8, 0, 0], holidaysOff: true },
    hourlyPayOre: hourly,
    averageWeeklyHours: 40,
    monthlySalary: true,
    previousWaitingDeductions: [],
    codes: { sickPay: "1401", waitingDeduction: "1411", sickDeduction: "1421" },
  });
  const healthy = slip([line("1010", 3_800_000)]);
  const ill = slip([line("1010", 3_800_000), ...sick.lines]);
  // The sick days are semesterlönegrundande: the vacation calculator adds what they would have paid.
  const imputed = lineAmount(hourly, 40);
  assert.equal(ill.bases.vacationBasisOre + imputed, healthy.bases.vacationBasisOre);
  assert.equal(
    percentRuleVacationPay(ill.bases.vacationBasisOre, imputed, 12, 25).totalOre,
    percentRuleVacationPay(healthy.bases.vacationBasisOre, 0, 12, 25).totalOre,
  );
});

test("an unknown pay item code is refused", () => {
  assert.throws(() => slip([line("9999", 100)]), /Lönearten 9999/);
});

// A small deterministic PRNG so the property test is reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test("property: for random payslips the lines sum to the totals, net = gross + tax-free − tax + net adjustments, the journal balances", () => {
  const random = mulberry32(20261030);
  const codes = DEFAULT_PAY_ITEMS.map((i) => i.code);
  for (let n = 0; n < 300; n++) {
    const count = 1 + Math.floor(random() * 8);
    const lines: PayLineInput[] = [];
    for (let i = 0; i < count; i++) {
      const code = codes[Math.floor(random() * codes.length)];
      const kind = DEFAULT_PAY_ITEMS.find((p) => p.code === code)!.kind;
      const negative = kind === "sick_deduction" || kind === "vacation_deduction" || kind === "net_adjustment" || (kind === "gross_adjustment" && code.startsWith("115"));
      const amount = Math.floor(random() * 6_000_000) + 1;
      lines.push(line(code, negative ? -Math.floor(amount / 10) : amount));
    }
    const birthYear = 1930 + Math.floor(random() * 80);
    const mainEmployer = random() > 0.2;
    const doc = slip(lines, {
      employee: { id: `e${n}`, name: "P", birthYear },
      tax: { kind: "table", tableNo: 32 + Math.floor(random() * 3), columnNo: 1 + Math.floor(random() * 6), adjustment: null, mainEmployer, source: "manual" },
      expectedAnnualPayOre: Math.floor(random() * 120_000_000),
      hasRegularSalary: random() > 0.3,
    });
    const r = reconcile(doc);
    assert.equal(r.ok, true, `case ${n}: ${r.problems.join(" ")}`);
    assert.equal(sumOre(doc.lines.map((l) => l.amountOre)), doc.totals.cashGrossOre + doc.totals.taxFreeReimbursementOre + doc.totals.benefitOre + doc.totals.netAdjustmentOre);
    assert.equal(r.journalDebitOre, r.journalCreditOre);
    assert.equal(doc.totals.taxOre % 100, 0);
  }
});
