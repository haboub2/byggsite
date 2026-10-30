/**
 * Payroll calculators (docs/hr-lon.md, sections 4–5). Pure functions over
 * the rule book (`payrollRulesAt`) and imported tax tables; no I/O. The
 * order in a run, per employee: time-to-pay → sick-pay / vacation → tax →
 * contributions → payslip (bases, net, frozen document, reconcile).
 */

export { payrollRulesAt, agiDueDate, unverifiedRules, ruleSources, type PayrollRuleSet, type AgiDue } from "../rules/payroll";
export { hourlyPay, monthlyPay, monthlyOvertime, atfAccrual, dayKind, type WorkBlock, type UnpaidAbsence, type HourlyPayResult, type MonthlyPayResult } from "./time-to-pay";
export {
  sickPay,
  scheduledHours,
  weeklyHours,
  averageWeeklyHoursFromHistory,
  monthlyToHourlyOre,
  type SickSpell,
  type WorkSchedule,
  type SickPeriod,
  type SickPayResult,
} from "./sick-pay";
export {
  vacationYear,
  vacationYears,
  lawVacationYearModel,
  qualifyingAbsence,
  paidDaysEarned,
  percentRuleVacationPay,
  sameSalaryVacationPay,
  monthlyVacationDayValue,
  monthlyVacationCompensation,
  terminationCompensation,
  savableDays,
  validSavedDays,
  vacationLiability,
  type SavedDays,
  type VacationYearModel,
} from "./vacation";
export { preliminaryTax, type EmployeeTax, type TaxResult, type TaxMethod } from "./tax";
export { employerContributions, contributionCategory, agiContributions, agiContributionTotal, pensionPremium, type ContributionResult, type AgiContributionRow } from "./contributions";
export { employmentClocks, addMonths, type EmploymentPeriod, type EmploymentForm, type Clocks, type Clock } from "./employment-clocks";
export {
  assemblePayslip,
  reconcile,
  journalLines,
  payItemByCode,
  payslipBases,
  type PayItem,
  type PayItemFlags,
  type PayItemKind,
  type TaxMode,
  type PayLineInput,
  type PayslipLine,
  type PayslipDocument,
  type PayslipInput,
  type Reconciliation,
  type JournalLine,
} from "./payslip";
export { DEFAULT_PAY_ITEMS, AGI_BOXES } from "./pay-items.default";
export {
  parseTaxTableCsv,
  indexTaxTable,
  tableTax,
  lumpSumPercent,
  lumpSumTax,
  verifyTaxTables,
  checkGoldenVectors,
  type TaxTableRow,
  type TaxTableFile,
  type GoldenFile,
} from "./tax-tables";
