import { apiGet, apiPost, ApiProblem, parseOrThrow, queryObject } from "@/lib/api/route";
import { apiJson } from "@/lib/api/respond";
import { timeEntryCreateSchema, timeEntryListQuerySchema } from "@/lib/api/schemas";
import { timeEntryResource } from "@/lib/api/hr-resources";
import { getEmployee } from "@/lib/core/hr/store";
import { addTimeEntry, listTimeEntries } from "@/lib/core/hr/time-store";
import { timeEntryInputSchema } from "@/lib/core/hr/time-schema";

/** GET /api/v1/time-entries?from=&to=&employeeId=&projectId=&status=&limit= — time rows by work date. */
export const GET = apiGet("read", async ({ request }) => {
  const query = parseOrThrow(timeEntryListQuerySchema, queryObject(request));
  if (query.to < query.from) throw new ApiProblem("validation_error", "Anropet innehåller fel.", { to: "Sista dagen är före första." });
  const rows = (await listTimeEntries({ from: query.from, to: query.to, employeeId: query.employeeId, projectId: query.projectId })).filter((t) => !query.status || t.status === query.status);
  return apiJson({ data: rows.slice(0, query.limit).map(timeEntryResource) });
});

/**
 * POST /api/v1/time-entries — a draft time row for a person (source
 * "imported"): someone approves it in Tid before a payroll run can read it.
 * Idempotency-Key required.
 */
export const POST = apiPost("write", async ({ body }) => {
  const input = parseOrThrow(timeEntryCreateSchema, body);
  const employee = await getEmployee(input.employeeId);
  if (!employee) throw new ApiProblem("not_found", "Personen finns inte.");
  if (employee.endedAt && employee.endedAt < input.date) throw new ApiProblem("conflict", "Personen hade lämnat den dagen.");
  const parsed = timeEntryInputSchema.safeParse({
    date: input.date,
    start: input.start ?? "",
    end: input.end ?? "",
    breakMinutes: input.breakMinutes,
    hours: input.hours ?? "",
    kind: input.kind,
    projectId: input.projectId ?? "",
    note: input.note,
  });
  if (!parsed.success) throw new ApiProblem("validation_error", "Anropet innehåller fel.", Object.fromEntries(parsed.error.issues.map((i) => [i.path.join(".") || "body", i.message])));
  const id = await addTimeEntry(employee.id, parsed.data, { status: "draft", source: "imported" });
  const created = (await listTimeEntries({ from: input.date, to: input.date, employeeId: employee.id })).find((t) => t.id === id);
  if (!created) throw new ApiProblem("internal", "Tidsraden sparades men kunde inte läsas tillbaka.");
  return apiJson(timeEntryResource(created), { status: 201, headers: { location: `/api/v1/time-entries?from=${input.date}&to=${input.date}&employeeId=${employee.id}` } });
});
