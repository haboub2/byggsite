/**
 * Förmåner valued for a pay month (docs/hr-lon.md, sections 3, 4 and 7;
 * phase 5). Pure: a benefit's stored parameters and the rule book
 * (rules/benefits.ts) at the pay date give the month's taxable value and
 * the payslip line, booked on the pay item's account against 7399 and
 * reported in AGI ruta 013 (bil) or 012 (kost, bostad, annat).
 *
 *   Bil     IL 61 kap. 5–9 §§ by the day the car first became taxable:
 *           0,29 prisbasbelopp (0,317 before 2018-07-01, fordonsskatt
 *           inside), a ränterelaterat belopp (nybilspris × (70 % ×
 *           statslåneräntan + 1 %), 75 % × statslåneräntan before
 *           2021-07-01), a prisrelaterat belopp (13 %, or 9 % up to 7,5
 *           prisbasbelopp and 20 % above before 2021-07-01) and the
 *           fordonsskatt (from 2018-07-01); nybilspris with extra
 *           equipment, at least 4 prisbasbelopp for a car six years or
 *           older, less the miljöbil reduction for cars from 2022-07-01;
 *           75 % at 3 000 mil in tjänsten a year. Each part in whole
 *           kronor, a twelfth a month for every month with the car (61 kap.
 *           9 § reduces the year by a twelfth per whole month without it).
 *   Kost    Per meal and day (frukost, lunch eller middag, helt fri kost)
 *           times the meals in a month.
 *   Bostad  Skatteverket's schablon per m² and month for the area.
 *   Annat   Its market value per month.
 *
 * Every value is less what the employee pays for the benefit from the net
 * pay. Drivmedelsförmån (61 kap. 10 §: the market value of the fuel the
 * employee drove privately, × 1,2 for the tax; Skatteverket's avgifter on
 * the value without the factor, AGI ruta 018) is two lines since phase 6:
 * 1830 with the value less the employee's repayment (tax and avgifter) and
 * 1831 with the rest up to 1,2 × value less the repayment (tax only).
 * Skatteverket's example: 3 600 kr × 100/300 = 1 200 kr → 1 440 kr taxed,
 * 1 200 kr avgifter; repaid 1 200 kr → 240 kr; repaid 1 440 kr → 0.
 */

import { type Ore } from "../money";
import type { IsoDate } from "../rules/index";
import { benefitRulesAt, carRegimeFor, HOUSING_REGION_LABEL, type BenefitRuleSet, type CarRegime, type HousingRegion } from "../rules/benefits";
import { payrollRulesAt } from "../rules/payroll";
import type { PayLineInput } from "./payslip";

export type BenefitKind = "bil" | "kost" | "bostad" | "annan";
export type CarFuel = "bensin" | "diesel" | "el" | "laddhybrid" | "vatgas" | "gas" | "etanol" | "annan";

export const BENEFIT_KIND_LABEL: Record<BenefitKind, string> = { bil: "Bilförmån", kost: "Kostförmån", bostad: "Bostadsförmån", annan: "Annan förmån" };
export const FUEL_LABEL: Record<CarFuel, string> = { bensin: "Bensin", diesel: "Diesel", el: "El", laddhybrid: "Laddhybrid", vatgas: "Vätgas", gas: "Gas (ej gasol)", etanol: "Etanol", annan: "Annat" };

export type CarInput = {
  registrationNumber: string;
  model: string;
  /** The day the car first became taxable in Sweden (vägtrafikskattelagen), which picks the regime. */
  firstRegisteredOn: IsoDate;
  modelYear: number;
  fuel: CarFuel;
  newCarPriceOre: Ore;
  extraEquipmentOre: Ore;
  /** Fordonsskatt per year. */
  vehicleTaxOre: Ore;
  /** Expected mil in tjänsten in the calendar year. */
  businessMilPerYear: number;
  fuelPaidByEmployer: boolean;
  /** The market value per month of the fuel the employee drives privately on (61 kap. 10 §); 0 until the owner has worked it out. */
  privateFuelOre: Ore;
  /** What the employee pays back for that fuel per month (net deduction or own payment); lowers the fuel value first. */
  fuelEmployeePaymentOre: Ore;
};

/** Meals per month for kostförmån. */
export type MealsPerMonth = { breakfast?: number; lunchOrDinner?: number; fullDays?: number };

export type Benefit = {
  id: string;
  employeeId: string;
  kind: BenefitKind;
  description: string;
  validFrom: IsoDate;
  validTo: IsoDate | null;
  car: CarInput | null;
  meals: MealsPerMonth;
  housing: { areaM2: number; region: HousingRegion } | null;
  /** Annan förmån: market value per month. */
  marketValueOre: Ore;
  /** What the employee pays per month from the net pay. */
  employeePaymentOre: Ore;
};

export type CarBenefitResult = {
  regime: CarRegime["key"];
  regimeLabel: string;
  prisbasbeloppOre: Ore;
  statslaneranta: number;
  /** Nybilspris + extra equipment, the old-car floor, less the miljöbil reduction: what the parts are taken of. */
  priceOre: Ore;
  environmentalReductionOre: Ore;
  oldCarFloorApplied: boolean;
  pbbPartOre: Ore;
  interestPercent: number;
  interestPartOre: Ore;
  pricePartOre: Ore;
  vehicleTaxOre: Ore;
  /** The full year's value before the 3 000 mil reduction. */
  fullYearOre: Ore;
  highMileage: boolean;
  yearOre: Ore;
  monthOre: Ore;
};

const downToKronor = (ore: number): Ore => Math.floor(ore / 100 + 1e-9) * 100;
/** amount × percent / 100 with the percent as thousandths, exact for three decimals. */
const percentOfExact = (amount: Ore, percent: number) => (amount * Math.round(percent * 1000)) / 100_000;

/** The year's bilförmån (excluding drivmedel) under the rules of `date`'s year. */
export function carBenefit(car: CarInput, date: IsoDate, rules: BenefitRuleSet = benefitRulesAt(date)): CarBenefitResult {
  const r = rules.car;
  const pbb = payrollRulesAt(date).baseAmounts.prisbasbeloppOre;
  const regime = carRegimeFor(rules, car.firstRegisteredOn);
  let price = car.newCarPriceOre + car.extraEquipmentOre;
  const age = rules.incomeYear - car.modelYear;
  const floor = pbb * r.oldCarMinPbb;
  const oldCarFloorApplied = age >= r.oldCarYears && price < floor;
  if (oldCarFloorApplied) price = floor;
  let environmentalReductionOre = 0;
  if (car.firstRegisteredOn >= r.environmental.fromFirstTaxable) {
    const e = r.environmental;
    const amount = car.fuel === "el" ? e.el : car.fuel === "vatgas" ? e.vatgas : car.fuel === "laddhybrid" ? e.laddhybrid : car.fuel === "gas" ? e.gas : 0;
    environmentalReductionOre = Math.min(amount, Math.floor((price * e.maxPercent) / 100));
  }
  price -= environmentalReductionOre;
  const slr = Math.max(r.statslaneranta, r.statslanerantaFloor);
  const interestPercent = Math.round((regime.interestShareOfSlr * slr + regime.interestAddPercent) * 10_000) / 10_000;
  const pbbPartOre = downToKronor(percentOfExact(pbb, regime.pbbFactor * 100));
  const interestPartOre = downToKronor(percentOfExact(price, interestPercent));
  const p = regime.priceRelated;
  const pricePartOre =
    p.upToPbb === null
      ? downToKronor(percentOfExact(price, p.percent))
      : downToKronor(percentOfExact(Math.min(price, pbb * p.upToPbb), p.percent) + percentOfExact(Math.max(0, price - pbb * p.upToPbb), p.abovePercent ?? p.percent));
  const vehicleTaxOre = regime.addsVehicleTax ? downToKronor(car.vehicleTaxOre) : 0;
  const fullYearOre = pbbPartOre + interestPartOre + pricePartOre + vehicleTaxOre;
  const highMileage = car.businessMilPerYear >= r.highMileageMil;
  const yearOre = highMileage ? downToKronor((fullYearOre * r.highMileagePercent) / 100) : fullYearOre;
  return {
    regime: regime.key,
    regimeLabel: regime.label,
    prisbasbeloppOre: pbb,
    statslaneranta: slr,
    priceOre: price,
    environmentalReductionOre,
    oldCarFloorApplied,
    pbbPartOre,
    interestPercent,
    interestPartOre,
    pricePartOre,
    vehicleTaxOre,
    fullYearOre,
    highMileage,
    yearOre,
    monthOre: downToKronor(yearOre / 12),
  };
}

/** Drivmedelsförmån for a month: the value with avgifter (1830) and the uplift without (1831). */
export type FuelBenefit = {
  marketValueOre: Ore;
  repaidOre: Ore;
  factor: number;
  /** Taxable in all: max(0, factor × value − repaid). */
  taxableOre: Ore;
  /** Underlag for avgifter and the 1830 line: max(0, value − repaid). */
  baseOre: Ore;
  /** The 1831 line: taxable − base. */
  upliftOre: Ore;
};

export type BenefitMonth = {
  /** The month's taxable value after the employee's payment. */
  valueOre: Ore;
  /** Before the employee's payment. */
  grossOre: Ore;
  code: "1800" | "1810" | "1820";
  text: string;
  ruleVersion: string;
  computation: Record<string, unknown>;
  warnings: string[];
  /** Bil with fuel the employer pays: the drivmedelsförmån next to the car's value. */
  fuel?: FuelBenefit;
};

/** The month's drivmedelsförmån under the rules of the pay date (null without fuel paid by the employer). */
export function fuelBenefit(car: Pick<CarInput, "fuelPaidByEmployer" | "privateFuelOre" | "fuelEmployeePaymentOre">, rules: BenefitRuleSet): FuelBenefit | null {
  if (!car.fuelPaidByEmployer || car.privateFuelOre <= 0) return null;
  const factor = rules.car.fuelFactor;
  const repaid = Math.max(0, car.fuelEmployeePaymentOre);
  const taxableOre = Math.max(0, Math.round(car.privateFuelOre * factor) - repaid);
  const baseOre = Math.max(0, car.privateFuelOre - repaid);
  return { marketValueOre: car.privateFuelOre, repaidOre: repaid, factor, taxableOre, baseOre, upliftOre: taxableOre - baseOre };
}

/** Whether a benefit applies some day of [from, to]; any day counts the whole month (61 kap. 9 §). */
export const benefitActive = (b: Pick<Benefit, "validFrom" | "validTo">, from: IsoDate, to: IsoDate) => b.validFrom <= to && (b.validTo === null || b.validTo >= from);

/** A benefit's value for a pay month, with the rules of `date` (the pay date). */
export function benefitMonth(b: Benefit, date: IsoDate): BenefitMonth {
  const rules = benefitRulesAt(date);
  const ruleVersion = rules.validFrom;
  const warnings: string[] = [];
  const less = (gross: Ore) => Math.max(0, gross - b.employeePaymentOre);
  if (b.kind === "bil") {
    if (!b.car) throw new Error("Bilförmånen saknar bilens uppgifter.");
    const c = carBenefit(b.car, date, rules);
    const fuel = fuelBenefit(b.car, rules);
    if (b.car.fuelPaidByEmployer && !fuel) warnings.push("företaget betalar drivmedel men drivmedlets marknadsvärde för privat körning per månad är 0; ange det på förmånen, annars redovisas ingen drivmedelsförmån (ruta 018).");
    if (c.oldCarFloorApplied) warnings.push(`bilen är sex år eller äldre: nybilspriset räknas som lägst ${rules.car.oldCarMinPbb} prisbasbelopp.`);
    return {
      valueOre: less(c.monthOre),
      grossOre: c.monthOre,
      code: "1800",
      text: `Bilförmån ${b.car.registrationNumber}${b.car.model ? ` ${b.car.model}` : ""}`,
      ruleVersion,
      computation: { ...c, ...(fuel ? { fuel } : {}) },
      warnings,
      ...(fuel ? { fuel } : {}),
    };
  }
  if (b.kind === "kost") {
    const m = rules.meals;
    const breakfast = b.meals.breakfast ?? 0;
    const lunchOrDinner = b.meals.lunchOrDinner ?? 0;
    const fullDays = b.meals.fullDays ?? 0;
    const gross = breakfast * m.breakfastOre + lunchOrDinner * m.lunchOrDinnerOre + fullDays * m.fullDayOre;
    return {
      valueOre: less(gross),
      grossOre: gross,
      code: "1810",
      text: `Kostförmån${b.description ? ` ${b.description}` : ""}`,
      ruleVersion,
      computation: { breakfast, lunchOrDinner, fullDays, breakfastOre: m.breakfastOre, lunchOrDinnerOre: m.lunchOrDinnerOre, fullDayOre: m.fullDayOre },
      warnings,
    };
  }
  if (b.kind === "bostad") {
    if (!b.housing) throw new Error("Bostadsförmånen saknar yta och område.");
    const perM2 = rules.housing.perSquareMetreMonthOre[b.housing.region];
    const gross = Math.round(b.housing.areaM2 * perM2);
    return {
      valueOre: less(gross),
      grossOre: gross,
      code: "1820",
      text: `Bostadsförmån ${b.housing.areaM2} m², ${HOUSING_REGION_LABEL[b.housing.region].toLowerCase()}`,
      ruleVersion,
      computation: { areaM2: b.housing.areaM2, region: b.housing.region, perSquareMetreMonthOre: perM2 },
      warnings,
    };
  }
  return { valueOre: less(b.marketValueOre), grossOre: b.marketValueOre, code: "1820", text: b.description || "Övrig förmån", ruleVersion, computation: { marketValueOre: b.marketValueOre }, warnings };
}

/** The drivmedelsförmån lines: 1830 (value less repayment, avgifter) and 1831 (the uplift, tax only); each only when above 0. */
export function fuelLines(b: Benefit, month: BenefitMonth, periodStart: IsoDate, periodEnd: IsoDate): PayLineInput[] {
  const f = month.fuel;
  if (!f) return [];
  // A car benefit always has a registration number (the table requires it for kind bil).
  const reg = b.car?.registrationNumber ?? "";
  const line = (code: "1830" | "1831", text: string, amountOre: Ore, basisOre: Ore | null, ratePercent: number | null): PayLineInput => ({
    code,
    text,
    quantity: 1,
    unit: "mån",
    unitPriceOre: amountOre,
    basisOre,
    ratePercent,
    amountOre,
    from: periodStart,
    to: periodEnd,
    source: { kind: "benefit", id: b.id },
  });
  const out: PayLineInput[] = [];
  if (f.baseOre > 0) out.push(line("1830", `Drivmedelsförmån ${reg}`, f.baseOre, f.repaidOre ? f.marketValueOre : null, null));
  if (f.upliftOre > 0) out.push(line("1831", `Drivmedelsförmån ${reg}, uppräkning ${String(f.factor).replace(".", ",")}`, f.upliftOre, f.marketValueOre, Math.round((f.factor - 1) * 100)));
  return out;
}

/** The payslip line for a benefit in a pay month (none when its value is 0). */
export function benefitLine(b: Benefit, month: BenefitMonth, periodStart: IsoDate, periodEnd: IsoDate): PayLineInput | null {
  if (month.valueOre <= 0) return null;
  return {
    code: month.code,
    text: month.text,
    quantity: 1,
    unit: "mån",
    unitPriceOre: month.valueOre,
    basisOre: month.grossOre !== month.valueOre ? month.grossOre : null,
    ratePercent: null,
    amountOre: month.valueOre,
    from: periodStart,
    to: periodEnd,
    source: { kind: "benefit", id: b.id },
  };
}
