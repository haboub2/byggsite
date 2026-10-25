import "server-only";
import type { Customer } from "../core/customers/schema";
import { customerToBuyer } from "../core/customers/schema";
import { getCustomer } from "../core/customers/store";
import { buyerSchema, lineForBuyer, newInvoiceDocument, type InvoiceDocument } from "../core/documents/invoice";
import { getSellerDefaults } from "../core/invoices/seller";
import { todayIso } from "../quotes/schema";
import type { InvoiceCreate } from "./schemas";
import { ApiProblem } from "./route";

export { customerResource, invoiceResource } from "./mappers";

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
