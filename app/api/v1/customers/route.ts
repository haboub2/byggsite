import { apiGet, apiPost, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { customerCreateSchema, customerListQuerySchema } from "@/lib/api/schemas";
import { customerResource } from "@/lib/api/resources";
import { createCustomer, getCustomer, listCustomers } from "@/lib/core/customers/store";
import { getOrgSettings } from "@/lib/core/org/settings-store";
import { termsDaysFor } from "@/lib/core/org/settings";

/** GET /api/v1/customers?q=&limit= — the organisation's customer register, by name. */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(customerListQuerySchema, queryObject(request));
  const customers = await listCustomers(query.q);
  return apiJson({ data: customers.slice(0, query.limit).map(customerResource) });
});

/** POST /api/v1/customers — a new customer. Idempotency-Key required. */
export const POST = apiPost("write", async ({ body, actor }) => {
  const input = parseOrThrow(customerCreateSchema, body);
  const defaultTermsDays = input.defaultTermsDays ?? termsDaysFor(await getOrgSettings(), input.type);
  const id = await createCustomer({ ...input, defaultTermsDays }, `api:${actor.name}`);
  const created = await getCustomer(id);
  return apiJson(customerResource(created!), { status: 201, headers: { location: `/api/v1/customers/${id}` } });
});
