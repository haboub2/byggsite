import { apiGet, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { payRunListQuerySchema } from "@/lib/api/schemas";
import { payRunResource } from "@/lib/api/hr-resources";
import { listRuns } from "@/lib/core/payroll/run-store";

/** GET /api/v1/pay-runs?status=&year=&limit= — the payroll runs, newest month first. Read only: the run is driven in admin. */
export const GET = apiGet("payroll", async ({ request }) => {
  const query = parseOrThrow(payRunListQuerySchema, queryObject(request));
  const runs = (await listRuns()).filter((r) => (!query.status || r.status === query.status) && (!query.year || r.periodStart.startsWith(`${query.year}-`)));
  return apiJson({ data: runs.slice(0, query.limit).map(payRunResource) });
});
