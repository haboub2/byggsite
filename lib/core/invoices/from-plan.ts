import "server-only";
import { invoiceDocumentSchema, newInvoiceDocument, type InvoiceDocument, type InvoiceLine } from "../documents/invoice";
import { buyerFromQuote, lineFromQuoteItem, rotBuyersFromQuote } from "./from-quote";
import { kindTotals, stepInvoiceLines, type ChangeOrderLike } from "../plans/billing";
import type { PaymentPlan, PaymentPlanStep } from "../plans/schema";
import { getSellerDefaults } from "./seller";
import { listInvoices } from "./store";
import type { Quote } from "../../quotes/schema";
import type { PortalProject } from "../../portal/schema";
import { lineAmount } from "../money";

/** The quote's lines as invoice lines (net öre), the base every step is a share of. */
export function quoteInvoiceLines(quote: Quote): InvoiceLine[] {
  return quote.data.items.map((item) => lineFromQuoteItem(item, quote.data.pricesInclVat));
}

/**
 * The draft for one step of a project's payment plan. Earlier step invoices
 * (issued, not credited) decide what the completion step has left to take.
 */
export async function invoiceDocumentForStep(input: {
  project: PortalProject;
  plan: PaymentPlan;
  step: PaymentPlanStep;
  quote: Quote;
  customerId: string | null;
  changeOrders: ChangeOrderLike[];
  issueDate: string;
}): Promise<{ document: InvoiceDocument; changeOrderIds: string[] }> {
  const { seller, paymentMeans, lateInterestText } = await getSellerDefaults();
  const { project, plan, step, quote } = input;
  const quoteLines = quoteInvoiceLines(quote);
  const stepIndex = plan.steps.findIndex((s) => s.id === step.id);

  // What the earlier steps already invoiced, per kind, from their issued invoices.
  const earlier = await listInvoices({ projectId: project.id });
  const invoicedByKind = { labor: 0, material: 0, other: 0 };
  for (const inv of earlier) {
    if (inv.status === "draft" || inv.status === "void" || inv.status === "credited" || inv.kind === "credit") continue;
    for (const l of inv.document.lines) if (!l.changeOrderId) invoicedByKind[l.kind] += lineAmount(l.unitPriceOre, l.quantity);
  }

  const lines = stepInvoiceLines({ step, stepIndex, stepCount: plan.steps.length, quoteLines, quoteNumber: quote.number, invoicedByKind, changeOrders: input.changeOrders });
  const buyer = buyerFromQuote(quote, input.customerId);
  const doc = newInvoiceDocument({ issueDate: input.issueDate, seller, buyer, paymentMeans: { ...paymentMeans, termsDays: quote.data.paymentDays ?? paymentMeans.termsDays ?? 30 } });
  doc.title = `${quote.data.title || project.title}${step.dueRule === "on_completion" ? ", slutfaktura" : `, ${step.label.toLowerCase()}`}`;
  doc.note = `Enligt offert ${quote.number}, betalplan steg ${stepIndex + 1} av ${plan.steps.length}: ${step.label}.${step.dueRule === "on_completion" && lines.some((l) => l.changeOrderId) ? " Godkända ändringar (ÄTA) ingår som egna rader." : ""}`;
  doc.references.quoteNumber = quote.number;
  doc.references.projectId = project.id;
  doc.references.planStep = { step: stepIndex + 1, of: plan.steps.length };
  doc.lines = lines;
  doc.se.lateInterestText = lateInterestText;
  if (quote.data.rot && buyer.type === "privat" && quote.data.division === "bygg" && kindTotals(lines).labor !== 0) {
    doc.se.rot = { buyers: rotBuyersFromQuote(quote.data), property: null, deductionOre: null };
  }
  return { document: invoiceDocumentSchema.parse(doc), changeOrderIds: [...new Set(lines.flatMap((l) => (l.changeOrderId ? [l.changeOrderId] : [])))] };
}
