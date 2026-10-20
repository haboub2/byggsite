import { apiPost, parseOrThrow } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { paymentCreateSchema } from "@/lib/api/schemas";
import { invoiceResource } from "@/lib/api/resources";
import { getInvoice, registerPayment } from "@/lib/core/invoices/store";
import { loadInvoice } from "../load";

/** POST /api/v1/invoices/{id}/payments — register a payment (negative = refund). Booked 1930/1510. */
export const POST = apiPost("write", async ({ params, body, actor }) => {
  const inv = await loadInvoice(params.id);
  const input = parseOrThrow(paymentCreateSchema, body);
  const result = await registerPayment(inv.id, input, actor);
  return apiJson({ status: result.status, paidOre: result.paidOre, invoice: invoiceResource((await getInvoice(inv.id))!) }, { status: 201 });
});
