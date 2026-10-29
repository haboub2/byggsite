/**
 * One employee's payslip for one run: the calculators' lines plus the pay
 * item register become the frozen document (docs/hr-lon.md, section 3
 * `payslips.document` and section 5 steps 4–7). Every line carries its pay
 * item's flags as they were at approval, the basis, rate and the rule set
 * date, so the document recomputes the same way forever.
 *
 * `reconcile()` returns the sums the run gate compares (payslips =
 * journal = AGI = bank file) and checks the document against itself.
 */

import { sumOre, type Ore } from "../money";
import type { IsoDate } from "../rules/index";
import type { PayrollRuleSet } from "../rules/payroll";
import { employerContributions, type ContributionResult } from "./contributions";
import { preliminaryTax, type EmployeeTax, type TaxResult } from "./tax";
import type { TaxTableIndex, TaxTableRow } from "./tax-tables";

export type PayItemKind =
  | "salary"
  | "hourly"
  | "overtime"
  | "ob"
  | "sick_pay"
  | "sick_deduction"
  | "vacation_pay"
  | "vacation_deduction"
  | "fee"
  | "benefit"
  | "expense"
  | "mileage"
  | "per_diem"
  | "gross_adjustment"
  | "net_adjustment"
  | "retro";

export type TaxMode = "table" | "lump_sum" | "none";

/** The flags on a pay item that decide everything downstream (section 3, `pay_items`). */
export type PayItemFlags = {
  /** Counts as taxable income. */
  taxable: boolean;
  /** Which preliminary tax applies: the monthly table, engångsskatt, or none. */
  taxMode: TaxMode;
  subjectToEmployerContribution: boolean;
  /** Counts as semesterlönegrundande lön under procentregeln. */
  vacationPayBasis: boolean;
  /** Counts as pay reported to Fora or Collectum. */
  pensionReportable: boolean;
  /** AGI field code (ruta) the amount is reported in, null if not reported. */
  agiBox: string | null;
  /** BAS account debited (credited for negative amounts). */
  account: string;
  /** BAS account on the other side: 2820 Löneskuld for cash pay, 7399 for benefits. */
  counterAccount: string;
  /** Fora reporting category (SAF-LO), null when not reported to Fora. */
  foraCategory: string | null;
};

export type PayItem = {
  code: string;
  name: string;
  kind: PayItemKind;
  /** Bumped on every edit of the register; the payslip stores the version it used. */
  version: number;
  flags: PayItemFlags;
};

/** What a calculator produces: one line, before the register's flags are attached. */
export type PayLineInput = {
  code: string;
  text: string;
  quantity: number | null;
  unit: "h" | "dag" | "mil" | "st" | "mån" | null;
  unitPriceOre: Ore | null;
  /** For percent lines: what the percent is taken of (OB's hourly base, karens' weekly sjuklön). */
  basisOre: Ore | null;
  ratePercent: number | null;
  amountOre: Ore;
  from?: IsoDate;
  to?: IsoDate;
};

export type PayslipLine = PayLineInput & {
  item: { code: string; name: string; kind: PayItemKind; version: number; flags: PayItemFlags };
};

export type PayslipBases = {
  /** Taxable pay under the monthly table (cash and benefits). */
  tableTaxableOre: Ore;
  /** Taxable pay under engångsskatt. */
  lumpSumTaxableOre: Ore;
  contributionBaseOre: Ore;
  vacationBasisOre: Ore;
  pensionBasisOre: Ore;
  /** Cash before tax (everything except benefits and net adjustments). */
  cashGrossOre: Ore;
  benefitOre: Ore;
  netAdjustmentOre: Ore;
  /** Sjuklön after karensavdrag (sjuklönekostnad, a report figure; no longer an AGI box). */
  sickPayCostOre: Ore;
};

export type PayslipDocument = {
  schema: 1;
  employeeId: string;
  employeeName: string;
  birthYear: number;
  periodStart: IsoDate;
  periodEnd: IsoDate;
  payDate: IsoDate;
  /** validFrom of the payroll rule set used. */
  ruleSetValidFrom: IsoDate;
  /** Identifies the imported tax table (its SHA-256), null when no table was used. */
  taxTableVersion: string | null;
  lines: PayslipLine[];
  bases: PayslipBases;
  tax: TaxResult;
  contributions: ContributionResult;
  totals: {
    cashGrossOre: Ore;
    benefitOre: Ore;
    taxOre: Ore;
    netAdjustmentOre: Ore;
    netOre: Ore;
    employerContributionOre: Ore;
    sickPayCostOre: Ore;
  };
};

export type PayslipInput = {
  employee: { id: string; name: string; birthYear: number };
  periodStart: IsoDate;
  periodEnd: IsoDate;
  payDate: IsoDate;
  rules: PayrollRuleSet;
  payItems: readonly PayItem[];
  lines: readonly PayLineInput[];
  tax: EmployeeTax;
  taxTable: { version: string; rows: readonly TaxTableRow[] | TaxTableIndex } | null;
  /** The person's expected pay from us this year including this payslip (engångsskatt bracket, 1 000 kr rule). */
  expectedAnnualPayOre: Ore;
  /** Regular salary from us this year: false makes engångsbelopp 30 %. */
  hasRegularSalary: boolean;
};

export function payItemByCode(items: readonly PayItem[], code: string): PayItem {
  const item = items.find((i) => i.code === code);
  if (!item) throw new Error(`Lönearten ${code} finns inte i löneartsregistret.`);
  return item;
}

function sumWhere(lines: readonly PayslipLine[], pick: (l: PayslipLine) => boolean): Ore {
  return sumOre(lines.filter(pick).map((l) => l.amountOre));
}

export function payslipBases(lines: readonly PayslipLine[]): PayslipBases {
  const f = (l: PayslipLine) => l.item.flags;
  const k = (l: PayslipLine) => l.item.kind;
  return {
    tableTaxableOre: sumWhere(lines, (l) => f(l).taxable && f(l).taxMode === "table"),
    lumpSumTaxableOre: sumWhere(lines, (l) => f(l).taxable && f(l).taxMode === "lump_sum"),
    contributionBaseOre: sumWhere(lines, (l) => f(l).subjectToEmployerContribution),
    vacationBasisOre: sumWhere(lines, (l) => f(l).vacationPayBasis),
    pensionBasisOre: sumWhere(lines, (l) => f(l).pensionReportable),
    cashGrossOre: sumWhere(lines, (l) => k(l) !== "benefit" && k(l) !== "net_adjustment"),
    benefitOre: sumWhere(lines, (l) => k(l) === "benefit"),
    netAdjustmentOre: sumWhere(lines, (l) => k(l) === "net_adjustment"),
    sickPayCostOre: sumWhere(lines, (l) => k(l) === "sick_pay"),
  };
}

/** Attach the register's flags, compute bases, tax, contributions and net, and freeze. */
export function assemblePayslip(input: PayslipInput): PayslipDocument {
  const lines: PayslipLine[] = input.lines.map((line) => {
    const item = payItemByCode(input.payItems, line.code);
    return { ...line, item: { code: item.code, name: item.name, kind: item.kind, version: item.version, flags: { ...item.flags } } };
  });
  const bases = payslipBases(lines);
  const tax = preliminaryTax({
    rules: input.rules,
    payDate: input.payDate,
    tax: input.tax,
    tableBaseOre: bases.tableTaxableOre,
    lumpSumBaseOre: bases.lumpSumTaxableOre,
    taxTable: input.taxTable?.rows ?? null,
    expectedAnnualPayOre: input.expectedAnnualPayOre,
    hasRegularSalary: input.hasRegularSalary,
  });
  const contributions = employerContributions({
    rules: input.rules,
    birthYear: input.employee.birthYear,
    payDate: input.payDate,
    baseOre: bases.contributionBaseOre,
    expectedAnnualPayOre: input.expectedAnnualPayOre,
  });
  const netOre = bases.cashGrossOre - tax.totalOre + bases.netAdjustmentOre;
  return {
    schema: 1,
    employeeId: input.employee.id,
    employeeName: input.employee.name,
    birthYear: input.employee.birthYear,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    payDate: input.payDate,
    ruleSetValidFrom: input.rules.validFrom,
    taxTableVersion: tax.usedTable ? (input.taxTable?.version ?? null) : null,
    lines,
    bases,
    tax,
    contributions,
    totals: {
      cashGrossOre: bases.cashGrossOre,
      benefitOre: bases.benefitOre,
      taxOre: tax.totalOre,
      netAdjustmentOre: bases.netAdjustmentOre,
      netOre,
      employerContributionOre: contributions.amountOre,
      sickPayCostOre: bases.sickPayCostOre,
    },
  };
}

export type JournalLine = { account: string; debitOre: Ore; creditOre: Ore; text: string };

/**
 * The payslip's share of the run's journal entry (section 7): each line on
 * its account against Löneskuld, tax to 2710, net to 2820, benefits
 * against 7399, contributions 7510 / 2731. Accounts for tax, net and
 * contributions are the BAS defaults; the run uses the org's mapping.
 */
export function journalLines(
  doc: PayslipDocument,
  accounts = { tax: "2710", net: "2820", contributionCost: "7510", contributionLiability: "2731" },
): JournalLine[] {
  const out: JournalLine[] = [];
  const post = (account: string, amount: Ore, text: string) => {
    if (amount === 0) return;
    out.push(amount > 0 ? { account, debitOre: amount, creditOre: 0, text } : { account, debitOre: 0, creditOre: -amount, text });
  };
  for (const l of doc.lines) {
    post(l.item.flags.account, l.amountOre, l.text);
    if (l.item.kind === "benefit") post(l.item.flags.counterAccount, -l.amountOre, `Motkonto ${l.text}`);
  }
  post(accounts.tax, -doc.totals.taxOre, "Personalskatt");
  post(accounts.net, -doc.totals.netOre, "Nettolön");
  post(accounts.contributionCost, doc.totals.employerContributionOre, "Arbetsgivaravgifter");
  post(accounts.contributionLiability, -doc.totals.employerContributionOre, "Arbetsgivaravgifter");
  return out;
}

export type Reconciliation = {
  /** The sums the run gate compares against the journal, the AGI and the bank file. */
  cashGrossOre: Ore;
  benefitOre: Ore;
  taxOre: Ore;
  netOre: Ore;
  contributionBaseOre: Ore;
  employerContributionOre: Ore;
  sickPayCostOre: Ore;
  journalDebitOre: Ore;
  journalCreditOre: Ore;
  /** True when every internal identity holds. */
  ok: boolean;
  problems: string[];
};

/** Check the document against itself and return the gate's sums. */
export function reconcile(doc: PayslipDocument): Reconciliation {
  const problems: string[] = [];
  const recomputed = payslipBases(doc.lines);
  for (const key of Object.keys(recomputed) as (keyof PayslipBases)[]) {
    if (recomputed[key] !== doc.bases[key]) problems.push(`Underlaget ${key} är ${doc.bases[key]} men raderna ger ${recomputed[key]}.`);
  }
  const lineSum = sumOre(doc.lines.map((l) => l.amountOre));
  if (lineSum !== doc.totals.cashGrossOre + doc.totals.benefitOre + doc.totals.netAdjustmentOre) {
    problems.push(`Raderna summerar till ${lineSum}, inte brutto + förmåner + nettoavdrag.`);
  }
  if (doc.totals.cashGrossOre - doc.totals.taxOre + doc.totals.netAdjustmentOre !== doc.totals.netOre) {
    problems.push("Nettolönen är inte brutto − skatt + nettoavdrag.");
  }
  if (doc.tax.tableOre + doc.tax.lumpSumOre !== doc.totals.taxOre) problems.push("Skatten är inte tabellskatt + engångsskatt.");
  if (doc.totals.taxOre % 100 !== 0) problems.push("Skatteavdraget är inte i hela kronor.");
  if (sumOre(Object.values(doc.contributions.parts)) !== doc.contributions.amountOre) problems.push("Avgiftens delar summerar inte till avgiften.");
  const journal = journalLines(doc);
  const debit = sumOre(journal.map((j) => j.debitOre));
  const credit = sumOre(journal.map((j) => j.creditOre));
  if (debit !== credit) problems.push(`Verifikationen balanserar inte: debet ${debit}, kredit ${credit}.`);
  return {
    cashGrossOre: doc.totals.cashGrossOre,
    benefitOre: doc.totals.benefitOre,
    taxOre: doc.totals.taxOre,
    netOre: doc.totals.netOre,
    contributionBaseOre: doc.contributions.baseOre,
    employerContributionOre: doc.totals.employerContributionOre,
    sickPayCostOre: doc.totals.sickPayCostOre,
    journalDebitOre: debit,
    journalCreditOre: credit,
    ok: problems.length === 0,
    problems,
  };
}
