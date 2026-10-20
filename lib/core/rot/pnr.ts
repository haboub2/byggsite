import { MASKED_PERSONAL_NUMBER, PERSONAL_NUMBER } from "../documents/invoice";
import { toTwelveDigitPersonalNumber, type RotClaimXml } from "./claim-xml";

/**
 * Personal numbers for ROT outside the database. Since 0023 the database
 * encrypts every personal number it is given and keeps "ÅÅÅÅMMDD-XXXX" next
 * to the ciphertext; only owner/admin can open it (invoice_buyer_pnr,
 * rot_buyer_pnr). Demo mode has no database and keeps plain text, so every
 * screen and the PDF go through maskPersonalNumber.
 */

/** "850412-1234" → "19850412-XXXX". Already masked: unchanged. Empty or malformed: "". */
export function maskPersonalNumber(value: string, today: string): string {
  const v = value.trim();
  if (MASKED_PERSONAL_NUMBER.test(v)) return v;
  if (!PERSONAL_NUMBER.test(v)) return "";
  return `${toTwelveDigitPersonalNumber(v, today).slice(0, 8)}-XXXX`;
}

/** "198504121234" → "19850412-1234", for showing an opened number to owner/admin. */
export function formatPersonalNumber(twelveDigits: string): string {
  return /^\d{12}$/.test(twelveDigits) ? `${twelveDigits.slice(0, 8)}-${twelveDigits.slice(8)}` : twelveDigits;
}

/**
 * The claim with masked numbers given 0000 as the last four, so that the
 * rest of the file can be checked on the page without opening any number.
 * Only for validateRotClaim: renderRotClaimXml refuses masked numbers, and
 * the file is always built from the opened ones.
 */
export function withPlaceholderPersonalNumbers(claim: RotClaimXml): RotClaimXml {
  return { ...claim, items: claim.items.map((it) => (MASKED_PERSONAL_NUMBER.test(it.personalNumber) ? { ...it, personalNumber: `${it.personalNumber.slice(0, 8)}0000` } : it)) };
}
