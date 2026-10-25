import { apiGet, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { paymentListQuerySchema } from "@/lib/api/schemas";
import { paymentResource } from "@/lib/api/mappers";
import { listPayments } from "@/lib/api/read-store";

/** GET /api/v1/payments?invoiceId=&from=&to=&limit= — newest payment date first, with the invoices each one is for. */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(paymentListQuerySchema, queryObject(request));
  return apiJson({ data: (await listPayments(query)).map(paymentResource) });
});
