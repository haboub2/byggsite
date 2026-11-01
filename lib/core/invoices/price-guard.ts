import { lineAmount, type Ore } from "../money";
import { consumerPriceCeiling } from "../../quotes/math";
import type { CustomerType, InvoiceDocument } from "../documents/invoice";
import type { Quote } from "../../quotes/schema";

/**
 * Konsumenttjänstlagen 36 § for invoices made from a quote to a private
 * person: a fast pris may not be exceeded, an ungefärlig prisuppgift by at
 * most 15 %, apart from ÄTA the customer approved (lines with a change
 * order, or the issuer confirming that the customer approved the extra).
 * Löpande räkning has no ceiling. Pure; app/admin/invoice-actions.ts calls
 * it before an invoice is issued.
 */

export type GuardInvoice = { id: string; kind: string; status: string; document: { lines: InvoiceDocument["lines"]; buyer: { type: CustomerType } } };

/** Gross (incl. VAT) of the lines that are not ÄTA, öre. */
export function nonAtaGrossOre(doc: Pick<InvoiceDocument, "lines">): Ore {
  let sum = 0;
  for (const l of doc.lines) {
    if (l.changeOrderId) continue;
    const net = lineAmount(l.unitPriceOre, l.quantity);
    sum += Math.round(net * (1 + l.vatRate / 100));
  }
  return sum;
}

export function consumerPriceProblem(input: {
  quote: Pick<Quote, "number" | "data">;
  /** Every invoice on the quote, the one being issued included. Drafts other than it and voided ones are ignored. */
  invoices: readonly GuardInvoice[];
  issuingId: string;
  /** The issuer confirmed that the customer approved the extra work (ÄTA). */
  ataApproved: boolean;
}): string | null {
  const { quote } = input;
  if (quote.data.customer.type !== "privat") return null;
  const ceilingKronor = consumerPriceCeiling(quote.data);
  if (ceilingKronor === null) return null;
  const counted = input.invoices.filter((i) => i.id === input.issuingId || (i.status !== "draft" && i.status !== "void"));
  let invoicedOre = 0;
  for (const i of counted) {
    const gross = nonAtaGrossOre(i.document);
    invoicedOre += i.kind === "credit" ? -Math.abs(gross) : gross;
  }
  const ceilingOre = ceilingKronor * 100;
  if (invoicedOre <= ceilingOre || input.ataApproved) return null;
  const kr = (ore: Ore) => `${Math.round(ore / 100).toLocaleString("sv-SE").replace(/[  ]/g, " ")} kr`;
  const kind = quote.data.priceType === "ungefarlig" ? `offertens ungefärliga pris plus 15 % (${kr(ceilingOre)}, konsumenttjänstlagen 36 §)` : `offertens fasta pris (${kr(ceilingOre)})`;
  return `Fakturorna på offert ${quote.number} blir ${kr(invoicedOre)} inkl. moms, mer än ${kind}. Tillägg får bara faktureras som ÄTA kunden godkänt: kryssa i att kunden godkänt tillägget för att utfärda ändå.`;
}
