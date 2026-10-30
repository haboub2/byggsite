/**
 * The run's journal entry (docs/hr-lon.md, section 7): every payslip's
 * `journalLines` (payslip.ts) on the organisation's accounts, summed per
 * account, plus the accruals the database cannot know: the change in
 * semesterlöneskuld (7090 / 7290 against 2920) with the arbetsgivaravgifter
 * on it (7519 against 2941), and the expected tjänstepension premium
 * (7410 against 2950) until Fora's or Collectum's invoice books the real
 * cost. From phase 5 also the särskild löneskatt on that premium (24,26 %,
 * 7533 against 2514; it is paid with the company's inkomstdeklaration)
 * and the avtalsförsäkringar on the pay (7570 against 2940: Fora's TFA,
 * TGL and TSL for arbetare, Collectum's sjukpension and premiebefrielse,
 * TFA, TGL and TRR for ITP1; rules/benefits.ts `insurance`).
 *
 * payroll_run_book() (0039) builds the payslip part itself from the stored
 * lines; the app sends only `accruals`. `runJournal` gives the whole entry
 * for demo mode and the review page, and the tests hold the two the same.
 */

import { fractionOf, sumOre, type Ore } from "../money";
import { benefitRulesAt } from "../rules/benefits";
import { payrollRulesAt } from "../rules/payroll";
import { specialPayrollTax } from "./collectum";
import { journalLines, type JournalLine, type PayslipDocument } from "./payslip";
import type { PayrollAccounts } from "./settings";

export type LedgerPayslip = {
  document: PayslipDocument;
  group: "collective" | "salaried";
  vacationLiabilityChangeOre: Ore;
  pensionPremiumOre: Ore;
};

/** One line per account, debit or credit by the sign of the sum, zero accounts left out. */
export function sumByAccount(lines: readonly JournalLine[], text: (account: string) => string = () => "Lön"): JournalLine[] {
  const by = new Map<string, Ore>();
  for (const l of lines) by.set(l.account, (by.get(l.account) ?? 0) + l.debitOre - l.creditOre);
  return [...by]
    .filter(([, amount]) => amount !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account, amount]) => (amount > 0 ? { account, debitOre: amount, creditOre: 0, text: text(account) } : { account, debitOre: 0, creditOre: -amount, text: text(account) }));
}

/** The payslips' part: lines, benefits' counter account, tax, net and contributions on the org's accounts. */
export function payslipJournal(docs: readonly PayslipDocument[], accounts: PayrollAccounts): JournalLine[] {
  const mapping = { tax: accounts.tax, net: accounts.net, contributionCost: accounts.contributionCost, contributionLiability: accounts.contributionLiability };
  const texts = new Map<string, string>([
    [accounts.tax, "Personalskatt"],
    [accounts.net, "Nettolön"],
    [accounts.contributionCost, "Arbetsgivaravgifter"],
    [accounts.contributionLiability, "Arbetsgivaravgifter"],
  ]);
  const lines = docs.flatMap((d) => journalLines(d, mapping));
  for (const l of lines) if (!texts.has(l.account)) texts.set(l.account, l.item ?? l.text);
  return sumByAccount(lines, (a) => texts.get(a) ?? "Lön");
}

/**
 * Arbetsgivaravgifter on a semesterlöneskuld (or its change) at the
 * person's effective rate on the payslip: the payslip's avgift over its
 * base, so the young people's cap, which blends two rates, is respected.
 */
export function contributionOnLiability(doc: PayslipDocument, liabilityOre: Ore): Ore {
  const c = doc.contributions;
  return c.baseOre > 0 ? fractionOf(liabilityOre, c.amountOre, c.baseOre) : 0;
}

/**
 * The avtalsförsäkringar on a payslip's pay, expected from the rule book:
 * for SAF-LO the percent of the Fora pay (lines with a Fora category), for
 * ITP1 the percents below and above the 7,5 IBB cap of the
 * pension-reportable pay. The invoices book the real cost.
 */
/** The insurance percents have three decimals (0,665 %); rateOf takes two. */
const rate3 = (amount: Ore, percent: number): Ore => fractionOf(amount, Math.round(percent * 1000), 100_000);

export function insurancePremium(doc: PayslipDocument): Ore {
  const scheme = doc.context?.pension.scheme ?? "none";
  if (scheme === "none") return 0;
  const ins = benefitRulesAt(doc.payDate).insurance;
  if (scheme === "saf-lo") return rate3(Math.max(0, sumOre(doc.lines.filter((l) => l.item.flags.foraCategory !== null).map((l) => l.amountOre))), ins.collective.percent);
  const pay = Math.max(0, doc.bases.pensionBasisOre);
  const r = payrollRulesAt(doc.payDate);
  const cap = fractionOf(r.baseAmounts.inkomstbasbeloppOre, Math.round(r.pension.itp1.capIbbPerYear * 10), 120);
  return rate3(Math.min(pay, cap), ins.salaried.percentBelowCap) + rate3(Math.max(0, pay - cap), ins.salaried.percentAboveCap);
}

/** Semesterlöneskuld change with its avgifter, the pension accrual with its särskild löneskatt, and the insurances, summed per account. */
export function accrualLines(slips: readonly LedgerPayslip[], accounts: PayrollAccounts): JournalLine[] {
  const raw: JournalLine[] = [];
  const post = (debit: string, credit: string, amount: Ore, text: string) => {
    if (!amount) return;
    raw.push(amount > 0 ? { account: debit, debitOre: amount, creditOre: 0, text } : { account: debit, debitOre: 0, creditOre: -amount, text });
    raw.push(amount > 0 ? { account: credit, debitOre: 0, creditOre: amount, text } : { account: credit, debitOre: -amount, creditOre: 0, text });
  };
  for (const s of slips) {
    const cost = s.group === "collective" ? accounts.vacationCostCollective : accounts.vacationCostSalaried;
    post(cost, accounts.vacationLiability, s.vacationLiabilityChangeOre, "Förändring semesterlöneskuld");
    post(accounts.vacationContributionCost, accounts.vacationContributionLiability, contributionOnLiability(s.document, s.vacationLiabilityChangeOre), "Sociala avgifter på semesterlöneskuld");
    post(accounts.pensionCost, accounts.pensionLiability, s.pensionPremiumOre, "Tjänstepension, beräknad premie");
    post(accounts.specialPayrollTaxCost, accounts.specialPayrollTaxLiability, specialPayrollTax(s.document.payDate, s.pensionPremiumOre), "Särskild löneskatt på pensionspremie");
    post(accounts.insuranceCost, accounts.insuranceLiability, insurancePremium(s.document), "Avtalsförsäkringar, beräknad premie");
  }
  const texts = new Map(raw.map((l) => [l.account, l.text]));
  return sumByAccount(raw, (a) => texts.get(a) ?? "Periodisering");
}

/** The whole entry: the payslips' part and the accruals. Balanced by construction; `balanced` checks it. */
export function runJournal(slips: readonly LedgerPayslip[], accounts: PayrollAccounts): { lines: JournalLine[]; accruals: JournalLine[]; debitOre: Ore; creditOre: Ore } {
  const main = payslipJournal(
    slips.map((s) => s.document),
    accounts
  );
  const accruals = accrualLines(slips, accounts);
  const all = [...main, ...accruals];
  return { lines: main, accruals, debitOre: sumOre(all.map((l) => l.debitOre)), creditOre: sumOre(all.map((l) => l.creditOre)) };
}

/** The four net-pay sums the close gate compares (payroll_reconciliation in 0039). */
export function reconciliationSums(input: { docs: readonly PayslipDocument[]; journal: readonly JournalLine[] | null; bankTotalOre: Ore | null; netAccount: string }): {
  payslipsOre: Ore;
  linesOre: Ore;
  journalOre: Ore | null;
  bankOre: Ore | null;
  ok: boolean;
} {
  const payslipsOre = sumOre(input.docs.map((d) => d.totals.netOre));
  const linesOre = sumOre(input.docs.flatMap((d) => d.lines.filter((l) => l.item.kind !== "benefit").map((l) => l.amountOre))) - sumOre(input.docs.map((d) => d.totals.taxOre));
  const journalOre = input.journal ? sumOre(input.journal.filter((l) => l.account === input.netAccount).map((l) => l.creditOre - l.debitOre)) : null;
  const bankOre = input.bankTotalOre;
  return { payslipsOre, linesOre, journalOre, bankOre, ok: linesOre === payslipsOre && journalOre === payslipsOre && bankOre === payslipsOre };
}
