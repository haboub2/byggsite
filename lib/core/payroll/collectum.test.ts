/**
 * Collectum's monthly report (collectum.ts): who and what counts, the
 * premium check, särskild löneskatt and the file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PAY_ITEMS } from "./pay-items.default";
import { assemblePayslip, type PayLineInput, type PayslipDocument } from "./payslip";
import { payrollRulesAt } from "../rules/payroll";
import { collectumBasis, collectumDueDate, collectumFile, premiumCheck, specialPayrollTax } from "./collectum";

const line = (code: string, amountOre: number, source?: PayLineInput["source"]): PayLineInput => ({ code, text: code, quantity: null, unit: null, unitPriceOre: null, basisOre: null, ratePercent: null, amountOre, source });

function slip(id: string, name: string, scheme: "itp1" | "saf-lo", lines: PayLineInput[]): PayslipDocument {
  const doc = assemblePayslip({
    employee: { id, name, birthYear: 1985 },
    periodStart: "2026-11-01",
    periodEnd: "2026-11-30",
    payDate: "2026-11-25",
    rules: payrollRulesAt("2026-11-25"),
    payItems: DEFAULT_PAY_ITEMS,
    lines,
    tax: { kind: "table", tableNo: 33, columnNo: 1, adjustment: { mode: "percent", percent: 30, validTo: "2026-12-31" }, mainEmployer: true, source: "manual" },
    taxTable: null,
    expectedAnnualPayOre: 50_000_000,
    hasRegularSalary: true,
  });
  doc.context = { timeFrom: "2026-10-01", timeTo: "2026-10-31", taxTableImportId: null, pnrMasked: "", group: "salaried", yearToDate: { cashGrossOre: 0, taxOre: 0 }, vacation: { rule: "none", remainingDays: null, liabilityOre: 0, liabilityChangeOre: 0 }, pension: { scheme, premiumOre: 0 }, correctionIds: [] };
  return doc;
}

test("the basis: ITP1 people only, pension-reportable pay only (not benefits, mileage, utlägg or board fees), öre dropped", () => {
  const erik = slip("erik", "Erik Eriksson", "itp1", [line("1010", 3_000_050), line("1510", 50_000), line("1800", 600_300, { kind: "benefit", id: "b" }), line("1910", 150_000, { kind: "expense_claim", id: "c" }), line("1911", 30_000, { kind: "expense_claim", id: "c" }), line("1920", 45_000), line("1600", 500_000)]);
  const bo = slip("bo", "Bo Byggare", "saf-lo", [line("1100", 3_000_000)]);
  const basis = collectumBasis("2026-11", [
    { payslipId: "p1", employeeId: "erik", document: erik },
    { payslipId: "p2", employeeId: "bo", document: bo },
  ]);
  assert.deepEqual(basis, [{ employeeId: "erik", name: "Erik Eriksson", payslipIds: ["p1"], payOre: 3_050_000 }]);
  assert.throws(() => collectumBasis("2026-12", [{ payslipId: "p1", employeeId: "erik", document: erik }]), /inte i 2026-12/);
});

test("the premium: 4,5 % up to 52 125 kr a month and 30 % above; särskild löneskatt 24,26 %", () => {
  const lines = [
    { employeeId: "a", name: "A", payslipIds: [], payOre: 3_000_000 },
    { employeeId: "b", name: "B", payslipIds: [], payOre: 6_000_000 },
  ];
  const check = premiumCheck("2026-11", lines, new Map([["a", 135_000], ["b", 0]]));
  assert.equal(check[0].expectedPremiumOre, 135_000); // 4,5 % × 30 000
  assert.equal(check[0].ok, true);
  // 4,5 % × 52 125 = 2 345,63 → 2 346; 30 % × 7 875 = 2 362,50 → 2 363 (whole kronor per part, as pensionPremium)
  assert.equal(check[1].expectedPremiumOre, 234_600 + 236_300);
  assert.equal(check[1].ok, false);
  assert.equal(specialPayrollTax("2026-11-25", 135_000), 32_751); // 1 350 × 24,26 % = 327,51
  // Skatteverket's example: premier 200 000 kr → 48 520 kr.
  assert.equal(specialPayrollTax("2026-11-25", 20_000_000), 4_852_000);
});

test("the deadline is Collectum's cutoff in the month after; the file has the pay in kronor in the sixth column", () => {
  assert.equal(collectumDueDate("2026-11"), "2026-12-14");
  assert.equal(collectumDueDate("2026-12"), "2027-01-14");
  const file = collectumFile({ period: "2026-11", customerNo: "123456", lines: [{ employeeId: "erik", name: "Erik Eriksson", payslipIds: [], payOre: 3_050_000 }], pnr: () => "19900630-1234" });
  assert.equal(file, "personnummer;fornamn;efternamn;kundnummer;manad;bruttolon\r\n199006301234;Erik;Eriksson;123456;2026-11;30500\r\n");
  assert.throws(() => collectumFile({ period: "2026-11", customerNo: "", lines: [], pnr: () => "" }), /kundnummer/);
});
