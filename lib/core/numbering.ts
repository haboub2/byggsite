/**
 * Document numbers (docs/fakturering.md, grundkrav 6). The gapless part is
 * the database function `next_document_number` in
 * supabase/migrations/0014_core.sql, which locks the series row inside the
 * issuing transaction. This file is the pure part: how a series is
 * configured and how a counter value is written as a number.
 */

export type SeriesConfig = {
  /** Series code stored on the document, "F" for invoices, "V" for journal entries. */
  series: string;
  /** Restart the counter each calendar year and print the year: 2026-0001. */
  perYear: boolean;
  /** First number in the series (or in each year). */
  start: number;
  /** Zero-pad the counter to this many digits when printing. 0 = no padding. */
  pad: number;
};

export const DEFAULT_INVOICE_SERIES: SeriesConfig = { series: "F", perYear: false, start: 10001, pad: 0 };
export const DEFAULT_JOURNAL_SERIES: SeriesConfig = { series: "V", perYear: true, start: 1, pad: 0 };

/** The printed number for a counter value. */
export function formatDocumentNumber(config: SeriesConfig, counter: number, year?: number): string {
  if (!Number.isInteger(counter) || counter < 1) throw new RangeError(`Löpnumret måste vara ett positivt heltal, fick ${counter}.`);
  const digits = config.pad > 0 ? String(counter).padStart(config.pad, "0") : String(counter);
  if (!config.perYear) return digits;
  if (!year) throw new RangeError("En serie per år behöver årtalet.");
  return `${year}-${digits}`;
}

/** Parse a printed number back to its counter (and year), or null. */
export function parseDocumentNumber(config: SeriesConfig, printed: string): { counter: number; year: number | null } | null {
  const m = config.perYear ? /^(\d{4})-(\d+)$/.exec(printed) : /^(\d+)$/.exec(printed);
  if (!m) return null;
  return config.perYear ? { counter: Number(m[2]), year: Number(m[1]) } : { counter: Number(m[1]), year: null };
}

/** The digits used for the OCR number: the counter, prefixed with the year for per-year series. */
export function ocrReferenceFor(config: SeriesConfig, counter: number, year?: number): string {
  return formatDocumentNumber(config, counter, year).replace(/\D/g, "");
}
