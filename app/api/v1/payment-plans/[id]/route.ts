import { apiGet, ApiProblem } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { paymentPlanResource } from "@/lib/api/mappers";
import { listPaymentPlans } from "@/lib/api/read-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/payment-plans/{id} */
export const GET = apiGet("read", async ({ params }) => {
  const [plan] = UUID.test(params.id ?? "") ? await listPaymentPlans({ id: params.id, limit: 1 }) : [];
  if (!plan) throw new ApiProblem("not_found", "Betalplanen finns inte.");
  return apiJson(paymentPlanResource(plan));
});
