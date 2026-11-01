/**
 * The rule book (docs/fakturering.md, grundkrav 4). Everything that is law or
 * an authority's decision lives here as dated rule sets, and the business
 * logic asks for the rules at the document's date: `rulesAt("2026-10-10")`.
 * No tax constant anywhere else.
 *
 * Checked against Skatteverket, Riksbanken and the statutes on 2026-10-19.
 * To change a rule for a new year: add a new set to RULE_SETS with its
 * validFrom, never edit an old one; old invoices must keep computing the
 * same way.
 */

import type { Ore } from "../money";

export type IsoDate = `${number}-${number}-${number}` | string;

export type VatCategory =
  /** Standard rate (25, 12 or 6 %). */
  | "S"
  /** Reverse charge, "omvänd betalningsskyldighet" (building services to builders). */
  | "AE"
  /** Exempt from VAT. */
  | "E";

export type RuleSet = {
  /** First date (inclusive) these rules apply. */
  validFrom: IsoDate;
  vat: {
    /** Rates in percent that may appear on a line. */
    rates: readonly number[];
    standard: number;
  };
  rot: {
    /** Share of labour cost incl. VAT, 0–1. */
    rate: number;
    /** Per person and calendar year, öre. */
    capPerPerson: Ore;
    /** ROT and RUT together per person and year, öre. */
    combinedCapPerPerson: Ore;
  };
  rut: {
    rate: number;
    capPerPerson: Ore;
  };
  reverseCharge: {
    /** The exact text the invoice must carry. */
    text: string;
    vatCategory: VatCategory;
    /** EN 16931 exemption reason code for reverse charge. */
    exemptionReasonCode: string;
  };
  lateInterest: {
    /** Percentage points added to the reference rate when nothing else is agreed (räntelagen 6 §). */
    surchargePercent: number;
  };
  reminderFee: {
    /**
     * The most a betalningspåminnelse may cost any debtor, öre (lag 1981:739
     * om ersättning för inkassokostnader, 2 och 4 §§). Charged only when the
     * invoice carried the clause (the agreement must exist when the claim
     * arose), business or consumer alike: lib/core/reminders/reminders.ts.
     */
    maxOre: Ore;
  };
  collection: {
    /** Inkassoavgift for a demand that meets 5 § inkassolagen (1974:182): lag (1981:739) 3 § 1 and 4 §, any debtor. */
    demandFeeOre: Ore;
    /** Förseningsersättning between businesses (lag 1981:739, 4 a §). Not charged by this product; the agency may. */
    delayCompensationOre: Ore;
    /** Shortest time to pay a demand sent by post, calendar days from sending (FFFS 2025:2, 4 kap. 7 §). */
    minPayDays: number;
    /** Bank days the debtor should always have from the presumed day of receipt (same). */
    minBankDays: number;
  };
  invoice: {
    /** Simplified invoices allowed below this gross amount incl. VAT (we never use them). */
    simplifiedInvoiceMaxOre: Ore;
    /** Years accounting records must be kept after the fiscal year's end (bokföringslagen). */
    retentionYears: number;
  };
  rotClaim: {
    /** Skatteverket XML schema version for "begäran om utbetalning". */
    schemaVersion: number;
    maxBuyersPerFile: number;
    /** Month and day of the year after payment by which the claim must be in. */
    deadlineMonthDay: string;
  };
};

const COMMON = {
  vat: { rates: [25, 12, 6, 0] as const, standard: 25 },
  rut: { rate: 0.5, capPerPerson: 7_500_000 },
  reverseCharge: {
    text: "Omvänd betalningsskyldighet",
    vatCategory: "AE" as VatCategory,
    exemptionReasonCode: "VATEX-EU-AE",
  },
  lateInterest: { surchargePercent: 8 },
  reminderFee: { maxOre: 6_000 },
  collection: { demandFeeOre: 18_000, delayCompensationOre: 45_000, minPayDays: 8, minBankDays: 4 },
  invoice: { simplifiedInvoiceMaxOre: 400_000, retentionYears: 7 },
  rotClaim: { schemaVersion: 6, maxBuyersPerFile: 100, deadlineMonthDay: "01-31" },
};

/** Oldest first. `rulesAt` picks the last set whose validFrom <= date. */
export const RULE_SETS: readonly RuleSet[] = [
  {
    // 2025: the temporary 50 % ROT rate. Caps unchanged.
    validFrom: "2025-01-01",
    ...COMMON,
    rot: { rate: 0.5, capPerPerson: 5_000_000, combinedCapPerPerson: 7_500_000 },
  },
  {
    // 2026: back to 30 %.
    validFrom: "2026-01-01",
    ...COMMON,
    rot: { rate: 0.3, capPerPerson: 5_000_000, combinedCapPerPerson: 7_500_000 },
  },
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function assertIsoDate(date: string): IsoDate {
  if (!DATE.test(date)) throw new RangeError(`Datum skrivs ÅÅÅÅ-MM-DD, fick "${date}".`);
  return date;
}

/** The rules in force on a date. Dates before the first set use the first set. */
export function rulesAt(date: string): RuleSet {
  assertIsoDate(date);
  let chosen = RULE_SETS[0];
  for (const set of RULE_SETS) if (set.validFrom <= date) chosen = set;
  return chosen;
}

/**
 * Riksbanken's reference rate (referensränta, räntelagen 9 §), set for each
 * calendar half-year: the policy rate at the end of the previous half-year,
 * rounded UP to the nearest half point, so it is always a whole or half
 * percent. Source: https://www.riksbank.se/sv/statistik/rantor-och-valutakurser/referensranta/
 * Add a row each 1 January and 1 July (rules.test.ts fails when the newest
 * row is older than the current half-year). Later dates use the latest row
 * and are flagged `assumed`; nothing that charges or prints the rate may use
 * an assumed value (assertReferenceRateKnown).
 */
export const REFERENCE_RATES: readonly { from: IsoDate; percent: number }[] = [
  { from: "2024-01-01", percent: 4.0 },
  { from: "2024-07-01", percent: 4.0 },
  { from: "2025-01-01", percent: 3.0 },
  { from: "2025-07-01", percent: 2.0 },
  { from: "2026-01-01", percent: 2.0 },
  { from: "2026-07-01", percent: 2.0 },
];

export function referenceRateAt(date: string): { percent: number; from: IsoDate; assumed: boolean } {
  assertIsoDate(date);
  let row = REFERENCE_RATES[0];
  for (const r of REFERENCE_RATES) if (r.from <= date) row = r;
  const last = REFERENCE_RATES[REFERENCE_RATES.length - 1];
  const nextHalfYear = last.from.slice(5) === "01-01" ? `${last.from.slice(0, 4)}-07-01` : `${Number(last.from.slice(0, 4)) + 1}-01-01`;
  return { percent: row.percent, from: row.from, assumed: date >= nextHalfYear };
}

/** Statutory late-payment interest in percent per year when nothing else is agreed. */
export function lateInterestPercentAt(date: string): number {
  return referenceRateAt(date).percent + rulesAt(date).lateInterest.surchargePercent;
}

/**
 * Throws when the reference rate for `date` is only assumed: a reminder or
 * an inkassokrav must state the rate Riksbanken actually set (räntelagen
 * 6 och 9 §§; FFFS 2025:2 4 kap. 4 §), so nothing is sent until the row is
 * added to REFERENCE_RATES.
 */
export function assertReferenceRateKnown(date: string): void {
  const r = referenceRateAt(date);
  if (!r.assumed) return;
  const half = date.slice(5, 7) <= "06" ? `1 januari ${date.slice(0, 4)}` : `1 juli ${date.slice(0, 4)}`;
  throw new Error(`Referensräntan från ${half} är inte inlagd (lib/core/rules/index.ts, REFERENCE_RATES). Lägg in Riksbankens värde innan påminnelser och inkassokrav skickas.`);
}

/**
 * Interest for a period, simple interest on the unpaid amount, day count
 * actual/365 as in Swedish practice. Rounded to öre.
 */
export function lateInterestOre(unpaid: Ore, annualPercent: number, days: number): Ore {
  if (days <= 0 || unpaid <= 0) return 0;
  return Math.round((unpaid * annualPercent * days) / (100 * 365));
}

/** Last day to file a ROT/RUT claim for work the customer paid on `paidOn`. */
export function rotClaimDeadline(paidOn: string): IsoDate {
  assertIsoDate(paidOn);
  const year = Number(paidOn.slice(0, 4)) + 1;
  return `${year}-${rulesAt(paidOn).rotClaim.deadlineMonthDay}`;
}

/** Last day records for a fiscal year ending `fiscalYearEnd` must be kept. */
export function retentionUntil(fiscalYearEnd: string): IsoDate {
  assertIsoDate(fiscalYearEnd);
  const year = Number(fiscalYearEnd.slice(0, 4)) + rulesAt(fiscalYearEnd).invoice.retentionYears;
  return `${year}-12-31`;
}

/** Days between two ISO dates, b − a. */
export function daysBetween(a: string, b: string): number {
  assertIsoDate(a);
  assertIsoDate(b);
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Every calendar day in [from, to], both ends included. */
export function* eachDay(from: IsoDate, to: IsoDate): Generator<IsoDate> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

/** Add days to an ISO date. */
export function addDays(date: string, days: number): IsoDate {
  assertIsoDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
