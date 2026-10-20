import { kronorToOre, splitGross } from "../money";
import {
  invoiceDocumentSchema,
  newInvoiceDocument,
  type Buyer,
  type InvoiceDocument,
  type InvoiceLine,
  type RotBuyer,
  type Seller,
} from "../documents/invoice";
import type { Quote, RotPerson } from "../../quotes/schema";
import type { paymentMeansSchema } from "../documents/invoice";
import type { z } from "zod";

/**
 * Offert → fakturautkast. The quote is the source of the lines, the buyer,
 * the ROT persons and the title; the seller and the payment details come
 * from the organisation's settings. Quote prices are kronor, typed incl. or
 * excl. VAT; the document stores net öre, so each unit price is converted
 * once here.
 */

export type PaymentMeansInput = Partial<z.input<typeof paymentMeansSchema>>;

export function lineFromQuoteItem(item: Quote["data"]["items"][number], pricesInclVat: boolean): InvoiceLine {
  const unitKronor = Number(item.unitPrice) || 0;
  const unitGrossOrNet = kronorToOre(unitKronor);
  const unitPriceOre = pricesInclVat ? splitGross(unitGrossOrNet, item.vatRate).net : unitGrossOrNet;
  return {
    id: item.id,
    description: item.description,
    quantity: Number(item.qty) || 0,
    unit: item.unit || "st",
    unitPriceOre,
    vatCategory: item.vatRate === 0 ? "E" : "S",
    vatRate: item.vatRate,
    kind: item.kind,
    section: (item as { section?: string }).section ?? "",
    changeOrderId: null,
  };
}

/**
 * The quote's ROT persons as the invoice's buyers. Since 0024 a stored quote
 * holds ÅÅÅÅMMDD-XXXX and the ciphertext; both are copied as they are, and
 * the invoice trigger (0023) leaves a masked number with ciphertext alone.
 * Demo mode copies plain text, which the invoice then holds as well.
 */
export function rotBuyersFromQuote(d: Quote["data"]): RotBuyer[] {
  const persons: RotPerson[] = d.rotPersons.length > 0 ? d.rotPersons : [{ name: d.customer.name, personalNumber: "" }];
  return persons.map((p, i) => ({
    name: p.name || (i === 0 ? d.customer.name : ""),
    personalNumber: p.personalNumber ?? "",
    ...(p.personalNumberSealed ? { personalNumberSealed: p.personalNumberSealed } : {}),
    roomOre: null,
  }));
}

export function buyerFromQuote(quote: Quote, customerId: string | null): Buyer {
  const c = quote.data.customer;
  const business = c.type === "foretag";
  return {
    type: business ? "foretag" : "privat",
    customerId,
    name: business && c.company ? c.company : c.name,
    orgNr: business ? c.orgNr : "",
    vatNr: "",
    street: c.street,
    postalCode: c.postalCode,
    city: c.city,
    countryCode: "SE",
    email: c.email,
    phone: c.phone,
    reference: business ? c.reference || c.name : "",
  };
}

export function invoiceDocumentFromQuote(input: {
  quote: Quote;
  seller: Seller;
  paymentMeans: PaymentMeansInput;
  issueDate: string;
  customerId: string | null;
  lateInterestText?: string;
}): InvoiceDocument {
  const { quote } = input;
  const d = quote.data;
  const buyer = buyerFromQuote(quote, input.customerId);
  const doc = newInvoiceDocument({
    issueDate: input.issueDate,
    seller: input.seller,
    buyer,
    paymentMeans: { ...input.paymentMeans, termsDays: d.paymentDays ?? input.paymentMeans.termsDays ?? 30 },
  });
  doc.title = d.title;
  doc.note = `Enligt offert ${quote.number}.`;
  doc.references.quoteNumber = quote.number;
  doc.lines = d.items.map((item) => lineFromQuoteItem(item, d.pricesInclVat));
  doc.se.lateInterestText = input.lateInterestText ?? "";
  if (d.rot && buyer.type === "privat" && d.division === "bygg") {
    doc.se.rot = { buyers: rotBuyersFromQuote(d), property: null, deductionOre: null };
  }
  return invoiceDocumentSchema.parse(doc);
}
