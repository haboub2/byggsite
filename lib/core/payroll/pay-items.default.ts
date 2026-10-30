/**
 * The standard löneartsregister each organisation is seeded with
 * (docs/hr-lon.md, section 3 `pay_items`, accounts from section 7, BAS
 * 2026). Admins edit their copy; the payslip stores the version it used.
 *
 * Where BAS separates kollektivanställda (70xx) from tjänstemän (72xx) the
 * register has one item per group, so a line's account never depends on
 * who it is for. AGI field codes: see AGI_BOXES.
 */

import type { PayItem, PayItemFlags } from "./payslip";

/**
 * AGI fältkoder (individuppgift), checked 2026-10-30 against Skatteverket's
 * "Så fyller du i arbetsgivardeklarationen" and the technical description
 * 1.1.18.2: 011 kontant bruttolön, 012 övriga skattepliktiga förmåner,
 * 013 bilförmån, 018 drivmedel vid bilförmån, 131 kontant ersättning som inte är underlag för
 * avgifter (the 1 000 kr rule), 050 bilersättning and 051 traktamente are
 * checkboxes for tax-free amounts, 023 is "varav styrelsearvode" (also
 * inside 011), 001 avdragen skatt. Huvuduppgift: 487 avgifter, 497 skatt.
 * Sjuklönekostnad (499) has not been reported since period 2024-07.
 */
export const AGI_BOXES = {
  tax: "001",
  cashPay: "011",
  benefits: "012",
  carBenefit: "013",
  /** Drivmedel vid bilförmån: 1,2 × marknadsvärdet (61 kap. 10 § IL); avgifter on the value without the factor. */
  fuelBenefit: "018",
  boardFeeOfWhich: "023",
  notContributionBase: "131",
  mileageFlag: "050",
  perDiemFlag: "051",
  totalContributions: "487",
  totalTax: "497",
} as const;

/** Taxable cash pay: table tax, avgifter, semesterlönegrundande, pension. */
const pay = (account: string, overrides: Partial<PayItemFlags> = {}): PayItemFlags => ({
  taxable: true,
  taxMode: "table",
  subjectToEmployerContribution: true,
  vacationPayBasis: true,
  pensionReportable: true,
  agiBox: AGI_BOXES.cashPay,
  account,
  counterAccount: "2820",
  foraCategory: account.startsWith("70") ? "lon" : null,
  ...overrides,
});

/** Paid out but not pay: tax-free, no avgifter, not in any basis. */
const taxFree = (account: string, agiBox: string | null): PayItemFlags => ({
  taxable: false,
  taxMode: "none",
  subjectToEmployerContribution: false,
  vacationPayBasis: false,
  pensionReportable: false,
  agiBox,
  account,
  counterAccount: "2820",
  foraCategory: null,
});

const item = (code: string, name: string, kind: PayItem["kind"], flags: PayItemFlags): PayItem => ({ code, name, kind, version: 1, flags });

/**
 * Sjuklön and semesterlön are pay but not semesterlönegrundande themselves:
 * under procentregeln the vacation calculator adds what the person would
 * have earned during semesterlönegrundande absence. So a line that removes
 * pay for such absence (sjukavdrag on månadslön) must stay in the basis,
 * or the same days would count twice.
 */
const notVacationBasis = { vacationPayBasis: false } as const;

export const DEFAULT_PAY_ITEMS: readonly PayItem[] = [
  // Salary
  item("1010", "Månadslön", "salary", pay("7210")),
  item("1011", "Månadslön kollektiv", "salary", pay("7010")),
  item("1020", "Lön VD", "salary", pay("7220")),
  item("1100", "Timlön", "hourly", pay("7010")),
  item("1101", "Timlön tjänsteman", "hourly", pay("7210")),
  item("1150", "Löneavdrag frånvaro", "gross_adjustment", pay("7210")),
  item("1151", "Löneavdrag frånvaro kollektiv", "gross_adjustment", pay("7010")),
  // OB and övertid (the band and its percent are on the line)
  item("1200", "OB-tillägg", "ob", pay("7010")),
  item("1201", "OB-tillägg tjänsteman", "ob", pay("7210")),
  item("1300", "Övertid", "overtime", pay("7010")),
  item("1301", "Övertid tjänsteman", "overtime", pay("7210")),
  // Sick pay (kind sick_pay sums to the sjuklönekostnad; karensavdrag is a negative sick_pay line)
  item("1400", "Sjuklön", "sick_pay", pay("7081", notVacationBasis)),
  item("1401", "Sjuklön tjänsteman", "sick_pay", pay("7281", notVacationBasis)),
  item("1410", "Karensavdrag", "sick_pay", pay("7081", notVacationBasis)),
  item("1411", "Karensavdrag tjänsteman", "sick_pay", pay("7281", notVacationBasis)),
  item("1420", "Sjukavdrag", "sick_deduction", pay("7010")),
  item("1421", "Sjukavdrag tjänsteman", "sick_deduction", pay("7210")),
  // Vacation
  item("1500", "Semesterlön", "vacation_pay", pay("7082", notVacationBasis)),
  item("1501", "Semesterlön tjänsteman", "vacation_pay", pay("7282", notVacationBasis)),
  item("1510", "Semestertillägg", "vacation_pay", pay("7282", notVacationBasis)),
  item("1520", "Semesterersättning", "vacation_pay", pay("7082", notVacationBasis)),
  item("1521", "Semesterersättning slutlön", "vacation_pay", pay("7082", { ...notVacationBasis, taxMode: "lump_sum" })),
  item("1522", "Semesterersättning slutlön tjänsteman", "vacation_pay", pay("7282", { ...notVacationBasis, taxMode: "lump_sum" })),
  item("1530", "Semesteravdrag obetald semester", "vacation_deduction", pay("7210", notVacationBasis)),
  // Board (reported in 011 and as "varav" in 023 by the AGI file), bonus, retro
  item("1600", "Styrelsearvode", "fee", pay("7240", { vacationPayBasis: false, pensionReportable: false })),
  // Bonus is semesterlönegrundande under 16 b § unless the agreement or the
  // bonus terms say it already includes semesterlön; then the org sets the flag off.
  item("1700", "Bonus", "gross_adjustment", pay("7210", { taxMode: "lump_sum" })),
  item("1710", "Retroaktiv lön", "retro", pay("7210", { taxMode: "lump_sum" })),
  item("1711", "Retroaktiv lön kollektiv", "retro", pay("7010", { taxMode: "lump_sum" })),
  // Benefits: taxable value, no cash (counter account 7399)
  item("1800", "Bilförmån", "benefit", { ...pay("7385", { vacationPayBasis: false, pensionReportable: false, agiBox: AGI_BOXES.carBenefit }), counterAccount: "7399", foraCategory: null }),
  item("1810", "Kostförmån", "benefit", { ...pay("7382", { vacationPayBasis: false, pensionReportable: false, agiBox: AGI_BOXES.benefits }), counterAccount: "7399", foraCategory: null }),
  item("1820", "Övrig förmån", "benefit", { ...pay("7389", { vacationPayBasis: false, pensionReportable: false, agiBox: AGI_BOXES.benefits }), counterAccount: "7399", foraCategory: null }),
  // Drivmedelsförmån (phase 6): the market value of the private fuel is
  // underlag for both tax and avgifter (1830); the 20 % uplift of 61 kap.
  // 10 § is taxed but carries no avgifter (1831). Both go in ruta 018, so
  // the box holds 1,2 × the market value as Skatteverket asks, and the
  // payslip's contribution base holds the value without the factor.
  item("1830", "Drivmedelsförmån", "benefit", { ...pay("7385", { vacationPayBasis: false, pensionReportable: false, agiBox: AGI_BOXES.fuelBenefit }), counterAccount: "7399", foraCategory: null }),
  item("1831", "Drivmedelsförmån, uppräkning 1,2", "benefit", { ...pay("7385", { vacationPayBasis: false, pensionReportable: false, subjectToEmployerContribution: false, agiBox: AGI_BOXES.fuelBenefit }), counterAccount: "7399", foraCategory: null }),
  // Expenses
  item("1900", "Traktamente skattefritt", "per_diem", taxFree("7321", AGI_BOXES.perDiemFlag)),
  item("1901", "Traktamente skattepliktigt", "per_diem", pay("7322", { vacationPayBasis: false, pensionReportable: false, foraCategory: null })),
  item("1910", "Milersättning skattefri", "mileage", taxFree("7331", AGI_BOXES.mileageFlag)),
  item("1911", "Milersättning skattepliktig", "mileage", pay("7332", { vacationPayBasis: false, pensionReportable: false, foraCategory: null })),
  item("1920", "Utlägg", "expense", taxFree("7690", null)),
  // After tax
  item("2000", "Nettolöneavdrag", "net_adjustment", { ...taxFree("2820", null), account: "1610" }),
];
