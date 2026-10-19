/**
 * Money in the core is an integer number of öre. Nothing else is ever stored
 * or summed. This file is the only place that rounds (docs/fakturering.md,
 * grundkrav 6), so a rounding rule changes in one function and its test.
 *
 * Integers up to 2^53 are exact in JavaScript, which is 90 billion kronor;
 * the database column is bigint. Numbers are checked at the boundary with
 * `ore()`, after which arithmetic on them is plain integer arithmetic.
 */

/** An integer amount in öre. Positive for debits/receivables, negative on credit notes. */
export type Ore = number;

export const ORE_PER_KRONA = 100;

/** Validate that a value is a whole number of öre. Throws on anything else. */
export function ore(value: number): Ore {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Belopp måste vara ett heltal i öre, fick ${value}.`);
  return value;
}

/** Round half away from zero, the rule Swedish invoices and Skatteverket use. */
export function roundHalfUp(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value));
}

/** Kronor (possibly with decimals) to öre. 123.456 → 12346. */
export function kronorToOre(kronor: number): Ore {
  if (!Number.isFinite(kronor)) throw new RangeError(`Belopp måste vara ett tal, fick ${kronor}.`);
  return roundHalfUp(kronor * ORE_PER_KRONA);
}

export function oreToKronor(amount: Ore): number {
  return ore(amount) / ORE_PER_KRONA;
}

/** Öresavrundning: round to the nearest whole krona (50 öre rounds up). */
export function roundToKronor(amount: Ore): Ore {
  return roundHalfUp(ore(amount) / ORE_PER_KRONA) * ORE_PER_KRONA;
}

/** Line amount: unit price in öre times a decimal quantity, rounded to öre. */
export function lineAmount(unitPrice: Ore, quantity: number): Ore {
  if (!Number.isFinite(quantity)) throw new RangeError(`Antal måste vara ett tal, fick ${quantity}.`);
  return roundHalfUp(ore(unitPrice) * quantity);
}

/** VAT on a net amount at a percentage rate, in öre. */
export function vatOnNet(net: Ore, ratePercent: number): Ore {
  return roundHalfUp((ore(net) * ratePercent) / 100);
}

/** Split a gross (incl. VAT) amount into net and VAT at a percentage rate. */
export function splitGross(gross: Ore, ratePercent: number): { net: Ore; vat: Ore } {
  const vat = roundHalfUp((ore(gross) * ratePercent) / (100 + ratePercent));
  return { net: gross - vat, vat };
}

/** Net to gross at a percentage rate. */
export function grossFromNet(net: Ore, ratePercent: number): Ore {
  return ore(net) + vatOnNet(net, ratePercent);
}

export function sumOre(amounts: Iterable<Ore>): Ore {
  let total = 0;
  for (const a of amounts) total += ore(a);
  return total;
}

/**
 * Split an amount into `parts` shares that sum exactly to the amount. The
 * remainder öre go to the first shares. Used for ROT per owner and for
 * payment allocations across invoices.
 */
export function splitEvenly(amount: Ore, parts: number): Ore[] {
  if (!Number.isInteger(parts) || parts < 1) throw new RangeError(`Antal delar måste vara minst 1, fick ${parts}.`);
  const total = ore(amount);
  const base = Math.trunc(total / parts);
  let remainder = total - base * parts;
  const step = remainder < 0 ? -1 : 1;
  return Array.from({ length: parts }, () => {
    const extra = remainder !== 0 ? step : 0;
    remainder -= extra;
    return base + extra;
  });
}

/** Percent of an amount, rounded to öre. 30 % of 4 750 000 öre = 1 425 000. */
export function percentOf(amount: Ore, percent: number): Ore {
  return roundHalfUp((ore(amount) * percent) / 100);
}

/* ---------- formatting, Swedish ---------- */

/** "12 345,50" — accounting style with two decimals, plain spaces (renders the
 *  same in PDF and browser). */
export function formatOre(amount: Ore, options: { decimals?: 0 | 2; currency?: boolean } = {}): string {
  const { decimals = 2, currency = false } = options;
  const kronor = ore(amount) / ORE_PER_KRONA;
  const s = kronor
    .toLocaleString("sv-SE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
    .replace(/ | /g, " ")
    .replace(/^-/, "−");
  return currency ? `${s} kr` : s;
}

/** "12 345 kr" — whole kronor, for lists and totals read aloud. */
export function formatKronor(amount: Ore): string {
  return formatOre(roundToKronor(amount), { decimals: 0, currency: true });
}

/** Parse what a Swedish user types: "12 345,50", "12345.5", "−1 200". */
export function parseKronor(input: string): Ore {
  const cleaned = input.replace(/[\s  ]/g, "").replace(/−/g, "-").replace(/kr$/i, "").replace(",", ".");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) throw new RangeError(`Kunde inte läsa beloppet "${input}".`);
  return kronorToOre(Number(cleaned));
}
