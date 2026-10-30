import { apiGet, ApiProblem } from "@/lib/api/route";
import { getPayslip, readPayslipPdf } from "@/lib/core/payroll/run-store";
import { payslipFileName } from "@/lib/pdf/render-payslip";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/v1/payslips/{id}/pdf — the frozen PDF of an approved payslip, checked against its hash. */
export const GET = apiGet("read", async ({ params }) => {
  if (!UUID.test(params.id ?? "")) throw new ApiProblem("not_found", "Lönebeskedet finns inte.");
  const slip = await getPayslip(params.id);
  if (!slip) throw new ApiProblem("not_found", "Lönebeskedet finns inte.");
  if (!slip.approvedAt || !slip.pdfPath) throw new ApiProblem("conflict", "Lönebeskedet är inte godkänt än, så det har ingen fryst PDF.");
  const pdf = await readPayslipPdf(slip);
  return new Response(new Uint8Array(pdf), {
    headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${payslipFileName(slip)}"`, "cache-control": "no-store" },
  });
});
