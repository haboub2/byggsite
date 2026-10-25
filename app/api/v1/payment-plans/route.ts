import { apiGet, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { paymentPlanListQuerySchema } from "@/lib/api/schemas";
import { paymentPlanResource } from "@/lib/api/mappers";
import { listPaymentPlans } from "@/lib/api/read-store";

/** GET /api/v1/payment-plans?projectId=&limit= — newest first, with their steps. */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(paymentPlanListQuerySchema, queryObject(request));
  const plans = await listPaymentPlans({ projectId: query.projectId, limit: query.limit });
  return apiJson({ data: plans.map(paymentPlanResource) });
});
