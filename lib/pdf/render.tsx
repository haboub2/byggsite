import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { QuotePdf } from "./QuotePdf";
import { getContent } from "../content/store";
import type { Quote } from "../quotes/schema";
import { site } from "../placeholder";
import { bannerSlot, coverSlot } from "../quotes/cover";
import { BAND_BOX, COVER_BOX, loadPdfPhoto } from "./photos";

/** The quote as PDF bytes, with the company details as saved in /admin and
 *  the cover and banner photos (lib/quotes/cover.ts) loaded first. A quote
 *  set to "no photo" gets neither. */
export async function renderQuotePdf(quote: Quote): Promise<Buffer> {
  const slot = coverSlot(quote.data);
  const [{ company, quote: settings }, cover, banner] = await Promise.all([
    getContent(),
    loadPdfPhoto(slot, COVER_BOX),
    slot ? loadPdfPhoto(bannerSlot(quote.data), BAND_BOX) : Promise.resolve(null),
  ]);
  return renderToBuffer(
    <QuotePdf quote={quote} company={company} settings={settings} photos={{ cover, banner, withCover: slot !== null }} />
  );
}

export function quoteFileName(quote: Quote): string {
  const who = (quote.data.customer.company || quote.data.customer.name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return `Offert-${quote.number}-${site.brand}${who ? `-${who}` : ""}.pdf`;
}
