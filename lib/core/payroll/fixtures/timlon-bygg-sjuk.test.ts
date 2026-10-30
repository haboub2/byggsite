/**
 * Fixture 2 (docs/hr-lon.md, section 12, phase 0): a byggnadsarbetare on
 * timlön under Byggavtalet, March 2026, with OB, two övertid hours and a
 * sick period from Thursday 12 March over the weekend to Tuesday 17 March.
 *
 *   Person: born 1988, tabell 33 kolumn 1, main employer. Timlön 210 kr.
 *   Schedule Mon–Fri 07–11 and 12–16 (8 h, 40 h a week).
 *   March 2026 has 22 working days; sick on 12, 13, 16, 17 → 18 worked.
 *   On Wed 25 March the day was 13–17 and 18–22 (OB2 18–22).
 *   Övertid Tue 24 March 16–18: one hour in band A (06–17, 30 %),
 *   one in band B (17–19, 50 %), paid as timlön + tillägg, no OB.
 *   Pay date 2026-04-24 (the 25th is a Saturday).
 *
 *   Timlön 18 × 8 = 144 h × 210                          30 240,00
 *   OB2 40 %: 4 h × 84                                      336,00
 *   Övertid A: 1 h × (210 + 63)                             273,00
 *   Övertid B: 1 h × (210 + 105)                            315,00
 *   Sjuklön 80 %: Thu, Fri, Mon, Tue = 32 h × 168         5 376,00
 *   Karensavdrag 20 % × (40 h × 168 = 6 720)             −1 344,00
 *   Bruttolön                                           35 196,00
 *   Skatteavdrag tabell 33 kol 1, 35 001–35 200 kr       −7 185
 *   Nettolön                                            28 011,00
 *   Arbetsgivaravgifter 31,42 % × 35 196                11 058,58 (AGI: 11 058)
 *   Sjuklönekostnad 5 376 − 1 344                         4 032,00
 *   Semester earned, 13 % × (30 240 + 336 + 588 + 6 720 for the
 *   semesterlönegrundande sick days)                     4 924,92
 *
 * How it was checked: 7 185 kr is read from SKVFS 2025:20's table PDF
 * (tabell 33, 35 001–35 200, kolumn 1); the karensavdrag follows
 * sjuklönelagen 6 § 2 st the same way as Verksamt's worked examples
 * (tested in sick-pay.test.ts); the bands are Byggavtalet § 2 p. 5 and
 * p. 6.1, the 13 % Bilaga I 1.1.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { addDays } from "../../rules/index";
import { payrollRulesAt } from "../../rules/payroll";
import { isWorkday } from "../../../workdays";
import { agiContributions, agiContributionTotal } from "../contributions";
import { DEFAULT_PAY_ITEMS } from "../pay-items.default";
import { assemblePayslip, reconcile } from "../payslip";
import { sickPay } from "../sick-pay";
import { indexTaxTable, parseTaxTableCsv } from "../tax-tables";
import { hourlyPay, type WorkBlock } from "../time-to-pay";
import { percentRuleVacationPay } from "../vacation";

const file = parseTaxTableCsv(readFileSync(join(__dirname, "skattetabell-manad-2026.sample.csv")));
const rules = payrollRulesAt("2026-04-24");
const bygg = rules.agreements.byggavtalet;
const RATE = 21_000;
const SICK = new Set(["2026-03-12", "2026-03-13", "2026-03-16", "2026-03-17"]);

test("fixture: timlön under Byggavtalet with OB, övertid and a sick period over a weekend", () => {
  const blocks: WorkBlock[] = [];
  for (let d = "2026-03-01"; d <= "2026-03-31"; d = addDays(d, 1)) {
    if (!isWorkday(d) || SICK.has(d)) continue;
    if (d === "2026-03-25") blocks.push({ date: d, start: "13:00", end: "17:00" }, { date: d, start: "18:00", end: "22:00" });
    else blocks.push({ date: d, start: "07:00", end: "11:00" }, { date: d, start: "12:00", end: "16:00" });
  }
  blocks.push({ date: "2026-03-24", start: "16:00", end: "18:00", overtime: true });
  const time = hourlyPay({ agreement: bygg, hourlyRateOre: RATE, blocks, codes: { base: "1100", ob: "1200", overtime: "1300" } });
  assert.equal(time.baseHours, 144);
  assert.deepEqual(time.obHours, { OB2: 4 });
  assert.deepEqual(time.overtimeHours, { A: 1, B: 1 });

  const sick = sickPay({
    rules,
    spells: [{ from: "2026-03-12", to: "2026-03-17" }],
    schedule: { kind: "weekly", hours: [8, 8, 8, 8, 8, 0, 0], holidaysOff: true },
    hourlyPayOre: RATE,
    averageWeeklyHours: 40,
    monthlySalary: false,
    previousWaitingDeductions: [],
    codes: { sickPay: "1400", waitingDeduction: "1410", sickDeduction: "1420" },
  });
  assert.equal(sick.periods[0].days.length, 6);
  assert.equal(sick.sickPayCostOre, 403_200);

  const doc = assemblePayslip({
    employee: { id: "bo", name: "Bo Byggare", birthYear: 1988 },
    periodStart: "2026-03-01",
    periodEnd: "2026-03-31",
    payDate: "2026-04-24",
    rules,
    payItems: DEFAULT_PAY_ITEMS,
    lines: [...time.lines, ...sick.lines],
    tax: { kind: "table", tableNo: 33, columnNo: 1, adjustment: null, mainEmployer: true, source: "a-skattsedel" },
    taxTable: { version: file.sha256, rows: indexTaxTable(file.rows) },
    expectedAnnualPayOre: 42_000_000,
    hasRegularSalary: true,
  });

  assert.deepEqual(doc.lines.map((l) => [l.code, l.amountOre]), [
    ["1100", 3_024_000],
    ["1200", 33_600],
    ["1300", 31_500], // band B, listed before A in the agreement data
    ["1300", 27_300],
    ["1400", 537_600],
    ["1410", -134_400],
  ]);
  assert.equal(doc.totals.cashGrossOre, 3_519_600);
  assert.equal(doc.totals.taxOre, 718_500);
  assert.equal(doc.totals.netOre, 2_801_100);
  assert.equal(doc.totals.employerContributionOre, 1_105_858);
  assert.equal(doc.totals.sickPayCostOre, 403_200);
  assert.equal(agiContributionTotal(agiContributions(rules, [doc.contributions])), 1_105_800);
  assert.equal(reconcile(doc).ok, true);

  // Semester under procentregeln at 13 %: this month's basis plus the sick days' pay.
  assert.equal(doc.bases.vacationBasisOre, 3_116_400);
  const imputed = 4 * 8 * RATE;
  assert.equal(percentRuleVacationPay(doc.bases.vacationBasisOre, imputed, bygg.vacationPercent, 25).totalOre, 492_492);
});
