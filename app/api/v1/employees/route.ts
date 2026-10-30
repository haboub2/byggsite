import { apiGet, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { employeeListQuerySchema } from "@/lib/api/schemas";
import { employeeResource } from "@/lib/api/hr-resources";
import { listEmployees, listEmployments } from "@/lib/core/hr/store";
import { todayIso } from "@/lib/quotes/schema";

/**
 * GET /api/v1/employees?q=&includeEnded=&limit= — the organisation's
 * people with the employment in force today. Personnummer are masked;
 * bank accounts, addresses and notes never leave through the API.
 */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(employeeListQuerySchema, queryObject(request));
  const today = todayIso();
  const [employees, versions] = await Promise.all([listEmployees(), listEmployments()]);
  const q = query.q?.toLowerCase();
  const rows = employees
    .filter((e) => query.includeEnded || !e.endedAt || e.endedAt >= today)
    .filter((e) => !q || e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q))
    .slice(0, query.limit);
  return apiJson({ data: rows.map((e) => employeeResource(e, versions, today)) });
});
