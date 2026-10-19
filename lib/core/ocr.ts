/**
 * OCR reference numbers as Bankgirot's "Bankgiro Inbetalningar" checks them:
 * the invoice number, a length digit and a Luhn (mod 10) check digit. With
 * the length digit the bank can reject a mistyped reference ("hård
 * kontroll"), so a payment is never matched to the wrong invoice.
 *
 * Layout: <reference digits><length digit><check digit>
 * Length digit = total length of the OCR number (incl. itself and the check
 * digit) mod 10.
 */

/** Luhn check digit for a string of digits (the digit that makes the whole pass mod 10). */
export function luhnCheckDigit(digits: string): number {
  if (!/^\d+$/.test(digits)) throw new RangeError(`OCR byggs bara av siffror, fick "${digits}".`);
  let sum = 0;
  let double = true; // the rightmost digit of the payload is doubled
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]) * (double ? 2 : 1);
    if (d > 9) d -= 9;
    sum += d;
    double = !double;
  }
  return (10 - (sum % 10)) % 10;
}

/** Validate a complete number with the Luhn algorithm. */
export function luhnValid(digits: string): boolean {
  if (!/^\d{2,}$/.test(digits)) return false;
  return luhnCheckDigit(digits.slice(0, -1)) === Number(digits[digits.length - 1]);
}

/** Build an OCR number from an invoice number (or any digit string). */
export function ocrFor(reference: string | number): string {
  const ref = String(reference).replace(/\D/g, "");
  if (ref.length === 0 || ref.length > 23) throw new RangeError(`Referensen måste vara 1–23 siffror, fick "${reference}".`);
  const lengthDigit = (ref.length + 2) % 10;
  const payload = `${ref}${lengthDigit}`;
  return `${payload}${luhnCheckDigit(payload)}`;
}

/** True when the check digit and the length digit both agree with the number. */
export function isValidOcr(ocr: string): boolean {
  if (!/^\d{3,25}$/.test(ocr)) return false;
  if (!luhnValid(ocr)) return false;
  const lengthDigit = Number(ocr[ocr.length - 2]);
  return lengthDigit === ocr.length % 10;
}

/** The invoice number inside a valid OCR number, or null. */
export function referenceFromOcr(ocr: string): string | null {
  return isValidOcr(ocr) ? ocr.slice(0, -2) : null;
}
