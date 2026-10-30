/**
 * One payroll run (docs/hr-lon.md, section 5, rule 4 of section 9). Pure:
 * the store reads the rows, this follows section 5 per person with the
 * phase 0 calculators and the phase 2 readers, and the database stores
 * what comes out (payroll_run_store_result, 0039).
 *
 * Per person:
 *
 *   1. Time to pay: approved `time_entries` of the time period through
 *      `toWorkBlocks` → `hourlyPay` (timlön, OB, övertid), or månadslön
 *      through `monthlyPay` (deductions for unpaid absence and days not
 *      employed) and `monthlyOvertime`.
 *   2. Absence: sick spells → `sickPay` (sjuklön, karensavdrag, sjukavdrag)
 *      for the days of the time period, counted with the history so day
 *      numbers, återinsjuknande and ten-in-twelve hold across months;
 *      semester taken → semestertillägg (sammalöneregeln) or semesterlön
 *      (procentregeln); semesterersättning per month for SÄVA; VAB,
 *      föräldraledighet and tjänstledighet as deductions on månadslön.
 *   3. Fixed items: arvode (`uppdrag`) when its period ends in the month,
 *      corrections from earlier runs as retro lines.
 *   4–7. `assemblePayslip`: bases, tax (`preliminaryTax` with the imported
 *      table and the person's `employee_tax`), arbetsgivaravgifter by birth
 *      year (`employerContributions`, the young people's cap, the 1 000 kr
 *      rule), net; `reconcile` must hold.
 *   9. Semesterlöneskuld after the run, and the expected tjänstepension
 *      premium, for the bookkeeping (ledger.ts).
 *
 * The pre-run checklist (rule 4) comes out with the payslips; a "block"
 * item stops the run in the database as well.
 */

import { lineAmount, rateOf, sumOre, type Ore } from "../money";
import { addDays, daysBetween, type IsoDate } from "../rules/index";
import { unverifiedRules, type AgreementRules, type PayrollRuleSet } from "../rules/payroll";
import { isWorkday } from "../../workdays";
import { absenceWorkdays, sickHours, type Absence } from "../hr/absence";
import { vacationBalances } from "../hr/balances";
import { clockAlerts, heldForms, type ClockRow } from "../hr/clocks";
import { inForce, taxOn, type Employee, type EmploymentVersion, type TaxVersion } from "../hr/schema";
import { atlWarnings, currentEntries, netHours, toWorkBlocks, type TimeEntry } from "../hr/time";
import { pensionPremium } from "./contributions";
import { addMonths } from "./employment-clocks";
import { assemblePayslip, payItemByCode, reconcile, type PayItem, type PayLineInput, type PayslipDocument } from "./payslip";
import { averageWeeklyHoursFromHistory, monthlyToHourlyOre, scheduledHours, sickPay, weeklyHours, type SickPayResult, type WorkSchedule } from "./sick-pay";
import type { EmployeeTax } from "./tax";
import type { TaxTableIndex } from "./tax-tables";
import { hourlyPay, monthlyOvertime, monthlyPay, type UnpaidAbsence, type WorkBlock } from "./time-to-pay";
import { monthlyVacationCompensation, monthlyVacationDayValue, paidDaysEarned, percentRuleVacationPay, sameSalaryVacationPay, vacationYears } from "./vacation";
import { unconfirmedDecisions, vacationModelFor, DECISION_LABEL, type PayrollConfirmed, type PayrollSettings } from "./settings";

export type CheckLevel = "block" | "warn" | "info";
export type RunCheck = { code: string; level: CheckLevel; text: string; employeeId?: string };

export type RunPerson = {
  employee: Pick<Employee, "id" | "name" | "birthDate" | "agreement" | "bankClearing" | "bankAccountMasked" | "pnrMasked" | "endedAt">;
  versions: readonly EmploymentVersion[];
  tax: readonly TaxVersion[];
  /** Time rows from three months before the time period to its end, any status (the history gives a behovsanställd's average week). */
  timeEntries: readonly TimeEntry[];
  /** Absences from twelve months before the time period to its end. */
  absences: readonly Absence[];
  /** The weekly schedule of the version that applies (schedule_rules), or null. */
  schedule: Extract<WorkSchedule, { kind: "weekly" }> | null;
  /** Booked shifts' hours per day, for timlön without a weekly schedule. */
  shiftHours?: Readonly<Record<IsoDate, number>>;
  /** From the person's approved payslips earlier in the calendar year and the earning year. */
  history: {
    yearToDateCashGrossOre: Ore;
    yearToDateTaxOre: Ore;
    /** Semesterlöneskuld after the person's last approved run. */
    vacationLiabilityOre: Ore;
    /** Semesterlönegrundande pay (incl. imputed sick pay) in the intjänandeår that pays for this year's semester. */
    vacationBasisPaidByYearOre: Ore;
    /** Variable pay (OB, övertid) in that intjänandeår, for sammalöneregeln's variable part. */
    variablePayPaidByYearOre: Ore;
  };
  /** Pending corrections from earlier runs (payroll_corrections). */
  corrections: readonly { id: string; lines: readonly PayLineInput[]; reason: string }[];
  clock?: ClockRow | null;
};

export type RunInput = {
  periodStart: IsoDate;
  periodEnd: IsoDate;
  /** The period time and absence are read from (the same month, or the one before). */
  timeFrom: IsoDate;
  timeTo: IsoDate;
  payDate: IsoDate;
  rules: PayrollRuleSet;
  /** The register as it applies on the pay date (payItemsOn). */
  payItems: readonly PayItem[];
  /** The year's imported tables, null when none is imported. */
  taxTable: { importId: string | null; version: string; index: TaxTableIndex } | null;
  settings: PayrollSettings;
  confirmed: PayrollConfirmed;
  people: readonly RunPerson[];
  /** The bookkeeping period of the pay date is locked. */
  ledgerLocked: boolean;
  /** The time period is already locked (approved time stays readable). */
  timeLocked: boolean;
  today: IsoDate;
};

export type RunPayslip = {
  employeeId: string;
  document: PayslipDocument;
  /** BAS group for the semesterlöneskuld's cost account. */
  group: "collective" | "salaried";
  vacationLiabilityOre: Ore;
  vacationLiabilityChangeOre: Ore;
  pensionScheme: "saf-lo" | "itp1" | "none";
  pensionPremiumOre: Ore;
  correctionIds: string[];
};

export type RunResult = {
  checks: RunCheck[];
  payslips: RunPayslip[];
  ruleSetValidFrom: IsoDate;
  taxTableImportId: string | null;
};

/* ---------- the register ---------- */

/** Each code's version that applies on `date`: the latest with valid_from on or before it. */
export function payItemsOn(rows: readonly (PayItem & { validFrom: IsoDate })[], date: IsoDate): PayItem[] {
  const best = new Map<string, PayItem & { validFrom: IsoDate }>();
  for (const r of rows) {
    if (r.validFrom > date) continue;
    const b = best.get(r.code);
    if (!b || r.version > b.version) best.set(r.code, r);
  }
  return [...best.values()].map((r) => ({ code: r.code, name: r.name, kind: r.kind, version: r.version, flags: r.flags })).sort((a, b) => a.code.localeCompare(b.code));
}

/* ---------- history ---------- */

/**
 * Semesterlönegrundande pay and variable pay (OB, övertid) earned in an
 * intjänandeår [from, to), from earlier payslips. Each line is dated by
 * when it was earned, not by the payslip: månadslön in the salary month
 * (periodStart), everything else in the period time and absence were read
 * from (context.timeFrom, the month before under the common model), so
 * March's OB paid in April belongs to the year that ends 31 March.
 */
export function earningYearHistory(docs: readonly PayslipDocument[], from: IsoDate, to: IsoDate): { vacationBasisOre: Ore; variablePayOre: Ore } {
  let vacationBasisOre = 0;
  let variablePayOre = 0;
  for (const d of docs) {
    for (const l of d.lines) {
      const earnedOn = l.item.kind === "salary" ? d.periodStart : (d.context?.timeFrom ?? d.periodStart);
      if (earnedOn < from || earnedOn >= to) continue;
      if (l.item.flags.vacationPayBasis) vacationBasisOre += l.amountOre;
      if (l.item.kind === "ob" || l.item.kind === "overtime") variablePayOre += l.amountOre;
    }
  }
  return { vacationBasisOre, variablePayOre };
}

/* ---------- codes and agreements ---------- */

type Group = "collective" | "salaried";
const CODES = {
  collective: { salary: "1011", deduction: "1151", hourly: "1100", ob: "1200", overtime: "1300", sickPay: "1400", waiting: "1410", sickDeduction: "1420", vacationPay: "1500", supplement: "1500", compensation: "1520" },
  salaried: { salary: "1010", deduction: "1150", hourly: "1101", ob: "1201", overtime: "1301", sickPay: "1401", waiting: "1411", sickDeduction: "1421", vacationPay: "1501", supplement: "1510", compensation: "1520" },
} as const;

function groupOf(agreement: Employee["agreement"], payForm: EmploymentVersion["payForm"]): Group {
  if (agreement === "byggavtalet") return "collective";
  if (agreement === "tjanstemannaavtalet") return "salaried";
  return payForm === "hourly" ? "collective" : "salaried";
}

/**
 * The agreement's rules for a person. Without an agreement: the law's
 * semester (12 %, 0,43 % per day) and no OB; månadslön deductions and
 * övertid as Tjänstemannaavtalet (the law has none), with a warning.
 * Byggavtalet has no månadslön deduction rule in the rule book either.
 */
function agreementFor(rules: PayrollRuleSet, agreement: Employee["agreement"]): { rules: AgreementRules; borrowed: string | null } {
  const tjm = rules.agreements.tjanstemannaavtalet;
  if (agreement === "tjanstemannaavtalet") return { rules: tjm, borrowed: null };
  if (agreement === "byggavtalet") {
    const bygg = rules.agreements.byggavtalet;
    return { rules: bygg.absenceDeduction ? bygg : { ...bygg, absenceDeduction: tjm.absenceDeduction }, borrowed: bygg.absenceDeduction ? null : "löneavdrag för månadslön enligt Tjänstemannaavtalet" };
  }
  return {
    rules: {
      ...tjm,
      name: "Inget kollektivavtal (semesterlagen)",
      vacationPercent: rules.vacation.percentRule,
      vacationDailySupplementPercent: rules.vacation.sameSalaryDailyPercent,
      vacationVariablePay: { mode: "total", percent: rules.vacation.sameSalaryVariablePercent },
      ob: [],
    },
    borrowed: "löneavdrag och övertid enligt Tjänstemannaavtalet",
  };
}

/* ---------- small helpers ---------- */

const minDate = (a: IsoDate, b: IsoDate) => (a < b ? a : b);
const maxDate = (a: IsoDate, b: IsoDate) => (a > b ? a : b);
const overlaps = (from: IsoDate, to: IsoDate | null, rangeFrom: IsoDate, rangeTo: IsoDate) => from <= rangeTo && (to === null || to >= rangeFrom);
const kr = (ore: Ore) => `${Math.round(ore / 100).toLocaleString("sv-SE")} kr`;

/** The version of a pay form that applies in [from, to]: the latest valid one of a contract in force some day then. */
function versionIn(versions: readonly EmploymentVersion[], payForms: readonly EmploymentVersion["payForm"][], from: IsoDate, to: IsoDate): { version: EmploymentVersion | null; count: number } {
  const hits = versions.filter(
    (v) => payForms.includes(v.payForm) && overlaps(v.startsOn, v.endsOn, from, to) && overlaps(v.validFrom, v.validTo, from, to) && overlaps(maxDate(v.startsOn, v.validFrom), v.validTo === null ? v.endsOn : v.endsOn === null ? v.validTo : minDate(v.endsOn, v.validTo), from, to)
  );
  hits.sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.startsOn.localeCompare(a.startsOn) || b.version - a.version);
  return { version: hits[0] ?? null, count: new Set(hits.map((h) => h.id)).size };
}

/** Days of [from, to] the person is not employed under any of the versions' contracts. */
function daysNotEmployed(versions: readonly EmploymentVersion[], from: IsoDate, to: IsoDate): { from: IsoDate; to: IsoDate }[] {
  const out: { from: IsoDate; to: IsoDate }[] = [];
  let open: IsoDate | null = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const employed = versions.some((v) => inForce(v, d));
    if (!employed && open === null) open = d;
    if (employed && open !== null) {
      out.push({ from: open, to: addDays(d, -1) });
      open = null;
    }
  }
  if (open !== null) out.push({ from: open, to });
  return out;
}

const ABSENCE_TEXT: Partial<Record<Absence["kind"], string>> = { tjanstledig: "Tjänstledig", foraldraledig: "Föräldraledig", vab: "VAB" };

/** Unpaid absence on månadslön in the period: whole days as spells, part days as hours on each scheduled day. */
function unpaidAbsences(absences: readonly Absence[], from: IsoDate, to: IsoDate, schedule: WorkSchedule | null): UnpaidAbsence[] {
  const out: UnpaidAbsence[] = [];
  for (const a of absences) {
    const text = ABSENCE_TEXT[a.kind];
    if (!text || !a.approvedAt || !overlaps(a.from, a.to, from, to)) continue;
    const start = maxDate(a.from, from);
    const end = minDate(a.to ?? to, to);
    if (a.extent === 1) {
      out.push({ from: start, to: end, text });
      continue;
    }
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const h = schedule ? scheduledHours(schedule, d) : isWorkday(d) ? 8 : 0;
      if (h > 0) out.push({ from: d, to: d, hours: Math.round(h * a.extent * 100) / 100, text });
    }
  }
  return out;
}

/**
 * Sick lines for the days of [from, to]: sickPay over the history up to
 * `to`, less sickPay over the history up to the day before `from`, per
 * code. Day numbers, återinsjuknande, the karensavdrag left over from last
 * month and ten-in-twelve all come from the history; only this month's
 * part is paid.
 */
function sickLinesFor(input: {
  rules: PayrollRuleSet;
  absences: readonly Absence[];
  schedule: WorkSchedule;
  hourlyPayOre: Ore;
  averageWeeklyHours: number;
  monthlySalary: boolean;
  from: IsoDate;
  to: IsoDate;
  codes: { sickPay: string; waitingDeduction: string; sickDeduction: string };
}): { lines: PayLineInput[]; sickPayHours: number; costOre: Ore } {
  const spells = input.absences.filter((a) => a.kind === "sjuk" && a.from <= input.to);
  if (!spells.length) return { lines: [], sickPayHours: 0, costOre: 0 };
  const run = (until: IsoDate): SickPayResult => {
    const clipped = spells.filter((s) => s.from <= until).map((s) => ({ ...s, to: minDate(s.to ?? until, until) }));
    return sickPay({
      rules: input.rules,
      spells: clipped.map((s) => ({ from: s.from, to: s.to })),
      schedule: sickHours(input.schedule, clipped, until),
      hourlyPayOre: input.hourlyPayOre,
      averageWeeklyHours: input.averageWeeklyHours,
      monthlySalary: input.monthlySalary,
      previousWaitingDeductions: [],
      codes: input.codes,
    });
  };
  const now = run(input.to);
  const before = run(addDays(input.from, -1));
  const sum = (r: SickPayResult, code: string) => ({
    amount: sumOre(r.lines.filter((l) => l.code === code).map((l) => l.amountOre)),
    quantity: r.lines.filter((l) => l.code === code).reduce((s, l) => s + (l.quantity ?? 0), 0),
  });
  const lines: PayLineInput[] = [];
  for (const code of [input.codes.sickDeduction, input.codes.sickPay, input.codes.waitingDeduction]) {
    const a = sum(now, code);
    const b = sum(before, code);
    const amount = a.amount - b.amount;
    if (!amount) continue;
    const ofCode = now.lines.filter((l) => l.code === code);
    const first = ofCode[0];
    const days = ofCode.flatMap((l) => [l.from, l.to]).filter((d): d is IsoDate => !!d && d >= input.from);
    const quantity = first.quantity === null ? null : Math.round((a.quantity - b.quantity) * 100) / 100;
    const from = days.length ? days.reduce(minDate) : input.from;
    const to = days.length ? days.reduce(maxDate) : input.to;
    const text = first.text.replace(/\d{4}-\d{2}-\d{2}–\d{4}-\d{2}-\d{2}$/, `${from}–${to}`);
    lines.push({ ...first, text, quantity, amountOre: amount, from, to });
  }
  const sickHoursNow = now.periods.reduce((s, p) => s + p.sickPayHours, 0);
  const sickHoursBefore = before.periods.reduce((s, p) => s + p.sickPayHours, 0);
  return { lines, sickPayHours: Math.round((sickHoursNow - sickHoursBefore) * 100) / 100, costOre: now.sickPayCostOre - before.sickPayCostOre };
}

function employeeTax(row: TaxVersion): EmployeeTax {
  const validTo = row.adjustmentValidTo ?? "9999-12-31";
  return {
    kind: row.kind,
    tableNo: row.tableNo,
    columnNo: row.columnNo,
    adjustment:
      row.adjustmentPercent !== null ? { mode: "percent", percent: row.adjustmentPercent, validTo } : row.adjustmentMonthlyChangeOre !== null ? { mode: "amount", monthlyIncomeChangeOre: row.adjustmentMonthlyChangeOre, validTo } : null,
    mainEmployer: row.mainEmployer,
    source: row.source,
  };
}

/** Fee periods: a quarter's fee is paid in the run whose month ends the quarter, a year's in December. */
function feeDue(feePeriod: EmploymentVersion["feePeriod"], periodStart: IsoDate): { due: boolean; from: IsoDate; left: number } {
  const month = Number(periodStart.slice(5, 7));
  const year = periodStart.slice(0, 4);
  if (feePeriod === "quarter") {
    const q = Math.ceil(month / 3);
    return { due: month % 3 === 0, from: `${year}-${String(q * 3 - 2).padStart(2, "0")}-01`, left: 4 - q + 1 };
  }
  if (feePeriod === "year") return { due: month === 12, from: `${year}-01-01`, left: 1 };
  return { due: true, from: periodStart, left: 12 - month + 1 };
}

/* ---------- the run ---------- */

type PersonOutcome = { payslip: RunPayslip | null; checks: RunCheck[] };

function computePerson(input: RunInput, p: RunPerson): PersonOutcome {
  const { rules, payDate, periodStart, periodEnd, timeFrom, timeTo } = input;
  const e = p.employee;
  const checks: RunCheck[] = [];
  const check = (code: string, level: CheckLevel, text: string) => checks.push({ code, level, text: `${e.name}: ${text}`, employeeId: e.id });

  const monthly = versionIn(p.versions, ["monthly"], periodStart, periodEnd);
  const hourly = versionIn(p.versions, ["hourly"], timeFrom, timeTo);
  const fee = versionIn(p.versions, ["fee"], periodStart, periodEnd);
  const feeTiming = fee.version ? feeDue(fee.version.feePeriod, periodStart) : null;
  const paysFee = !!fee.version && !!feeTiming?.due;
  const pending = p.corrections;
  if (!monthly.version && !hourly.version && !paysFee && !pending.length) return { payslip: null, checks: [] };
  if (monthly.count > 1 || hourly.count > 1) check("version-change", "warn", "lönen ändras under perioden; den senaste versionen räknas för hela perioden.");

  // Checks that stop the person's payslip.
  if (!e.birthDate) {
    check("birth-date", "block", "födelsedatum saknas (arbetsgivaravgiftens åldersgrupp).");
    return { payslip: null, checks };
  }
  const taxRow = taxOn(p.tax, payDate);
  if (!taxRow) {
    check("tax-missing", "block", "skatteuppgift saknas; lägg in A-skattsedeln under Skatt.");
    return { payslip: null, checks };
  }
  const tax = employeeTax(taxRow);
  if (tax.adjustment) {
    if (tax.adjustment.validTo < payDate) check("jamkning-expired", "warn", `jämkningen gällde till ${tax.adjustment.validTo}; tabellen används nu.`);
    else if (daysBetween(payDate, tax.adjustment.validTo) <= 60) check("jamkning-expiring", "warn", `jämkningen gäller till ${tax.adjustment.validTo}.`);
  }
  if (!e.bankAccountMasked || !e.bankClearing) check("bank-missing", "block", "bankkonto saknas för lönefilen.");

  const birthYear = Number(e.birthDate.slice(0, 4));
  const age = Number(payDate.slice(0, 4)) - birthYear;
  if (age === 66 || age === 67) check("age", "warn", `fyller ${age} i år: kontrollera skattekolumnen och tjänstepensionen.`);

  const payForm = monthly.version ? "monthly" : hourly.version ? "hourly" : "fee";
  const group = groupOf(e.agreement, payForm);
  const codes = CODES[group];
  const { rules: agreement, borrowed } = agreementFor(rules, e.agreement);
  const lines: PayLineInput[] = [];
  const timeRows = p.timeEntries.filter((t) => t.workDate >= timeFrom && t.workDate <= timeTo);
  const approved = currentEntries(timeRows);
  const work = toWorkBlocks(timeRows);
  const absences = p.absences.filter((a) => a.approvedAt);
  if (p.absences.some((a) => !a.approvedAt && overlaps(a.from, a.to, timeFrom, timeTo))) check("absence-unapproved", "warn", "frånvaro i perioden är inte godkänd och räknas inte.");
  for (const w of atlWarnings(timeRows.filter((t) => t.status !== "draft"), { from: timeFrom, to: timeTo })) check("atl", "warn", w.message);
  if (work.other.some((o) => o.kind === "on_call")) check("on-call", "warn", "beredskap betalas inte av körningen; lägg den som en rad i en rättelse.");
  if (work.untimed.some((u) => u.overtime)) check("untimed-overtime", "warn", "övertid utan klockslag kan inte delas på band och räknas inte.");

  let sickImputedOre = 0;
  let vacationDaysTaken = 0;
  let vacationRule = "none" as EmploymentVersion["vacationRule"];
  let vacationPercent = agreement.vacationPercent;
  let monthlySalaryOre = 0;
  let pensionScheme: RunPayslip["pensionScheme"] = "none";
  const semester = absences.filter((a) => a.kind === "semester");

  // 1–2. Månadslön.
  if (monthly.version) {
    const v = monthly.version;
    monthlySalaryOre = v.monthlySalaryOre ?? 0;
    vacationRule = v.vacationRule;
    pensionScheme = v.pensionScheme;
    const schedule = p.schedule;
    const weeklyUsed = v.weeklyHours ?? (schedule ? weeklyHours(schedule) : (40 * v.workingTimePercent) / 100);
    const notEmployed = daysNotEmployed(
      p.versions.filter((x) => x.payForm === "monthly"),
      periodStart,
      periodEnd
    ).map((r) => ({ ...r, text: "Ej anställd" }));
    const unpaid = [...notEmployed, ...unpaidAbsences(absences, timeFrom, timeTo, schedule)];
    if (unpaid.length && borrowed) check("agreement-borrowed", "warn", `${agreement.name}: ${borrowed}.`);
    const pay = monthlyPay({
      agreement,
      monthlySalaryOre,
      absences: unpaid,
      schedule: schedule ?? undefined,
      codes: { salary: v.form === "vd" ? "1020" : codes.salary, deduction: codes.deduction },
      text: v.form === "vd" ? "Lön VD" : "Månadslön",
    });
    lines.push(...pay.lines);

    const overtimeBlocks: WorkBlock[] = work.blocks.filter((b) => b.overtime);
    if (overtimeBlocks.length) {
      if (agreement.overtime.every((b) => b.monthlyDivisor !== null)) lines.push(...monthlyOvertime({ agreement, monthlySalaryOre, blocks: overtimeBlocks, code: codes.overtime }));
      else {
        const hourlyRate = monthlyToHourlyOre(monthlySalaryOre, weeklyUsed);
        lines.push(...hourlyPay({ agreement, hourlyRateOre: hourlyRate, blocks: overtimeBlocks, codes: { base: codes.hourly, ob: codes.ob, overtime: codes.overtime } }).lines.filter((l) => l.code === codes.overtime));
      }
    }

    const sickSchedule: WorkSchedule = schedule ?? { kind: "weekly", hours: [weeklyUsed / 5, weeklyUsed / 5, weeklyUsed / 5, weeklyUsed / 5, weeklyUsed / 5, 0, 0], holidaysOff: true };
    const hourlyLost = monthlyToHourlyOre(monthlySalaryOre, weeklyUsed);
    const sick = sickLinesFor({ rules, absences, schedule: sickSchedule, hourlyPayOre: hourlyLost, averageWeeklyHours: weeklyUsed, monthlySalary: true, from: timeFrom, to: timeTo, codes: { sickPay: codes.sickPay, waitingDeduction: codes.waiting, sickDeduction: codes.sickDeduction } });
    lines.push(...sick.lines);

    vacationDaysTaken = semester.reduce((s, a) => s + absenceWorkdays(a, { from: timeFrom, to: timeTo }, schedule, timeTo), 0);
    if (vacationDaysTaken > 0 && v.vacationRule === "sammalon") {
      const vac = sameSalaryVacationPay({
        monthlySalaryOre,
        daysTaken: vacationDaysTaken,
        dailySupplementPercent: agreement.vacationDailySupplementPercent,
        variablePayOre: p.history.variablePayPaidByYearOre,
        variable: agreement.vacationVariablePay,
      });
      const range = semesterRange(semester, timeFrom, timeTo);
      if (vac.supplementOre) {
        lines.push({ code: codes.supplement, text: `Semestertillägg ${range.label}`, quantity: vacationDaysTaken, unit: "dag", unitPriceOre: rateOf(monthlySalaryOre, agreement.vacationDailySupplementPercent), basisOre: monthlySalaryOre, ratePercent: agreement.vacationDailySupplementPercent, amountOre: vac.supplementOre, from: range.from, to: range.to });
      }
      if (vac.variableOre) {
        lines.push({ code: codes.vacationPay, text: `Semesterlön på rörlig lön ${range.label}`, quantity: null, unit: null, unitPriceOre: null, basisOre: p.history.variablePayPaidByYearOre, ratePercent: agreement.vacationVariablePay.percent, amountOre: vac.variableOre, from: range.from, to: range.to });
      }
    }
  }

  // 1–2. Timlön.
  if (hourly.version) {
    const v = hourly.version;
    const rate = v.hourlyRateOre ?? 0;
    if (!monthly.version) {
      vacationRule = v.vacationRule;
      pensionScheme = v.pensionScheme;
      vacationPercent = v.vacationPercent ?? agreement.vacationPercent;
    }
    const pay = hourlyPay({ agreement, hourlyRateOre: rate, blocks: work.blocks, codes: { base: codes.hourly, ob: codes.ob, overtime: codes.overtime } });
    lines.push(...pay.lines);
    const untimed = work.untimed.filter((u) => !u.overtime).reduce((s, u) => s + u.hours, 0);
    if (untimed) lines.push({ code: codes.hourly, text: "Timlön, timmar utan klockslag", quantity: untimed, unit: "h", unitPriceOre: rate, basisOre: null, ratePercent: null, amountOre: lineAmount(rate, untimed) });
    const travel = work.other.filter((o) => o.kind === "travel").reduce((s, o) => s + o.hours, 0);
    if (travel) lines.push({ code: codes.hourly, text: "Restid", quantity: travel, unit: "h", unitPriceOre: rate, basisOre: null, ratePercent: null, amountOre: lineAmount(rate, travel) });

    // Lost hours: the weekly schedule, or the shifts that were booked.
    const schedule: WorkSchedule = p.schedule ?? { kind: "shifts", hours: p.shiftHours ?? {} };
    let averageWeekly = p.schedule ? weeklyHours(p.schedule) : 0;
    if (!p.schedule) {
      const histFrom = addMonths(timeFrom, -3);
      const hist = p.timeEntries.filter((t) => t.workDate >= histFrom && t.workDate < timeFrom);
      averageWeekly = averageWeeklyHoursFromHistory(Math.max(0, netHours(hist)), histFrom, addDays(timeFrom, -1));
    }
    const sick = sickLinesFor({ rules, absences, schedule, hourlyPayOre: rate, averageWeeklyHours: averageWeekly, monthlySalary: false, from: timeFrom, to: timeTo, codes: { sickPay: codes.sickPay, waitingDeduction: codes.waiting, sickDeduction: codes.sickDeduction } });
    lines.push(...sick.lines);
    sickImputedOre = lineAmount(rate, sick.sickPayHours);

    if (!monthly.version) {
      vacationDaysTaken = semester.reduce((s, a) => s + absenceWorkdays(a, { from: timeFrom, to: timeTo }, p.schedule, timeTo), 0);
      if (vacationDaysTaken > 0 && v.vacationRule === "procent" && v.form !== "sava") {
        const perDay = percentRuleVacationPay(p.history.vacationBasisPaidByYearOre, 0, vacationPercent, v.vacationDays).perDayOre;
        if (!perDay) check("vacation-basis", "warn", "ingen semesterlönegrundande lön i intjänandeåret; semesterlönen blir 0.");
        const range = semesterRange(semester, timeFrom, timeTo);
        if (perDay) {
          lines.push({ code: codes.vacationPay, text: `Semesterlön ${range.label}`, quantity: vacationDaysTaken, unit: "dag", unitPriceOre: perDay, basisOre: p.history.vacationBasisPaidByYearOre, ratePercent: vacationPercent, amountOre: lineAmount(perDay, vacationDaysTaken), from: range.from, to: range.to });
        }
      }
    }
  }
  if (approved.length && !monthly.version && !hourly.version) check("time-without-pay", "warn", "har godkänd tid men ingen anställning med timlön i perioden.");

  // 3. Arvode and corrections.
  if (fee.version && feeTiming?.due) {
    const amount = fee.version.feeOre ?? 0;
    const text = fee.version.feePeriod === "quarter" ? `Styrelsearvode kv ${Math.ceil(Number(periodStart.slice(5, 7)) / 3)} ${periodStart.slice(0, 4)}` : fee.version.feePeriod === "year" ? `Styrelsearvode ${periodStart.slice(0, 4)}` : `Styrelsearvode ${periodStart.slice(0, 7)}`;
    lines.push({ code: "1600", text, quantity: 1, unit: "st", unitPriceOre: amount, basisOre: null, ratePercent: null, amountOre: amount, from: feeTiming.from, to: periodEnd });
  }
  for (const c of pending) lines.push(...c.lines.map((l) => ({ ...l, text: l.text || `Rättelse: ${c.reason}` })));

  // Semesterersättning per month for SÄVA on timlön (procentregeln, paid out as earned).
  const items = input.payItems;
  const flagsOf = (code: string) => payItemByCode(items, code).flags;
  const vacationBasis = sumOre(lines.filter((l) => flagsOf(l.code).vacationPayBasis).map((l) => l.amountOre));
  if (hourly.version && !monthly.version && hourly.version.form === "sava" && hourly.version.vacationRule === "procent") {
    const amount = monthlyVacationCompensation(vacationBasis + sickImputedOre, vacationPercent);
    if (amount) lines.push({ code: codes.compensation, text: `Semesterersättning ${vacationPercent} %`, quantity: null, unit: null, unitPriceOre: null, basisOre: vacationBasis + sickImputedOre, ratePercent: vacationPercent, amountOre: amount });
  }

  if (!lines.length) return { payslip: null, checks };

  // 4–7. The payslip.
  const taxableNow = sumOre(lines.filter((l) => flagsOf(l.code).taxable).map((l) => l.amountOre));
  const monthsLeft = 12 - Number(payDate.slice(5, 7));
  const projected = monthly.version ? monthlySalaryOre * monthsLeft : hourly.version ? Math.max(0, taxableNow) * monthsLeft : fee.version && feeTiming ? (fee.version.feeOre ?? 0) * (feeTiming.left - 1) : 0;
  const expectedAnnualPayOre = p.history.yearToDateCashGrossOre + taxableNow + projected;
  const usesTable = tax.kind === "table" && tax.mainEmployer && !(tax.adjustment?.mode === "percent" && tax.adjustment.validTo >= payDate);
  if (usesTable && !input.taxTable) {
    check("tax-tables", "block", `skattetabellerna för ${payDate.slice(0, 4)} är inte importerade.`);
    return { payslip: null, checks };
  }
  let document: PayslipDocument;
  try {
    document = assemblePayslip({
      employee: { id: e.id, name: e.name, birthYear },
      periodStart,
      periodEnd,
      payDate,
      rules,
      payItems: items,
      lines,
      tax,
      taxTable: input.taxTable ? { version: input.taxTable.version, rows: input.taxTable.index } : null,
      expectedAnnualPayOre,
      hasRegularSalary: !!(monthly.version || hourly.version),
    });
  } catch (err) {
    check("compute", "block", err instanceof Error ? err.message : "lönen kunde inte räknas.");
    return { payslip: null, checks };
  }
  const rec = reconcile(document);
  if (!rec.ok) {
    check("reconcile", "block", `lönebeskedet går inte ihop: ${rec.problems.join(" ")}`);
    return { payslip: null, checks };
  }

  // 9. Semesterlöneskuld and the tjänstepension accrual.
  let liability = 0;
  let remainingDays: number | null = null;
  if (vacationRule === "sammalon" && monthly.version) {
    const model = vacationModelFor(input.settings);
    const versions = p.versions.filter((x) => x.vacationRule !== "none");
    const balances = versions.length ? vacationBalances({ model, versions, absences, schedule: p.schedule, asOf: periodEnd }) : [];
    const current = balances.find((b) => b.current) ?? balances[balances.length - 1];
    const years = vacationYears(periodEnd, model);
    const earningSoFar =
      model.earning === "previous-year" && current
        ? paidDaysEarned({ rules, yearFrom: years.earningYear.from, yearTo: years.earningYear.to, employedFrom: firstStart(versions), employedTo: periodEnd, nonQualifyingDays: 0, daysPerYear: monthly.version.vacationDays }).paidDays
        : 0;
    remainingDays = current?.remainingDays ?? null;
    const days = Math.max(0, (current?.remainingDays ?? 0) + earningSoFar);
    liability = lineAmount(monthlyVacationDayValue(monthlySalaryOre, agreement.vacationDayValuePercent, agreement.vacationDailySupplementPercent), days);
  } else if (vacationRule === "procent" && hourly.version && hourly.version.form !== "sava") {
    const accrued = rateOf(document.bases.vacationBasisOre + sickImputedOre, vacationPercent);
    const paidOut = sumOre(document.lines.filter((l) => l.item.kind === "vacation_pay").map((l) => l.amountOre));
    liability = Math.max(0, p.history.vacationLiabilityOre + accrued - paidOut);
  }

  const premium = pensionScheme === "none" ? null : pensionPremium(rules, pensionScheme, document.bases.pensionBasisOre, { charged: true });
  if (premium && document.bases.pensionBasisOre > premium.capOre) check("pension-cap", "warn", `pensionsgrundande lön ${kr(document.bases.pensionBasisOre)} är över taket ${kr(premium.capOre)}; premien är högre över taket.`);
  if (p.clock) {
    for (const a of clockAlerts(p.clock, input.today, heldForms(p.versions, input.today))) if (a.tone === "alert") check("clock", "warn", `${a.label}, ${a.detail}.`);
  }
  for (const v of [monthly.version, hourly.version, fee.version]) {
    if (v?.endsOn && v.endsOn >= periodStart && daysBetween(periodEnd, v.endsOn) <= 30) check("contract-ending", "warn", `avtalet slutar ${v.endsOn}${v.vacationRule !== "none" ? "; semesterersättning för sparade dagar betalas i slutlönen" : ""}.`);
  }

  document.context = {
    timeFrom,
    timeTo,
    taxTableImportId: document.taxTableVersion ? (input.taxTable?.importId ?? null) : null,
    pnrMasked: e.pnrMasked,
    group,
    yearToDate: { cashGrossOre: p.history.yearToDateCashGrossOre + document.totals.cashGrossOre, taxOre: p.history.yearToDateTaxOre + document.totals.taxOre },
    vacation: { rule: vacationRule, remainingDays, liabilityOre: liability, liabilityChangeOre: liability - p.history.vacationLiabilityOre },
    pension: { scheme: pensionScheme, premiumOre: premium?.totalOre ?? 0 },
    correctionIds: pending.map((c) => c.id),
  };
  return {
    payslip: {
      employeeId: e.id,
      document,
      group,
      vacationLiabilityOre: liability,
      vacationLiabilityChangeOre: liability - p.history.vacationLiabilityOre,
      pensionScheme,
      pensionPremiumOre: premium?.totalOre ?? 0,
      correctionIds: pending.map((c) => c.id),
    },
    checks,
  };
}

const firstStart = (versions: readonly EmploymentVersion[]) => versions.map((v) => v.startsOn).reduce(minDate);

function semesterRange(semester: readonly Absence[], from: IsoDate, to: IsoDate): { from: IsoDate; to: IsoDate; label: string } {
  const inside = semester.filter((a) => overlaps(a.from, a.to, from, to));
  const f = inside.map((a) => maxDate(a.from, from)).reduce(minDate, to);
  const t = inside.map((a) => minDate(a.to ?? to, to)).reduce(maxDate, from);
  return { from: f, to: t, label: f === t ? f : `${f}–${t}` };
}

/** The run: every person's payslip and the checklist, blocking items first. */
export function computeRun(input: RunInput): RunResult {
  const checks: RunCheck[] = [];
  const payslips: RunPayslip[] = [];
  if (input.ledgerLocked) checks.push({ code: "ledger-locked", level: "block", text: `Bokföringsperioden för lönedagen ${input.payDate} är låst.` });
  if (input.timeLocked) checks.push({ code: "time-locked", level: "info", text: `Tiden ${input.timeFrom} – ${input.timeTo} är redan låst; godkänd tid räknas som vanligt.` });
  for (const p of input.people) {
    const unapproved = p.timeEntries.filter((t) => t.workDate >= input.timeFrom && t.workDate <= input.timeTo && (t.status === "draft" || t.status === "submitted")).length;
    if (unapproved) checks.push({ code: "unapproved-time", level: "block", text: `${p.employee.name}: ${unapproved} tidrader i perioden är inte godkända.`, employeeId: p.employee.id });
    const out = computePerson(input, p);
    checks.push(...out.checks);
    if (out.payslip) payslips.push(out.payslip);
  }
  const open = unconfirmedDecisions(input.confirmed);
  if (open.length) checks.push({ code: "settings", level: "warn", text: `Lönebeslut som inte är bekräftade: ${open.map((d) => DECISION_LABEL[d].toLowerCase()).join(", ")}.` });
  const unverified = unverifiedRules(input.rules);
  if (unverified.length) checks.push({ code: "rules-unverified", level: "info", text: `${unverified.length} regler i regelboken är inte bekräftade mot primärkällan (${unverified.map((u) => u.path).join(", ")}).` });
  const corrections = input.people.reduce((s, p) => s + p.corrections.length, 0);
  if (corrections) checks.push({ code: "corrections", level: "info", text: `${corrections} rättelser från tidigare körningar tas med som retroaktiva rader.` });
  if (!payslips.length && !checks.some((c) => c.level === "block")) checks.push({ code: "no-pay", level: "block", text: "Ingen har lön i perioden." });
  const order: Record<CheckLevel, number> = { block: 0, warn: 1, info: 2 };
  checks.sort((a, b) => order[a.level] - order[b.level]);
  return { checks, payslips, ruleSetValidFrom: input.rules.validFrom, taxTableImportId: payslips.some((p) => p.document.taxTableVersion) ? (input.taxTable?.importId ?? null) : null };
}

export const blockingChecks = (checks: readonly RunCheck[]) => checks.filter((c) => c.level === "block");
