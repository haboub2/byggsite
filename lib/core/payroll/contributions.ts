/**
 * Arbetsgivaravgifter (docs/hr-lon.md, section 5 step 6). The category is
 * decided by birth year against the income year (the year of the pay
 * date): exempt (born 1937 or earlier), the older reduced rate (only
 * ålderspensionsavgift), the young people's reduction while it is in force,
 * or the full rate. Per payslip the amount is kept in öre with its parts
 * for the bookkeeping; the AGI drops the öre per rate (`agiContributions`).
 * Also the expected tjänstepension premium (SAF-LO, ITP1) for cost and accrual.
 */

import { fractionOf, rateOf, roundToKronor, sumOre, truncateToKronor, type Ore } from "../money";
import type { IsoDate } from "../rules/index";
import type { ContributionPart, ContributionParts, PayrollRuleSet } from "../rules/payroll";

export type ContributionCategory = "full" | "older" | "young" | "exempt" | "below-annual-threshold";

export type ContributionResult = {
  category: ContributionCategory;
  baseOre: Ore;
  /** The effective rate on the whole base, percent (for young people above the cap: a blend, informational). */
  ratePercent: number;
  amountOre: Ore;
  /** The amount split on the parts (sums exactly to amountOre). */
  parts: Record<ContributionPart, Ore>;
  /** For "young": the part of the base taxed at the reduced rate and the part above the cap. */
  reducedBaseOre: Ore;
  fullBaseOre: Ore;
};

const PART_KEYS: readonly ContributionPart[] = [
  "alderspension",
  "efterlevandepension",
  "sjukforsakring",
  "foraldraforsakring",
  "arbetsmarknad",
  "arbetsskada",
  "allmanLoneavgift",
];

const zeroParts = (): Record<ContributionPart, Ore> => Object.fromEntries(PART_KEYS.map((k) => [k, 0])) as Record<ContributionPart, Ore>;

export function contributionCategory(rules: PayrollRuleSet, birthYear: number): Exclude<ContributionCategory, "below-annual-threshold"> {
  const c = rules.employerContributions;
  if (birthYear <= c.exemptBornUpTo) return "exempt";
  if (birthYear >= c.olderReduced.bornFrom && birthYear <= c.olderReduced.bornTo) return "older";
  if (c.young && birthYear >= c.young.bornFrom && birthYear <= c.young.bornTo) return "young";
  return "full";
}

/** Each part's öre on a base at a part-rate table, summing exactly to the rounded total. */
function splitParts(baseOre: Ore, rates: Partial<ContributionParts>): Record<ContributionPart, Ore> {
  const parts = zeroParts();
  const totalPercent = Number(PART_KEYS.reduce((s, k) => s + (rates[k] ?? 0), 0).toFixed(2));
  const total = rateOf(baseOre, totalPercent);
  let assigned = 0;
  const remainders: { key: ContributionPart; rem: number }[] = [];
  for (const k of PART_KEYS) {
    const rate = rates[k] ?? 0;
    if (!rate) continue;
    const exact = (baseOre * Math.round(rate * 100)) / 10_000;
    const floor = Math.floor(exact);
    parts[k] = floor;
    assigned += floor;
    remainders.push({ key: k, rem: exact - floor });
  }
  // Largest remainder: hand out the öre that rounding the total created.
  remainders.sort((a, b) => b.rem - a.rem);
  for (let i = 0; assigned < total && i < remainders.length; i++, assigned++) parts[remainders[i].key] += 1;
  return parts;
}

function addParts(a: Record<ContributionPart, Ore>, b: Record<ContributionPart, Ore>): Record<ContributionPart, Ore> {
  const out = zeroParts();
  for (const k of PART_KEYS) out[k] = a[k] + b[k];
  return out;
}

export type ContributionInput = {
  rules: PayrollRuleSet;
  birthYear: number;
  payDate: IsoDate;
  /** The month's avgiftsunderlag for this person from this payslip. */
  baseOre: Ore;
  /** The person's expected pay from us this year including this payslip (the 1 000 kr rule). */
  expectedAnnualPayOre: Ore;
};

export function employerContributions(input: ContributionInput): ContributionResult {
  const { rules, baseOre } = input;
  const c = rules.employerContributions;
  const empty = (category: ContributionCategory, ratePercent: number): ContributionResult => ({
    category,
    baseOre,
    ratePercent,
    amountOre: 0,
    parts: zeroParts(),
    reducedBaseOre: 0,
    fullBaseOre: 0,
  });
  if (input.expectedAnnualPayOre < c.minAnnualPayOre) return empty("below-annual-threshold", 0);
  const category = contributionCategory(rules, input.birthYear);
  if (category === "exempt") return empty("exempt", 0);
  if (baseOre <= 0) return empty(category, category === "older" ? c.olderReduced.percent : c.fullPercent);

  if (category === "older") {
    const parts = splitParts(baseOre, { alderspension: c.olderReduced.percent });
    return { category, baseOre, ratePercent: c.olderReduced.percent, amountOre: sumOre(Object.values(parts)), parts, reducedBaseOre: baseOre, fullBaseOre: 0 };
  }

  if (category === "young" && c.young) {
    const y = c.young;
    const reducedBaseOre = Math.min(baseOre, y.capPerMonthOre);
    const fullBaseOre = baseOre - reducedBaseOre;
    const parts = addParts(splitParts(reducedBaseOre, y.parts), splitParts(fullBaseOre, c.parts));
    const amountOre = sumOre(Object.values(parts));
    return { category, baseOre, ratePercent: fullBaseOre ? Number(((amountOre / baseOre) * 100).toFixed(4)) : y.percent, amountOre, parts, reducedBaseOre, fullBaseOre };
  }

  const parts = splitParts(baseOre, c.parts);
  return { category: "full", baseOre, ratePercent: c.fullPercent, amountOre: sumOre(Object.values(parts)), parts, reducedBaseOre: 0, fullBaseOre: baseOre };
}

export type AgiContributionRow = { category: ContributionCategory; ratePercent: number; baseOre: Ore; amountOre: Ore };

/**
 * The month's contributions as the AGI computes them (Skatteverket's
 * technical description 1.1.18.2): each person's avgiftsunderlag is
 * reported in whole kronor (öre dropped per person, per rate), the
 * underlag is summed per rate, times the rate, "öretal bortfaller på varje
 * procentsats separat", then summed into ruta 487. Pass one result per
 * person (combine a person's payslips first). The difference to
 * the sum of the payslips' öre amounts is booked as a rounding difference.
 * For the young people's band the reduced and full parts are separate rows.
 */
export function agiContributions(rules: PayrollRuleSet, results: readonly ContributionResult[]): AgiContributionRow[] {
  const c = rules.employerContributions;
  const groups = new Map<string, AgiContributionRow>();
  const add = (category: ContributionCategory, ratePercent: number, baseOre: Ore) => {
    if (!baseOre) return;
    const key = `${category}:${ratePercent}`;
    const row = groups.get(key) ?? { category, ratePercent, baseOre: 0, amountOre: 0 };
    row.baseOre += truncateToKronor(baseOre);
    groups.set(key, row);
  };
  for (const r of results) {
    if (r.category === "exempt" || r.category === "below-annual-threshold") continue;
    if (r.category === "young" && c.young) {
      add("young", c.young.percent, r.reducedBaseOre);
      add("full", c.fullPercent, r.fullBaseOre);
    } else add(r.category, r.ratePercent, r.baseOre);
  }
  return [...groups.values()].map((row) => ({ ...row, amountOre: truncateToKronor(rateOf(row.baseOre, row.ratePercent, "down")) }));
}

/** Total of the AGI rows, whole kronor. */
export const agiContributionTotal = (rows: readonly AgiContributionRow[]): Ore => sumOre(rows.map((r) => r.amountOre));

/**
 * Expected monthly tjänstepension premium on one person's pension-reportable
 * pay: `belowPercent` up to the cap (capIbbPerYear × IBB / 12), `percentAboveCap`
 * above it (up to the ITP1 ceiling), each part rounded to whole kronor as
 * Fora's own example does. Fora's or Collectum's invoice is the booked cost;
 * this is the project cost and the accrual.
 */
export function pensionPremium(rules: PayrollRuleSet, scheme: "saf-lo" | "itp1", monthlyPayOre: Ore, options: { charged?: boolean } = {}): { belowCapOre: Ore; aboveCapOre: Ore; totalOre: Ore; capOre: Ore } {
  const ibb = rules.baseAmounts.inkomstbasbeloppOre;
  const s = scheme === "saf-lo" ? rules.pension.safLo : rules.pension.itp1;
  const capOre = fractionOf(ibb, Math.round(s.capIbbPerYear * 10), 120);
  const ceilingOre = scheme === "itp1" ? fractionOf(ibb, rules.pension.itp1.ceilingIbbPerYear, 12) : Number.MAX_SAFE_INTEGER;
  const belowPercent = scheme === "saf-lo" && options.charged ? rules.pension.safLo.chargedPercentBelowCap : s.percentBelowCap;
  const pay = Math.max(0, monthlyPayOre);
  const belowCapOre = roundToKronor(rateOf(Math.min(pay, capOre), belowPercent));
  const aboveCapOre = roundToKronor(rateOf(Math.max(0, Math.min(pay, ceilingOre) - capOre), s.percentAboveCap));
  return { belowCapOre, aboveCapOre, totalOre: belowCapOre + aboveCapOre, capOre };
}
