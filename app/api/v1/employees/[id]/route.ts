import { apiGet, ApiProblem } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { employeeResource } from "@/lib/api/hr-resources";
import { getEmployee, listEmployments } from "@/lib/core/hr/store";
import { todayIso } from "@/lib/quotes/schema";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/employees/{id} */
export const GET = apiGet("payroll", async ({ params }) => {
  if (!UUID.test(params.id ?? "")) throw new ApiProblem("not_found", "Personen finns inte.");
  const employee = await getEmployee(params.id);
  if (!employee) throw new ApiProblem("not_found", "Personen finns inte.");
  const versions = await listEmployments(employee.id);
  return apiJson(employeeResource(employee, versions, todayIso()));
});
