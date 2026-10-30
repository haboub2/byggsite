/**
 * The owners' löneuttag planner (docs/hr-lon.md, section 6; phase 5).
 * Informational only: it changes no payroll and decides nothing; it lays
 * out the numbers the owner and the accountant will ask for under the 3:12
 * rules from 2026 (IL 57 kap. as amended by SFS 2025:1361; the rule book's
 * `closeCompany`):
 *
 *   gränsbelopp  = grundbelopp + lönebaserat utrymme
 *   grundbelopp  = 4 inkomstbasbelopp of the year before, split on the
 *                  shares (the owner's percent)
 *   lönebaserat  = 50 % of (the owner's share of the company's
 *                  löneunderlag of the year before − 8 inkomstbasbelopp),
 *                  at most 50 × the owner's (or närstående's) own cash pay
 *                  of the year before
 *
 * Skatteverket, "Ändrade regler i inkomstdeklarationen 2027": 2026's
 * grundbelopp is 4 × 80 600 = 322 400 kr, the deduction 644 800 kr; an
 * owner of 100 % with a löneunderlag of 1 000 000 kr gets (1 000 000 −
 * 644 800) × 0,5 = 177 600 kr (the golden test).
 *
 * There is no löneuttagskrav any more and saved utdelningsutrymme is no
 * longer uprated. The löneunderlag here is the cash pay (bruttolön) on the
 * approved payslips of the year before, the owners' own included; pay from
 * subsidiaries and pay outside this system are not in it, and neither is a
 * närstående's pay for the cap. The owner's ownership percent is typed in
 * (the register has no share book); the grundbelopp is per share, and an
 * owner with shares in other companies shares one grundbelopp between them.
 */

import { fractionOf, rateOf, type Ore } from "../money";
import { payrollRulesAt, type PayrollRuleSet } from "../rules/payroll";

export type PlannerInput = {
  /** The beskattningsår whose dividend room is computed (wages of the year before count). */
  year: number;
  ownershipPercent: number;
  /** The owner's cash pay from the company in the year before. */
  ownPayLastYearOre: Ore;
  /** The company's cash pay to everyone in the year before. */
  wageSumLastYearOre: Ore;
  /** This year so far and what is planned for the rest of it, for next year's room. */
  ownPayYearToDateOre: Ore;
  ownPayProjectedRestOre: Ore;
  wageSumYearToDateOre: Ore;
  wageSumProjectedRestOre: Ore;
};

export type RoomResult = {
  year: number;
  ibbOre: Ore;
  grundbeloppOre: Ore;
  wageSumOre: Ore;
  wageSumDeductionOre: Ore;
  wageBasedBeforeCapOre: Ore;
  capOre: Ore;
  wageBasedOre: Ore;
  limitOre: Ore;
  capped: boolean;
};

export type PlannerResult = {
  /** The dividend room this year, from last year's pay. */
  thisYear: RoomResult;
  /** What this year's pay (so far plus planned) gives next year, with this year's IBB. */
  nextYear: RoomResult;
  ownPayThisYearOre: Ore;
  wageSumThisYearOre: Ore;
  ruleVersion: string;
  notes: string[];
};

/** The room for one beskattningsår from the pay of the year before. `ibbOre` is that year's inkomstbasbelopp. */
export function dividendRoom(rules: PayrollRuleSet, input: { year: number; ibbOre: Ore; ownershipPercent: number; ownPayOre: Ore; wageSumOre: Ore }): RoomResult {
  const c = rules.closeCompany;
  // rateOf takes two decimals; a share is typed with at most two.
  const share = Math.round(Math.max(0, Math.min(100, input.ownershipPercent)) * 100) / 100;
  const grundbeloppOre = rateOf(input.ibbOre * c.grundbeloppIbb, share);
  const wageSumDeductionOre = input.ibbOre * c.wageSumDeductionIbb;
  const wageBasedBeforeCapOre = rateOf(Math.max(0, rateOf(input.wageSumOre, share) - wageSumDeductionOre), c.wageBasedPercent);
  const capOre = Math.max(0, input.ownPayOre) * c.capMultipleOfOwnSalary;
  const wageBasedOre = Math.min(wageBasedBeforeCapOre, capOre);
  return {
    year: input.year,
    ibbOre: input.ibbOre,
    grundbeloppOre,
    wageSumOre: input.wageSumOre,
    wageSumDeductionOre,
    wageBasedBeforeCapOre,
    capOre,
    wageBasedOre,
    limitOre: grundbeloppOre + wageBasedOre,
    capped: wageBasedBeforeCapOre > capOre,
  };
}

export function ownerPlanner(input: PlannerInput): PlannerResult {
  const rules = payrollRulesAt(`${input.year}-12-31`);
  const ownPayThisYearOre = input.ownPayYearToDateOre + input.ownPayProjectedRestOre;
  const wageSumThisYearOre = input.wageSumYearToDateOre + input.wageSumProjectedRestOre;
  const thisYear = dividendRoom(rules, { year: input.year, ibbOre: rules.baseAmounts.inkomstbasbeloppPreviousYearOre, ownershipPercent: input.ownershipPercent, ownPayOre: input.ownPayLastYearOre, wageSumOre: input.wageSumLastYearOre });
  const nextYear = dividendRoom(rules, { year: input.year + 1, ibbOre: rules.baseAmounts.inkomstbasbeloppOre, ownershipPercent: input.ownershipPercent, ownPayOre: ownPayThisYearOre, wageSumOre: wageSumThisYearOre });
  const notes: string[] = [];
  if (!input.ownPayLastYearOre && thisYear.wageBasedBeforeCapOre > 0)
    notes.push("Utan egen lön förra året är taket för det lönebaserade utrymmet 0 kr; bara grundbeloppet gäller.");
  if (thisYear.capped) notes.push(`Det lönebaserade utrymmet stannar vid ${rules.closeCompany.capMultipleOfOwnSalary} gånger den egna lönen.`);
  if (thisYear.wageBasedBeforeCapOre === 0) notes.push(`Ägarens andel av lönesumman förra året var inte över ${rules.closeCompany.wageSumDeductionIbb} inkomstbasbelopp; inget lönebaserat utrymme.`);
  return { thisYear, nextYear, ownPayThisYearOre, wageSumThisYearOre, ruleVersion: rules.validFrom, notes };
}

/** A month's share of a yearly figure, for "lön per månad resten av året". */
export const restOfYear = (monthlyOre: Ore, monthsLeft: number): Ore => fractionOf(monthlyOre, Math.max(0, monthsLeft), 1);
