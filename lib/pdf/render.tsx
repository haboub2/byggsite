import "server-only";
import { renderToBuffer } from "@react-pdf/renderer";
import { QuotePdf } from "./QuotePdf";
import { getContent } from "../content/store";
import type { Quote } from "../quotes/schema";
import { site } from "../placeholder";

/** The quote as PDF bytes, with the company details as saved in /admin. */
export async function renderQuotePdf(quote: Quote): Promise<Buffer> {
  const { company, quote: settings } = await getContent();
  return renderToBuffer(<QuotePdf quote={quote} company={company} settings={settings} />);
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
