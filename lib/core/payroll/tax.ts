/**
 * Preliminary tax for one payslip (docs/hr-lon.md, section 5 step 5), from
 * the employee's `employee_tax` row: table and column, jämkning, and
 * whether we are the main employer. Regular pay goes through the monthly
 * table, lump sums (bonus, retro, semesterersättning at termination)
 * through engångsskatt, separately. Every amount is whole kronor.
 */

import { rateOf, truncateToKronor, type Ore } from "../money";
import type { IsoDate } from "../rules/index";
import type { PayrollRuleSet } from "../rules/payroll";
import { lumpSumPercent, tableTax, type TaxTableIndex, type TaxTableRow } from "./tax-tables";

/**
 * The shape of an `employee_tax` row valid on the pay date. "table" is the
 * normal case (A-skattsedel: table and column, or the 30 % side-income rate
 * when we are not the main employer); a percent decided by Skatteverket is
 * a jämkning with its validity, not a kind of its own. "none" is for a
 * person Skatteverket has exempted from skatteavdrag here.
 */
export type EmployeeTax = {
  kind: "table" | "none";
  tableNo: number | null;
  /** 1 for most employees; 3 for pay to someone who was 66 at the start of the year. */
  columnNo: number | null;
  /** Jämkning, as Skatteverket decided it: a percent, or an amount the monthly pay is changed by before the table. */
  adjustment:
    | null
    | { mode: "percent"; percent: number; validTo: IsoDate }
    | { mode: "amount"; monthlyIncomeChangeOre: Ore; validTo: IsoDate };
  /** False: sidoinkomst, 30 % on everything (unless jämkning says otherwise). */
  mainEmployer: boolean;
  source: "a-skattsedel" | "skatteverket-api" | "manual";
};

export type TaxMethod =
  | "table"
  | "jamkning-percent"
  | "jamkning-amount"
  | "side-income"
  | "none"
  | "below-annual-threshold"
  | "below-single-payment";

export type TaxResult = {
  method: TaxMethod;
  /** Tax on the table base (or the percent method's whole base). */
  tableOre: Ore;
  /** Engångsskatt on the lump-sum base. */
  lumpSumOre: Ore;
  totalOre: Ore;
  tableNo: number | null;
  columnNo: number | null;
  /** The percent used for the lump sum or the percent method, null for a pure table deduction. */
  lumpSumPercent: number | null;
  percent: number | null;
  usedTable: boolean;
};

export type TaxInput = {
  rules: PayrollRuleSet;
  payDate: IsoDate;
  tax: EmployeeTax;
  tableBaseOre: Ore;
  lumpSumBaseOre: Ore;
  taxTable: readonly TaxTableRow[] | TaxTableIndex | null;
  /** The person's expected pay from us this year including this payslip. */
  expectedAnnualPayOre: Ore;
  /** No regular salary from us: engångsbelopp at the rule set's flat percent. */
  hasRegularSalary: boolean;
};

const percentTax = (base: Ore, percent: number): Ore => (base <= 0 ? 0 : truncateToKronor(rateOf(base, percent, "down")));

export function preliminaryTax(input: TaxInput): TaxResult {
  const { rules, tax, tableBaseOre, lumpSumBaseOre } = input;
  const result = (r: Partial<TaxResult> & Pick<TaxResult, "method">): TaxResult => {
    const tableOre = r.tableOre ?? 0;
    const lumpSumOre = r.lumpSumOre ?? 0;
    return {
      tableNo: null,
      columnNo: null,
      lumpSumPercent: null,
      percent: null,
      usedTable: false,
      ...r,
      tableOre,
      lumpSumOre,
      totalOre: tableOre + lumpSumOre,
    };
  };

  if (input.expectedAnnualPayOre < rules.employerContributions.minAnnualPayOre) return result({ method: "below-annual-threshold" });
  if (tax.kind === "none") return result({ method: "none" });
  // SFL 10 kap. 4 § 1: no skatteavdrag on a payment below 100 kr.
  const paymentOre = tableBaseOre + lumpSumBaseOre;
  if (paymentOre > 0 && paymentOre < rules.preliminaryTax.minSinglePaymentOre) return result({ method: "below-single-payment" });

  const adjustment = tax.adjustment && tax.adjustment.validTo >= input.payDate ? tax.adjustment : null;

  if (adjustment?.mode === "percent") {
    return result({ method: "jamkning-percent", tableOre: percentTax(tableBaseOre, adjustment.percent), lumpSumOre: percentTax(lumpSumBaseOre, adjustment.percent), percent: adjustment.percent });
  }
  if (!tax.mainEmployer) {
    const p = rules.preliminaryTax.sideIncomePercent;
    return result({ method: "side-income", tableOre: percentTax(tableBaseOre, p), lumpSumOre: percentTax(lumpSumBaseOre, p), percent: p });
  }

  // We are the main employer: the table decides. Never fall back to a flat rate.
  if (tax.tableNo === null || tax.columnNo === null) {
    throw new Error("Skattetabell och kolumn saknas för den anställde: lägg in A-skattsedeln (eller tabell och kolumn från Skatteverket) innan lönen räknas.");
  }
  if (!input.taxTable) throw new Error(`Skattetabellerna för ${input.payDate.slice(0, 4)} är inte importerade.`);
  const column = tax.columnNo;
  const tableIncome = adjustment?.mode === "amount" ? Math.max(0, tableBaseOre + adjustment.monthlyIncomeChangeOre) : tableBaseOre;
  const tableOre = tableTax(input.taxTable, tax.tableNo, column, tableIncome);

  let lumpSumOre = 0;
  let lumpPercent: number | null = null;
  if (lumpSumBaseOre > 0) {
    lumpPercent = input.hasRegularSalary
      ? lumpSumPercent(rules, column, input.expectedAnnualPayOre)
      : rules.preliminaryTax.lumpSum.noRegularSalaryPercent;
    lumpSumOre = percentTax(lumpSumBaseOre, lumpPercent);
  }
  return result({
    method: adjustment?.mode === "amount" ? "jamkning-amount" : "table",
    tableOre,
    lumpSumOre,
    tableNo: tax.tableNo,
    columnNo: column,
    lumpSumPercent: lumpPercent,
    usedTable: true,
  });
}
