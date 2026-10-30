import { apiGet, ApiProblem } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { payslipResource } from "@/lib/api/hr-resources";
import { getPayslip } from "@/lib/core/payroll/run-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/payslips/{id} */
export const GET = apiGet("payroll", async ({ params }) => {
  if (!UUID.test(params.id ?? "")) throw new ApiProblem("not_found", "Lönebeskedet finns inte.");
  const slip = await getPayslip(params.id);
  if (!slip) throw new ApiProblem("not_found", "Lönebeskedet finns inte.");
  return apiJson(payslipResource(slip));
});
