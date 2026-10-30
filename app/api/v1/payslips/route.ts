import { apiGet, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { payslipListQuerySchema } from "@/lib/api/schemas";
import { payslipResource } from "@/lib/api/hr-resources";
import { listRunPayslips, listRuns } from "@/lib/core/payroll/run-store";

/**
 * GET /api/v1/payslips?runId=&employeeId=&period=&limit= — payslips, the
 * frozen approved ones and the computed drafts (status says which),
 * newest pay date first. Without runId or period: the twelve latest runs.
 */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(payslipListQuerySchema, queryObject(request));
  let runs = await listRuns();
  if (query.runId) runs = runs.filter((r) => r.id === query.runId);
  if (query.period) runs = runs.filter((r) => r.periodStart.startsWith(query.period as string));
  if (!query.runId && !query.period) runs = runs.slice(0, 12);
  const slips = (await Promise.all(runs.map((r) => listRunPayslips(r.id)))).flat().filter((s) => !query.employeeId || s.employeeId === query.employeeId);
  slips.sort((a, b) => b.document.payDate.localeCompare(a.document.payDate) || a.document.employeeName.localeCompare(b.document.employeeName, "sv"));
  return apiJson({ data: slips.slice(0, query.limit).map(payslipResource) });
});
