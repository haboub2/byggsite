import { apiGet, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { absenceListQuerySchema } from "@/lib/api/schemas";
import { absenceResource } from "@/lib/api/hr-resources";
import { listAbsences } from "@/lib/core/hr/time-store";

/** GET /api/v1/absences?from=&to=&employeeId=&kind=&limit= — absences overlapping the range, oldest first. */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(absenceListQuerySchema, queryObject(request));
  const rows = (await listAbsences({ from: query.from, to: query.to, employeeId: query.employeeId })).filter((a) => !query.kind || a.kind === query.kind);
  return apiJson({ data: rows.slice(0, query.limit).map(absenceResource) });
});
