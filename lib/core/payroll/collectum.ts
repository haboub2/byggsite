/**
 * Collectum's monthly pay report for tjänstemän with ITP1, and the
 * särskild löneskatt on pension premiums (docs/hr-lon.md, sections 4, 7
 * and 8; phase 5). Pure; the database's collectum_basis() (0042) sums the
 * same rows and pension_report_store() refuses a file whose sums differ.
 *
 * Who: the people whose payslip says ITP1 (the scheme frozen on the
 * payslip, PayslipContext.pension). What: the pensionsmedförande lön paid in
 * the month, which is the lines whose pay item is pension-reportable
 * (salary, sjuklön, semesterlön, OB, övertid, bonus; not förmåner,
 * bilersättning, traktamente, utlägg or styrelsearvode), whole kronor with
 * the öre dropped. When: the month it was paid, before Collectum's cutoff
 * in the month after (COLLECTUM_FORMAT).
 *
 * The premium: 4,5 % up to 7,5 inkomstbasbelopp a year and 30 % above
 * (pensionPremium in contributions.ts), checked against the premium the
 * run accrued; särskild löneskatt 24,26 % of the premium, accrued in the
 * run's journal entry (ledger.ts) until the tax return books the real
 * amount.
 */

import { rateOf, sumOre, truncateToKronor, type Ore } from "../money";
import { daysBetween, type IsoDate } from "../rules/index";
import { COLLECTUM_FORMAT } from "../rules/agi-format";
import { benefitRulesAt } from "../rules/benefits";
import { payrollRulesAt } from "../rules/payroll";
import { pensionPremium } from "./contributions";
import { addMonths } from "./employment-clocks";
import { splitName } from "./fora";
import type { PayslipDocument } from "./payslip";

export type CollectumSlip = { payslipId: string; employeeId: string; document: PayslipDocument };

export type CollectumLine = {
  employeeId: string;
  name: string;
  payslipIds: string[];
  /** Pensionsmedförande lön paid in the month, whole kronor. */
  payOre: Ore;
};

/** The month's ITP1 pay per tjänsteman, from approved payslips of closed runs with pay day in `period`. */
export function collectumBasis(period: string, slips: readonly CollectumSlip[]): CollectumLine[] {
  const by = new Map<string, CollectumLine>();
  for (const s of slips) {
    if (s.document.payDate.slice(0, 7) !== period) throw new Error(`Lönebeskedet för ${s.document.employeeName} betalades ${s.document.payDate}, inte i ${period}.`);
    if (s.document.context?.pension.scheme !== "itp1") continue;
    const pay = sumOre(s.document.lines.filter((l) => l.item.flags.pensionReportable).map((l) => l.amountOre));
    const line = by.get(s.employeeId) ?? { employeeId: s.employeeId, name: s.document.employeeName, payslipIds: [], payOre: 0 };
    line.payslipIds.push(s.payslipId);
    line.payOre += pay;
    by.set(s.employeeId, line);
  }
  return [...by.values()].map((l) => ({ ...l, payOre: truncateToKronor(l.payOre) })).sort((a, b) => a.name.localeCompare(b.name, "sv"));
}

/** Särskild löneskatt on a pension premium (lag 1991:687), rounded to the öre. */
export function specialPayrollTax(date: IsoDate, premiumOre: Ore): Ore {
  return rateOf(premiumOre, benefitRulesAt(date).pension.specialPayrollTaxPercent);
}

export type PremiumCheck = { employeeId: string; name: string; payOre: Ore; expectedPremiumOre: Ore; accruedPremiumOre: Ore; specialPayrollTaxOre: Ore; ok: boolean };

/**
 * The ITP1 premium on each person's reported pay against what the runs
 * accrued (RunPayslip.pensionPremiumOre summed over the month's payslips),
 * and the särskild löneskatt on it. A difference means a payslip's
 * premium was computed on other pay than the report's (a correction, or a
 * pay item flagged differently); the invoice from Collectum decides.
 */
export function premiumCheck(period: string, lines: readonly CollectumLine[], accrued: ReadonlyMap<string, Ore>): PremiumCheck[] {
  const date = `${period}-01`;
  const rules = payrollRulesAt(date);
  return lines.map((l) => {
    const expected = pensionPremium(rules, "itp1", l.payOre).totalOre;
    const accruedPremiumOre = accrued.get(l.employeeId) ?? 0;
    return { employeeId: l.employeeId, name: l.name, payOre: l.payOre, expectedPremiumOre: expected, accruedPremiumOre, specialPayrollTaxOre: specialPayrollTax(date, expected), ok: Math.abs(expected - accruedPremiumOre) <= 100 };
  });
}

/** The last day to report a pay month to Collectum for the next invoice: the cutoff in the month after. */
export function collectumDueDate(period: string): IsoDate {
  const next = addMonths(`${period}-01`, 1).slice(0, 7);
  return COLLECTUM_FORMAT.cutoffs[next] ?? `${next}-${String(COLLECTUM_FORMAT.fallbackCutoffDay).padStart(2, "0")}`;
}

/** Days left to the deadline, for Idag (negative when passed). */
export const collectumDaysLeft = (period: string, today: IsoDate) => daysBetween(today, collectumDueDate(period));

const cell = (s: string) => s.replace(/[;\r\n"]/g, " ").trim();

/** The month's report as a semicolon list (COLLECTUM_FORMAT: our layout of what the e-service asks for), pay in kronor in the sixth column. */
export function collectumFile(input: { period: string; customerNo: string; lines: readonly CollectumLine[]; pnr: (employeeId: string) => string }): string {
  if (!COLLECTUM_FORMAT.customerNoPattern.test(input.customerNo)) throw new Error(`Collectums kundnummer saknas eller är fel ("${input.customerNo}"). Fyll i det i Inställningar › Lön.`);
  const rows = input.lines.map((l) => {
    const pnr = input.pnr(l.employeeId).replace(/\D/g, "");
    if (pnr.length !== 12) throw new Error(`${l.name}: personnummer saknas; Collectum tar personnummer eller samordningsnummer.`);
    if (l.payOre < 0 || l.payOre % 100 !== 0) throw new Error(`${l.name}: lönen ${l.payOre / 100} kr kan inte rapporteras.`);
    const { firstName, lastName } = splitName(l.name);
    return [pnr, cell(firstName), cell(lastName), input.customerNo, input.period, String(l.payOre / 100)].join(COLLECTUM_FORMAT.separator);
  });
  return [COLLECTUM_FORMAT.columns.join(COLLECTUM_FORMAT.separator), ...rows, ""].join("\r\n");
}
