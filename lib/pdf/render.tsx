import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { QuotePdf } from "./QuotePdf";
import { getQuoteProfile } from "../quotes/profile-store";
import type { QuoteProfile } from "../quotes/profile";
import type { Quote } from "../quotes/schema";
import { bannerSlot, coverSlot } from "../quotes/cover";
import { BAND_BOX, COVER_BOX, loadPdfPhoto } from "./photos";

/** The quote as PDF bytes, with the seller, payment details and signer of
 *  the quote's organisation (lib/quotes/profile.ts) and the cover and banner
 *  photos (lib/quotes/cover.ts) loaded first. A quote set to "no photo" gets
 *  neither. Pass the profile when the caller already has it. */
export async function renderQuotePdf(quote: Quote, profile?: QuoteProfile): Promise<Buffer> {
  const slot = coverSlot(quote.data);
  const [{ company, settings, logo }, cover, banner] = await Promise.all([
    profile ?? getQuoteProfile(quote.orgId),
    loadPdfPhoto(slot, COVER_BOX),
    slot ? loadPdfPhoto(bannerSlot(quote.data), BAND_BOX) : Promise.resolve(null),
  ]);
  return renderToBuffer(
    <QuotePdf quote={quote} company={company} settings={settings} logo={logo} photos={{ cover, banner, withCover: slot !== null }} />
  );
}

const fileSafe = (v: string, max: number) =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, max);

/** Offert-<nr>-<brand>-<customer>.pdf; brand is QuoteProfile.brand. */
export function quoteFileName(quote: Quote, brand: string): string {
  return ["Offert", String(quote.number), fileSafe(brand, 30), fileSafe(quote.data.customer.company || quote.data.customer.name, 40)].filter(Boolean).join("-") + ".pdf";
}
