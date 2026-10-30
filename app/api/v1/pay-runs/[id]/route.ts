import { apiGet, ApiProblem } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { payRunResource } from "@/lib/api/hr-resources";
import { getRun } from "@/lib/core/payroll/run-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/pay-runs/{id} */
export const GET = apiGet("read", async ({ params }) => {
  if (!UUID.test(params.id ?? "")) throw new ApiProblem("not_found", "Körningen finns inte.");
  const run = await getRun(params.id);
  if (!run) throw new ApiProblem("not_found", "Körningen finns inte.");
  return apiJson(payRunResource(run));
});
