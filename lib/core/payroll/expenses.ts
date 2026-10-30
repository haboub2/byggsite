/**
 * Utlägg, milersättning and traktamente (docs/hr-lon.md, sections 3, 4 and
 * 7; phase 5). Pure: a claim's inputs, the rule book on the day of the
 * trip and the organisation's policy (what it pays) give the tax-free part
 * and the taxable excess, and the payslip lines the run pays it with.
 *
 *   Milersättning  Schablon per mil by car (egen bil 25 kr, förmånsbil
 *                  12 kr, förmånsbil el 9,50 kr in 2026) is tax-free; what
 *                  the employer pays above it is taxable pay (1910 / 1911,
 *                  AGI tick 050 for the tax-free part, 011 for the rest).
 *   Traktamente    Per day of a tjänsteresa with an overnight stay more
 *                  than 50 km from home and work: the normalbelopp for a
 *                  full day, half of it for the day of departure from 12.00
 *                  or the day of return by 19.00, 70 % after three months
 *                  and 50 % after two years at the same place, less the
 *                  måltidsreduktion for meals the employee got, plus
 *                  nattraktamente for nights without paid lodging. What the
 *                  employer pays above that is taxable (1900 / 1901, tick
 *                  051 and 011). A day trip without a night is not a
 *                  traktamente: all of it is taxable.
 *   Utlägg         The receipt's amount back, tax-free and outside the
 *                  pay (1920); the VAT is the bookkeeping's.
 *
 * The run pays an approved claim once (the line's `source`); the database
 * checks that the lines are the approved amounts and caps the tax-free
 * part with the same schabloner (expense_rules() in 0042, kept equal by
 * expenses.test.ts).
 */

import { lineAmount, roundHalfUp, sumOre, type Ore } from "../money";
import { addDays, type IsoDate } from "../rules/index";
import { payrollRulesAt } from "../rules/payroll";
import { benefitRulesAt, type BenefitRuleSet } from "../rules/benefits";
import type { PayLineInput } from "./payslip";

export type ExpenseKind = "utlagg" | "milersattning" | "traktamente";
export type CarType = "egen" | "formansbil" | "formansbil_el";
export type LongStay = "none" | "after3months" | "after2years";
/** Meals the employer (or the hotel, the customer) paid on one day of the trip. */
export type MealsOnDay = { breakfast?: boolean; lunch?: boolean; dinner?: boolean };

export const EXPENSE_KIND_LABEL: Record<ExpenseKind, string> = { utlagg: "Utlägg", milersattning: "Milersättning", traktamente: "Traktamente" };
export const CAR_TYPE_LABEL: Record<CarType, string> = { egen: "Egen bil", formansbil: "Förmånsbil (bensin, diesel m.fl.)", formansbil_el: "Förmånsbil, el" };
export const LONG_STAY_LABEL: Record<LongStay, string> = { none: "Mindre än tre månader på orten", after3months: "Efter tre månader (70 %)", after2years: "Efter två år (50 %)" };

/** What the organisation pays (Inställningar › Lön, "Utlägg och ersättningar"); the defaults are the schabloner. */
export type ExpensePolicy = {
  /** Milersättning per mil with the employee's own car. */
  ownCarPerMilOre: Ore;
  /** Per mil with a förmånsbil when the employee pays the fuel; null pays the schablon. */
  companyCarPerMilOre: Ore | null;
  companyElectricCarPerMilOre: Ore | null;
  /** Traktamente per full day, half day and night; null pays the schablon. */
  perDiemFullDayOre: Ore | null;
  perDiemHalfDayOre: Ore | null;
  perDiemNightOre: Ore | null;
};

export type ClaimInput =
  | { kind: "utlagg"; dateFrom: IsoDate; dateTo: IsoDate; amountOre: Ore; vatOre: Ore }
  | { kind: "milersattning"; dateFrom: IsoDate; dateTo: IsoDate; distanceKm: number; carType: CarType }
  | {
      kind: "traktamente";
      dateFrom: IsoDate;
      dateTo: IsoDate;
      /** "07:30"; the day of departure is a half day from 12:00. */
      departureTime: string;
      /** The day of return is a half day when the return is at 19:00 or earlier. */
      returnTime: string;
      /** Nights without lodging paid by the employer (nattraktamente). */
      nightsWithoutLodging: number;
      meals: Readonly<Record<IsoDate, MealsOnDay>>;
      longStay: LongStay;
      /** More than 50 km from both the regular place of work and the home. */
      farFromHome: boolean;
    };

export type PerDiemDay = { date: IsoDate; part: "full" | "half"; normalOre: Ore; reductionPercent: number; reductionOre: Ore; taxFreeOre: Ore; paidOre: Ore };

export type ClaimResult = {
  taxFreeOre: Ore;
  taxableOre: Ore;
  totalOre: Ore;
  /** The rule set (payroll and benefit rule books) it was computed with: "2026-04-01/2026-01-01". */
  ruleVersion: string;
  /** What the screens show and the claim stores (expense_claims.computation). */
  computation: Record<string, unknown>;
  /** Why something is not tax-free, for the person and the approver. */
  notes: string[];
};

/** The schablon per mil for a car type on a date. */
export function mileageSchablonOre(date: IsoDate, carType: CarType): Ore {
  const m = payrollRulesAt(date).expenses.mileage;
  return carType === "egen" ? m.ownCarPerMilOre : carType === "formansbil" ? m.companyCarPerMilOre : m.companyElectricCarPerMilOre;
}

function policyPerMil(policy: ExpensePolicy, carType: CarType, schablon: Ore): Ore {
  if (carType === "egen") return policy.ownCarPerMilOre;
  return (carType === "formansbil" ? policy.companyCarPerMilOre : policy.companyElectricCarPerMilOre) ?? schablon;
}

const ruleVersionAt = (date: IsoDate) => `${payrollRulesAt(date).validFrom}/${benefitRulesAt(date).validFrom}`;

/** "07:30" → minutes after midnight. */
const minutes = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
  if (!m) throw new RangeError(`Klockslaget skrivs TT:MM, fick "${t}".`);
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Måltidsreduktion for a day, percent of the day's normalbelopp: frukost 20, lunch and middag 35 each (all three 90). */
export function mealReductionPercent(rules: BenefitRuleSet, meals: MealsOnDay | undefined): number {
  if (!meals) return 0;
  const r = rules.perDiem.mealReductionPercent;
  const p = (meals.breakfast ? r.breakfast : 0) + (meals.lunch ? r.lunchOrDinner : 0) + (meals.dinner ? r.lunchOrDinner : 0);
  return Math.min(p, r.fullBoard);
}

/** The traktamente per day, tax-free and paid. */
export function perDiemDays(input: Extract<ClaimInput, { kind: "traktamente" }>, policy: ExpensePolicy): PerDiemDay[] {
  const out: PerDiemDay[] = [];
  for (let d = input.dateFrom; d <= input.dateTo; d = addDays(d, 1)) {
    const pay = payrollRulesAt(d).expenses.perDiem;
    const rules = benefitRulesAt(d);
    const full = input.longStay === "after2years" ? pay.after2YearsOre : input.longStay === "after3months" ? pay.after3MonthsOre : pay.fullDayOre;
    let part: PerDiemDay["part"] = "full";
    if (d === input.dateFrom && minutes(input.departureTime) >= minutes(rules.perDiem.halfDayIfDepartureFrom)) part = "half";
    if (d === input.dateTo && minutes(input.returnTime) <= minutes(rules.perDiem.halfDayIfReturnBy)) part = "half";
    const normalOre = part === "full" ? full : roundToWholeKronor(full / 2);
    const reductionPercent = mealReductionPercent(rules, input.meals[d]);
    // Skatteverket's table: the reduction in whole kronor of the day's normalbelopp.
    const reductionOre = roundToWholeKronor((normalOre * reductionPercent) / 100);
    const schablonOre = Math.max(0, normalOre - reductionOre);
    const policyFull = policy.perDiemFullDayOre ?? pay.fullDayOre;
    const policyHalf = policy.perDiemHalfDayOre ?? pay.halfDayOre;
    // The employer's rate differs from the schablon by the same amount on every day of the kind: above it the
    // difference is taxable, below it the employer pays less and only what is paid can be tax-free.
    const paidOre = Math.max(0, schablonOre + (part === "full" ? policyFull - pay.fullDayOre : policyHalf - pay.halfDayOre));
    out.push({ date: d, part, normalOre, reductionPercent, reductionOre, taxFreeOre: Math.min(schablonOre, paidOre), paidOre });
  }
  return out;
}

const roundToWholeKronor = (ore: number): Ore => roundHalfUp(ore / 100) * 100;

/** Split a claim into its tax-free part and taxable excess, with the rule versions of the trip's first day. */
export function computeClaim(input: ClaimInput, policy: ExpensePolicy): ClaimResult {
  if (input.dateTo < input.dateFrom) throw new RangeError("Slutdatumet ligger före startdatumet.");
  const ruleVersion = ruleVersionAt(input.dateFrom);
  if (input.kind === "utlagg") {
    if (input.amountOre <= 0) throw new RangeError("Utlägget behöver ett belopp.");
    if (input.vatOre < 0 || input.vatOre > input.amountOre) throw new RangeError("Momsen kan inte vara mer än beloppet.");
    return { taxFreeOre: input.amountOre, taxableOre: 0, totalOre: input.amountOre, ruleVersion, computation: { amountOre: input.amountOre, vatOre: input.vatOre }, notes: [] };
  }
  if (input.kind === "milersattning") {
    if (!(input.distanceKm > 0)) throw new RangeError("Ange hur långt du körde.");
    const mil = Math.round(input.distanceKm * 10) / 100; // km with one decimal → mil with two
    const schablonOre = mileageSchablonOre(input.dateFrom, input.carType);
    const paidPerMilOre = policyPerMil(policy, input.carType, schablonOre);
    const paidOre = lineAmount(paidPerMilOre, mil);
    const taxFreeOre = Math.min(paidOre, lineAmount(schablonOre, mil));
    return {
      taxFreeOre,
      taxableOre: paidOre - taxFreeOre,
      totalOre: paidOre,
      ruleVersion,
      computation: { mil, carType: input.carType, schablonPerMilOre: schablonOre, paidPerMilOre },
      notes: paidPerMilOre > schablonOre ? [`Ersättningen över ${schablonOre / 100} kr/mil är skattepliktig lön.`] : [],
    };
  }
  const days = perDiemDays(input, policy);
  const pay = payrollRulesAt(input.dateFrom).expenses.perDiem;
  const rules = benefitRulesAt(input.dateFrom).perDiem;
  const nightSchablon = input.longStay === "none" ? pay.nightOre : roundToWholeKronor((pay.nightOre * (input.longStay === "after3months" ? rules.after3MonthsPercent : rules.after2YearsPercent)) / 100);
  const nightPaid = policy.perDiemNightOre ?? nightSchablon;
  const nights = Math.max(0, Math.min(input.nightsWithoutLodging, days.length - 1));
  const paidOre = sumOre(days.map((d) => d.paidOre)) + nights * nightPaid;
  const notes: string[] = [];
  let taxFreeOre = sumOre(days.map((d) => d.taxFreeOre)) + nights * Math.min(nightSchablon, nightPaid);
  if (input.dateFrom === input.dateTo) {
    taxFreeOre = 0;
    notes.push("En resa utan övernattning ger inget skattefritt traktamente; ersättningen är skattepliktig lön.");
  } else if (!input.farFromHome) {
    taxFreeOre = 0;
    notes.push(`Skattefritt traktamente kräver att resan går mer än ${rules.minDistanceKm} km från både bostaden och den vanliga arbetsplatsen.`);
  }
  if (input.nightsWithoutLodging > days.length - 1) notes.push("Fler nätter än resan har räknas inte.");
  return {
    taxFreeOre,
    taxableOre: paidOre - taxFreeOre,
    totalOre: paidOre,
    ruleVersion,
    computation: { days, nights, nightSchablonOre: nightSchablon, nightPaidOre: nightPaid, longStay: input.longStay, farFromHome: input.farFromHome },
    notes,
  };
}

export type ApprovedClaim = {
  id: string;
  kind: ExpenseKind;
  dateFrom: IsoDate;
  dateTo: IsoDate;
  description: string;
  taxFreeOre: Ore;
  taxableOre: Ore;
  computation: Record<string, unknown>;
};

const claimLabel = (c: ApprovedClaim) => `${c.dateFrom === c.dateTo ? c.dateFrom : `${c.dateFrom}–${c.dateTo}`}${c.description ? ` ${c.description}` : ""}`.slice(0, 120);

/**
 * The payslip lines for an approved claim, each carrying the claim as its
 * source: tax-free and taxable part on their pay items (the database
 * checks the sums against the approved claim).
 */
export function claimLines(c: ApprovedClaim): PayLineInput[] {
  const source = { kind: "expense_claim" as const, id: c.id };
  const base = { from: c.dateFrom, to: c.dateTo, basisOre: null, ratePercent: null, source };
  const lines: PayLineInput[] = [];
  const label = claimLabel(c);
  if (c.kind === "utlagg") {
    lines.push({ ...base, code: "1920", text: `Utlägg ${label}`, quantity: null, unit: null, unitPriceOre: null, amountOre: c.taxFreeOre });
  } else if (c.kind === "milersattning") {
    const mil = typeof c.computation.mil === "number" ? c.computation.mil : null;
    const schablon = typeof c.computation.schablonPerMilOre === "number" ? c.computation.schablonPerMilOre : null;
    if (c.taxFreeOre) lines.push({ ...base, code: "1910", text: `Milersättning ${label}`, quantity: mil, unit: mil === null ? null : "mil", unitPriceOre: schablon, amountOre: c.taxFreeOre });
    if (c.taxableOre) lines.push({ ...base, code: "1911", text: `Milersättning över schablon ${label}`, quantity: null, unit: null, unitPriceOre: null, amountOre: c.taxableOre });
  } else {
    if (c.taxFreeOre) lines.push({ ...base, code: "1900", text: `Traktamente ${label}`, quantity: null, unit: null, unitPriceOre: null, amountOre: c.taxFreeOre });
    if (c.taxableOre) lines.push({ ...base, code: "1901", text: `Traktamente över schablon ${label}`, quantity: null, unit: null, unitPriceOre: null, amountOre: c.taxableOre });
  }
  return lines;
}
