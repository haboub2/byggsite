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
    /** Statutory fee against a business debtor, öre (lag om ersättning för inkassokostnader). */
    businessOre: Ore;
    /** Against a consumer only if agreed in the contract; 0 by default. */
    consumerOre: Ore;
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
  reminderFee: { businessOre: 6_000, consumerOre: 0 },
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
 * Riksbanken's reference rate (referensränta), set 1 January and 1 July.
 * Percent. Add a row each half-year; the latest known row is used for later
 * dates and flagged `assumed`.
 */
export const REFERENCE_RATES: readonly { from: IsoDate; percent: number }[] = [
  { from: "2024-01-01", percent: 4.0 },
  { from: "2024-07-01", percent: 3.75 },
  { from: "2025-01-01", percent: 2.5 },
  { from: "2025-07-01", percent: 2.0 },
  { from: "2026-01-01", percent: 1.75 },
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

/** Add days to an ISO date. */
export function addDays(date: string, days: number): IsoDate {
  assertIsoDate(date);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
