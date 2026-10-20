import { apiGet, apiPost, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { invoiceCreateSchema, invoiceListQuerySchema } from "@/lib/api/schemas";
import { documentFromApi, invoiceResource } from "@/lib/api/resources";
import { createInvoice, getInvoice, listInvoices } from "@/lib/core/invoices/store";

/** GET /api/v1/invoices?status=&tab=&customerId=&q=&limit= — newest first. */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(invoiceListQuerySchema, queryObject(request));
  const invoices = (await listInvoices({ tab: query.tab, customerId: query.customerId, q: query.q })).filter((inv) => !query.status || inv.status === query.status);
  return apiJson({ data: invoices.slice(0, query.limit).map(invoiceResource) });
});

/**
 * POST /api/v1/invoices — a draft from lines and a customer. Seller, payment
 * details and terms come from the organisation's settings. Issue it with
 * POST /invoices/{id}/issue. Idempotency-Key required.
 */
export const POST = apiPost("write", async ({ body, actor }) => {
  const input = parseOrThrow(invoiceCreateSchema, body);
  const document = await documentFromApi(input);
  const id = await createInvoice({ document, projectId: document.references.projectId }, `api:${actor.name}`);
  const created = await getInvoice(id);
  return apiJson(invoiceResource(created!), { status: 201, headers: { location: `/api/v1/invoices/${id}` } });
});
