import { apiPost, ApiProblem } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { invoiceResource } from "@/lib/api/resources";
import { getInvoice, issueInvoice, IssueError } from "@/lib/core/invoices/store";
import { applySellerDefaults, getSellerDefaults } from "@/lib/core/invoices/seller";
import { loadInvoice } from "../load";

/**
 * POST /api/v1/invoices/{id}/issue — utfärda: number from the series, frozen
 * document, OCR, journal entry, event invoice.issued (and its webhooks), in
 * one transaction. 422 with the reasons when the draft is not complete.
 */
export const POST = apiPost("write", async ({ params, actor }) => {
  const inv = await loadInvoice(params.id);
  const defaults = await getSellerDefaults(inv.document.buyer.type);
  try {
    const { number, ocr } = await issueInvoice(inv.id, actor, (doc) => applySellerDefaults(doc, defaults));
    return apiJson({ number, ocr, invoice: invoiceResource((await getInvoice(inv.id))!) });
  } catch (err) {
    if (err instanceof IssueError) throw new ApiProblem("validation_error", "Fakturan kan inte utfärdas än.", { problems: err.problems });
    throw err;
  }
});
