import "server-only";
import { z } from "zod";
import type { Customer } from "../core/customers/schema";
import { customerToBuyer } from "../core/customers/schema";
import { getCustomer } from "../core/customers/store";
import { buyerSchema, lineForBuyer, newInvoiceDocument, type InvoiceDocument } from "../core/documents/invoice";
import type { InvoiceRecord } from "../core/invoices/store";
import { getSellerDefaults } from "../core/invoices/seller";
import { todayIso } from "../quotes/schema";
import type { customerResourceSchema, invoiceResourceSchema, InvoiceCreate } from "./schemas";
import { ApiProblem } from "./route";

/** Rows as the API returns them: the resource schemas in lib/api/schemas.ts. */

export function customerResource(c: Customer): z.infer<typeof customerResourceSchema> {
  return {
    id: c.id,
    type: c.type,
    name: c.name,
    company: c.company,
    orgNr: c.orgNr,
    vatNr: c.vatNr,
    email: c.email,
    phone: c.phone,
    street: c.street,
    postalCode: c.postalCode,
    city: c.city,
    reference: c.reference,
    peppolId: c.peppolId ?? "",
    defaultTermsDays: c.defaultTermsDays,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function invoiceResource(inv: InvoiceRecord): z.infer<typeof invoiceResourceSchema> {
  return {
    id: inv.id,
    series: inv.series,
    number: inv.number,
    kind: inv.kind,
    status: inv.status,
    customerId: inv.customerId,
    projectId: inv.projectId,
    currency: "SEK",
    totalOre: inv.totalOre,
    vatOre: inv.vatOre,
    rotOre: inv.rotOre,
    payableOre: inv.payableOre,
    paidOre: inv.paidOre,
    issuedOn: inv.issuedOn,
    dueOn: inv.dueOn,
    ocr: inv.ocr,
    sha256: inv.sha256,
    sentAt: inv.sentAt,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
    updatedAt: inv.updatedAt,
    document: inv.document,
  };
}

/**
 * A draft document from an API request: the seller and payment details from
 * the organisation's settings, the buyer from the register (or the request),
 * the lines adjusted to the buyer type (reverse charge for byggföretag),
 * exactly like a draft made in admin.
 */
export async function documentFromApi(input: InvoiceCreate): Promise<InvoiceDocument> {
  let customer: Customer | null = null;
  if (input.customerId) {
    customer = await getCustomer(input.customerId);
    if (!customer) throw new ApiProblem("not_found", "Kunden finns inte.");
  }
  const buyer = customer ? customerToBuyer(customer) : buyerSchema.parse({ ...input.buyer, customerId: null });
  const { seller, paymentMeans, lateInterestText } = await getSellerDefaults(buyer.type);
  const issueDate = input.issueDate ?? todayIso();
  const termsDays = input.termsDays ?? customer?.defaultTermsDays ?? paymentMeans.termsDays ?? 30;
  const doc = newInvoiceDocument({ issueDate, seller, buyer, paymentMeans: { ...paymentMeans, termsDays, termsText: "" } });
  return {
    ...doc,
    dueDate: input.dueDate ?? doc.dueDate,
    deliveryDate: input.deliveryDate ?? null,
    period: input.period ?? null,
    title: input.title ?? "",
    note: input.note ?? "",
    references: { ...doc.references, ...input.references },
    lines: input.lines.map((l) => lineForBuyer(l, buyer)),
    se: { ...doc.se, rot: buyer.type === "privat" ? (input.rot ?? null) : null, lateInterestText },
  };
}
