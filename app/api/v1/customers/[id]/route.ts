import { apiGet, ApiProblem } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { customerResource } from "@/lib/api/resources";
import { getCustomer } from "@/lib/core/customers/store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/customers/{id} */
export const GET = apiGet("read", async ({ params }) => {
  if (!UUID.test(params.id ?? "")) throw new ApiProblem("not_found", "Kunden finns inte.");
  const customer = await getCustomer(params.id);
  if (!customer) throw new ApiProblem("not_found", "Kunden finns inte.");
  return apiJson(customerResource(customer));
});
