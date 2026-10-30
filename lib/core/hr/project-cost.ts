/**
 * Labour cost on a project from approved time (docs/hr-lon.md, section 7
 * "Project costing"). Pure: one approved row with a project becomes one
 * project_costs row of kind "hours" with the internal hourly cost, which is
 * the hourly pay (timlön, or månadslön × 12 / (52 × veckoarbetstid) with
 * monthlyToHourlyOre) plus arbetsgivaravgifter at the person's rate for the
 * work date by birth year (contributionCategory). A reversal (a correction)
 * gets the reversed row's rate and the negated amount, so the margin pages
 * see the net.
 *
 * Not in the cost yet: övertid and OB premiums, semester and pension
 * (they come from the payroll run in phase 3), and the cap on the young
 * people's reduced rate (the reduced rate is used on every hour).
 */

import { fractionOf, rateOf, type Ore } from "../money";
import type { IsoDate } from "../rules/index";
import { PAYROLL_RULE_SETS, payrollRulesAt, type PayrollRuleSet } from "../rules/payroll";
import { contributionCategory } from "../payroll/contributions";
import { monthlyToHourlyOre } from "../payroll/sick-pay";
import { COSTED_KINDS, TIME_KIND_LABEL, type TimeKind } from "./time";

/** What time_cost_basis() in 0037 returns for a row: the row, the person's birth date and the version that applied that day. */
export type CostBasis = {
  entryId: string;
  employeeName: string;
  birthDate: IsoDate | null;
  workDate: IsoDate;
  hours: number;
  kind: TimeKind;
  projectId: string | null;
  correctsId: string | null;
  payForm: "monthly" | "hourly" | null;
  monthlySalaryOre: Ore | null;
  hourlyRateOre: Ore | null;
  weeklyHours: number | null;
  workingTimePercent: number | null;
  /** For a reversal: the hourly rate on the reversed row's cost. */
  correctedHourlyRateOre: Ore | null;
};

export type ProjectCostRow = { entryId: string; hours: number; hourlyRateOre: Ore; amountOre: Ore; description: string };

/** Full-time week when a monthly contract has no weekly hours: 40 h at the contract's percent. */
const FULL_TIME_WEEK = 40;

function rulesFor(date: IsoDate): PayrollRuleSet {
  try {
    return payrollRulesAt(date);
  } catch {
    return PAYROLL_RULE_SETS[PAYROLL_RULE_SETS.length - 1];
  }
}

/** The employer's contribution percent for someone born in `birthYear` on `date`; unknown birth date: the full rate. */
export function contributionPercent(rules: PayrollRuleSet, birthYear: number | null): number {
  const c = rules.employerContributions;
  if (birthYear === null) return c.fullPercent;
  const category = contributionCategory(rules, birthYear);
  if (category === "exempt") return 0;
  if (category === "older") return c.olderReduced.percent;
  if (category === "young" && c.young) return c.young.percent;
  return c.fullPercent;
}

export type HourlyCost = { hourlyPayOre: Ore; contributionPercent: number; costOre: Ore };

/** The internal cost of one hour for the row's person and date. */
export function internalHourlyCost(b: CostBasis, rules: PayrollRuleSet = rulesFor(b.workDate)): HourlyCost {
  let hourlyPayOre: Ore;
  if (b.payForm === "hourly" && b.hourlyRateOre !== null) hourlyPayOre = b.hourlyRateOre;
  else if (b.payForm === "monthly" && b.monthlySalaryOre !== null) {
    const weekly = b.weeklyHours ?? (FULL_TIME_WEEK * (b.workingTimePercent ?? 100)) / 100;
    hourlyPayOre = monthlyToHourlyOre(b.monthlySalaryOre, weekly);
  } else {
    throw new Error(`${b.employeeName} har ingen anställning med lön den ${b.workDate}; registrera avtalet innan tiden godkänns.`);
  }
  const percent = contributionPercent(rules, b.birthDate ? Number(b.birthDate.slice(0, 4)) : null);
  return { hourlyPayOre, contributionPercent: percent, costOre: hourlyPayOre + rateOf(hourlyPayOre, percent) };
}

const fmtHours = (h: number) => String(Math.abs(h)).replace(".", ",");

/** hours × rate rounded half away from zero, on whole hundredths of an hour so it equals round(hours * rate) in SQL. */
const amountFor = (rate: Ore, hours: number): Ore => fractionOf(rate, Math.round(hours * 100), 100);

/**
 * The project_costs row for an approved row, or null when it costs nothing
 * on a project (no project, or beredskap). The amount is hours × rate as
 * project_costs stores it; a reversal negates the reversed row's amount.
 */
export function projectCostFor(b: CostBasis, rules?: PayrollRuleSet): ProjectCostRow | null {
  if (!b.projectId || !COSTED_KINDS.includes(b.kind) || b.hours === 0) return null;
  const kind = TIME_KIND_LABEL[b.kind].toLowerCase();
  if (b.hours < 0) {
    const rate = b.correctedHourlyRateOre ?? internalHourlyCost(b, rules).costOre;
    return {
      entryId: b.entryId,
      hours: b.hours,
      hourlyRateOre: rate,
      amountOre: -amountFor(rate, -b.hours),
      description: `Rättelse: ${b.employeeName} ${b.workDate}, −${fmtHours(b.hours)} h ${kind}`,
    };
  }
  const rate = internalHourlyCost(b, rules).costOre;
  return {
    entryId: b.entryId,
    hours: b.hours,
    hourlyRateOre: rate,
    amountOre: amountFor(rate, b.hours),
    description: `${b.employeeName} ${b.workDate}, ${fmtHours(b.hours)} h ${kind}`,
  };
}
